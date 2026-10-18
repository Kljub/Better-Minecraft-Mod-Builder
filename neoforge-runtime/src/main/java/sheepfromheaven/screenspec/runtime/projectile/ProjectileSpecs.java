package sheepfromheaven.screenspec.runtime.projectile;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.stats.Stats;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.neoforge.event.BuildCreativeModeTabContentsEvent;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

/**
 * Registers each {@link ProjectileSpec} as a {@link SpecProjectile} entity type (snowball-sized)
 * plus the item that throws it — right-click like a snowball ({@code SnowballItem#use}). Rendering
 * is vanilla's {@code ThrownItemRenderer}, i.e. the projectile looks like its item icon (see
 * {@link ProjectileSpecsClient}). Internal — called by
 * {@link sheepfromheaven.screenspec.runtime.ModElements}.
 */
public final class ProjectileSpecs {
    private ProjectileSpecs() {}

    public record Registered(ProjectileSpec spec, DeferredHolder<EntityType<?>, EntityType<SpecProjectile>> type) {}

    public static void register(String modId, IEventBus modBus, List<ProjectileSpec> specs) {
        if (specs.isEmpty()) return;
        DeferredRegister.Entities entities = DeferredRegister.createEntities(modId);
        DeferredRegister.Items items = DeferredRegister.createItems(modId);
        List<Registered> registered = new ArrayList<>();
        List<DeferredItem<Item>> tabItems = new ArrayList<>();

        for (ProjectileSpec spec : specs) {
            @SuppressWarnings("unchecked")
            DeferredItem<Item>[] item = new DeferredItem[1];
            Supplier<Item> itemRef = () -> item[0].get();
            DeferredHolder<EntityType<?>, EntityType<SpecProjectile>> type = entities.registerEntityType(spec.id,
                (t, level) -> {
                    // Wired here, right before construction (client and server), so it's set before
                    // vanilla's constructor asks for the default item — no registry-order assumption.
                    SpecProjectile.configure(t, spec, itemRef);
                    return new SpecProjectile(t, level);
                }, MobCategory.MISC,
                b -> b.noLootTable().sized(0.25F, 0.25F).clientTrackingRange(4).updateInterval(10));
            item[0] = items.registerItem(spec.id, p -> new ThrowItem(p, spec, type, itemRef),
                () -> new Item.Properties().stacksTo(Math.max(1, Math.min(99, spec.stackSize))));
            tabItems.add(item[0]);
            registered.add(new Registered(spec, type));
        }
        entities.register(modBus);
        items.register(modBus);

        modBus.addListener(BuildCreativeModeTabContentsEvent.class, event -> {
            if (event.getTabKey() != CreativeModeTabs.COMBAT) return;
            for (DeferredItem<Item> i : tabItems) event.accept(i.get());
        });
        if (FMLEnvironment.getDist() == Dist.CLIENT) ProjectileSpecsClient.register(modBus, registered);
    }

    /** {@code SnowballItem#use} with the spec's speed/spread/cooldown. */
    private static final class ThrowItem extends Item {
        private final ProjectileSpec spec;
        private final Supplier<EntityType<SpecProjectile>> type;

        private final Supplier<Item> self;

        ThrowItem(Item.Properties properties, ProjectileSpec spec, Supplier<EntityType<SpecProjectile>> type, Supplier<Item> self) {
            super(properties);
            this.spec = spec;
            this.type = type;
            this.self = self;
        }

        @Override
        public InteractionResult use(Level level, Player player, InteractionHand hand) {
            ItemStack stack = player.getItemInHand(hand);
            level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.SNOWBALL_THROW, SoundSource.NEUTRAL,
                0.5F, 0.4F / (level.getRandom().nextFloat() * 0.4F + 0.8F));
            if (level instanceof ServerLevel serverLevel) {
                Projectile.spawnProjectileFromRotation(
                    (lvl, owner, s) -> {
                        SpecProjectile.configure(type.get(), spec, self);
                        return new SpecProjectile(type.get(), owner, lvl, s);
                    },
                    serverLevel, stack, player, 0.0F, Math.max(0.05F, spec.speed), Math.max(0F, spec.inaccuracy));
            }
            if (spec.cooldown > 0) player.getCooldowns().addCooldown(stack, spec.cooldown);
            player.awardStat(Stats.ITEM_USED.get(this));
            stack.consume(1, player);
            return InteractionResult.SUCCESS;
        }
    }
}
