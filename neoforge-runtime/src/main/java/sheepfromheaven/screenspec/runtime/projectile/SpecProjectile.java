package sheepfromheaven.screenspec.runtime.projectile;

import net.minecraft.core.Holder;
import net.minecraft.core.particles.ItemParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.throwableitemprojectile.ThrowableItemProjectile;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemStackTemplate;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.neoforged.neoforge.registries.DeferredHolder;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * One configurable thrown projectile — {@link net.minecraft.world.entity.projectile.throwableitemprojectile.Snowball}'s
 * structure (item-backed, item-break particles on impact) with the spec's damage, fire, effect,
 * explosion and gravity. Rendered client-side by vanilla's {@code ThrownItemRenderer} as its item.
 */
public class SpecProjectile extends ThrowableItemProjectile {
    /** Per entity type, since vanilla's constructor already calls {@link #getDefaultItem()} (via
     * defineSynchedData) before a subclass could have set its own fields — but after the type is set. */
    private static final Map<EntityType<?>, Config> CONFIGS = new ConcurrentHashMap<>();

    record Config(ProjectileSpec spec, Supplier<? extends Item> item) {}

    static void configure(EntityType<?> type, ProjectileSpec spec, Supplier<? extends Item> item) {
        CONFIGS.putIfAbsent(type, new Config(spec, item));
    }

    public SpecProjectile(EntityType<? extends SpecProjectile> type, Level level) {
        super(type, level);
    }

    public SpecProjectile(EntityType<? extends SpecProjectile> type, LivingEntity owner, Level level, ItemStack stack) {
        super(type, owner, level, stack);
    }

    private Config config() {
        Config c = CONFIGS.get(getType());
        if (c == null) throw new IllegalStateException("No ProjectileSpec for " + getType());
        return c;
    }

    @Override
    protected Item getDefaultItem() {
        return config().item().get();
    }

    @Override
    protected double getDefaultGravity() {
        return config().spec().gravity;
    }

    @Override
    public void handleEntityEvent(byte id) {
        if (id == 3) {
            ItemStack stack = getItem();
            for (int i = 0; i < 8; i++) {
                level().addParticle(stack.isEmpty() ? ParticleTypes.POOF : new ItemParticleOption(ParticleTypes.ITEM, ItemStackTemplate.fromNonEmptyStack(stack)),
                    getX(), getY(), getZ(), 0.0, 0.0, 0.0);
            }
        }
    }

    @Override
    protected void onHitEntity(EntityHitResult hitResult) {
        super.onHitEntity(hitResult);
        if (!(level() instanceof ServerLevel serverLevel)) return;
        ProjectileSpec spec = config().spec();
        Entity target = hitResult.getEntity();
        if (spec.damage > 0) target.hurtServer(serverLevel, damageSources().thrown(this, getOwner()), spec.damage);
        if (spec.fireSeconds > 0) target.igniteForSeconds(spec.fireSeconds);
        if (target instanceof LivingEntity living && spec.effect != null && !spec.effect.isBlank()) {
            Holder<MobEffect> effect = DeferredHolder.create(Registries.MOB_EFFECT, Identifier.parse(spec.effect));
            if (effect.isBound()) {
                living.addEffect(new MobEffectInstance(effect, Math.max(1, spec.effectSeconds) * 20, Math.max(0, spec.effectAmplifier)), getEffectSource());
            }
        }
    }

    @Override
    protected void onHit(HitResult hitResult) {
        super.onHit(hitResult);
        if (!(level() instanceof ServerLevel serverLevel)) return;
        ProjectileSpec spec = config().spec();
        if (spec.explosionPower > 0) {
            serverLevel.explode(this, getX(), getY(), getZ(), spec.explosionPower,
                spec.explosionBreaksBlocks ? Level.ExplosionInteraction.MOB : Level.ExplosionInteraction.NONE);
        }
        serverLevel.broadcastEntityEvent(this, (byte) 3);
        discard();
    }
}
