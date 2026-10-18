package sheepfromheaven.screenspec.runtime.entity;

import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.level.levelgen.Heightmap;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.neoforge.event.BuildCreativeModeTabContentsEvent;
import net.neoforged.neoforge.event.entity.EntityAttributeCreationEvent;
import net.neoforged.neoforge.event.entity.RegisterSpawnPlacementsEvent;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Registers the custom mobs of one mod ({@code elements/entities.json}): one real {@link
 * EntityType} per spec (a {@link SpecMonster} for the monster category, else a {@link SpecMob}),
 * its attributes, spawn egg (in the Spawn Eggs tab), spawn placement rules for natural spawning
 * (the biome modifier itself is datapack JSON the webapp exports), and — on the client — its
 * model, animations and renderer ({@link sheepfromheaven.screenspec.runtime.entity.client.EntitySpecsClient}).
 */
public final class EntitySpecs {
    private EntitySpecs() {}

    public static void register(String modId, IEventBus modBus, List<EntitySpec> specs) {
        List<EntitySpec> valid = new ArrayList<>();
        for (EntitySpec s : specs) if (s != null && s.id != null && !s.id.isBlank()) valid.add(s);
        if (valid.isEmpty()) return;

        DeferredRegister<EntityType<?>> types = DeferredRegister.create(Registries.ENTITY_TYPE, modId);
        DeferredRegister.Items items = DeferredRegister.createItems(modId);
        Map<String, DeferredHolder<EntityType<?>, ? extends EntityType<? extends Mob>>> registered = new LinkedHashMap<>();
        List<DeferredItem<Item>> eggs = new ArrayList<>();

        for (EntitySpec spec : valid) {
            MobCategory category = category(spec.mobCategory);
            ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, Identifier.fromNamespaceAndPath(modId, spec.id));
            float w = Math.max(0.1f, spec.hitboxWidth), h = Math.max(0.1f, spec.hitboxHeight);
            DeferredHolder<EntityType<?>, ? extends EntityType<? extends Mob>> holder = category == MobCategory.MONSTER
                ? types.register(spec.id, () -> build(EntityType.Builder.<SpecMonster>of((t, level) -> new SpecMonster(t, level, spec), category), w, h, spec.fireImmune, key))
                : types.register(spec.id, () -> build(EntityType.Builder.<SpecMob>of((t, level) -> new SpecMob(t, level, spec), category), w, h, spec.fireImmune, key));
            registered.put(spec.id, holder);
            if (spec.spawnEgg) {
                eggs.add(items.register(spec.id + "_spawn_egg", () -> new SpawnEggItem(new Item.Properties()
                    .setId(ResourceKey.create(Registries.ITEM, Identifier.fromNamespaceAndPath(modId, spec.id + "_spawn_egg")))
                    .spawnEgg(holder.get()))));
            }
        }
        types.register(modBus);
        items.register(modBus);

        modBus.addListener(EntityAttributeCreationEvent.class, event -> {
            for (EntitySpec spec : valid) {
                var type = registered.get(spec.id);
                event.put(type.get(), Mob.createMobAttributes()
                    .add(Attributes.MAX_HEALTH, Math.max(1, spec.maxHealth))
                    .add(Attributes.MOVEMENT_SPEED, "stationary".equals(spec.behavior) ? 0 : Math.max(0, spec.movementSpeed))
                    .add(Attributes.ATTACK_DAMAGE, Math.max(0, spec.attackDamage))
                    .add(Attributes.ARMOR, Math.max(0, spec.armor))
                    .add(Attributes.KNOCKBACK_RESISTANCE, Math.max(0, Math.min(1, spec.knockbackResistance)))
                    .add(Attributes.FOLLOW_RANGE, Math.max(1, spec.followRange))
                    .build());
            }
        });

        if (!eggs.isEmpty()) {
            modBus.addListener(BuildCreativeModeTabContentsEvent.class, event -> {
                if (event.getTabKey() == CreativeModeTabs.SPAWN_EGGS) for (DeferredItem<Item> egg : eggs) event.accept(egg.get());
            });
        }

        modBus.addListener(RegisterSpawnPlacementsEvent.class, event -> {
            for (EntitySpec spec : valid) {
                if (!spec.naturalSpawn) continue;
                registerPlacement(event, registered.get(spec.id).get(), category(spec.mobCategory));
            }
        });

        if (FMLEnvironment.getDist() == Dist.CLIENT) {
            sheepfromheaven.screenspec.runtime.entity.client.EntitySpecsClient.register(modId, modBus, valid);
        }
    }

    @SuppressWarnings("unchecked")
    private static void registerPlacement(RegisterSpawnPlacementsEvent event, EntityType<? extends Mob> type, MobCategory category) {
        if (category == MobCategory.MONSTER) {
            event.register((EntityType<SpecMonster>) type, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                Monster::checkMonsterSpawnRules, RegisterSpawnPlacementsEvent.Operation.REPLACE);
        } else if (category == MobCategory.WATER_CREATURE || category == MobCategory.WATER_AMBIENT) {
            event.register((EntityType<SpecMob>) type, SpawnPlacementTypes.IN_WATER, Heightmap.Types.OCEAN_FLOOR,
                (t, level, reason, pos, random) -> level.getFluidState(pos).is(FluidTags.WATER), RegisterSpawnPlacementsEvent.Operation.REPLACE);
        } else {
            event.register((EntityType<SpecMob>) type, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                Mob::checkMobSpawnRules, RegisterSpawnPlacementsEvent.Operation.REPLACE);
        }
    }

    private static <T extends Mob> EntityType<T> build(EntityType.Builder<T> builder, float w, float h, boolean fireImmune, ResourceKey<EntityType<?>> key) {
        builder = builder.sized(w, h).clientTrackingRange(8);
        if (fireImmune) builder = builder.fireImmune();
        return builder.build(key);
    }

    public static MobCategory category(String key) {
        return switch (key == null ? "creature" : key) {
            case "monster" -> MobCategory.MONSTER;
            case "ambient" -> MobCategory.AMBIENT;
            case "water_creature" -> MobCategory.WATER_CREATURE;
            case "water_ambient" -> MobCategory.WATER_AMBIENT;
            case "misc" -> MobCategory.MISC;
            default -> MobCategory.CREATURE;
        };
    }
}
