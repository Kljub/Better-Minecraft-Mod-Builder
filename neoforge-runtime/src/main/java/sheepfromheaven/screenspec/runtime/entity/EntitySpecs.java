package sheepfromheaven.screenspec.runtime.entity;

import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.monster.Creeper;
import net.minecraft.world.entity.monster.skeleton.AbstractSkeleton;
import net.minecraft.world.entity.monster.skeleton.Skeleton;
import net.minecraft.world.entity.monster.spider.Spider;
import net.minecraft.world.entity.monster.zombie.Zombie;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.SpawnEggItem;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.client.event.EntityRenderersEvent;
import net.neoforged.neoforge.event.entity.EntityAttributeCreationEvent;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds and registers custom mobs ({@link EntitySpec}) — one real {@link EntityType} per spec,
 * plus a spawn egg {@link Item} and attributes. Internal — called only by {@link
 * sheepfromheaven.screenspec.runtime.ModContent} and {@code ScreenSpecMod}; a mod author using the
 * MC Screen Designer web tool never calls this directly.
 *
 * <p><b>Scope, by design, not oversight:</b>
 * <ul>
 *   <li><b>AI goals are inherited wholesale</b> from the vanilla body template (Zombie/Skeleton/
 *   Spider/Creeper) — none of the {@code Template*Entity} classes override {@code registerGoals()}.
 *   A custom AI-goal system is being developed separately (outside this generator); each {@code
 *   Template*Entity.java} carries a commented override stub showing exactly where it hooks in.</li>
 *   <li><b>Natural biome spawning isn't wired</b> ({@code RegisterSpawnPlacementsEvent} is unused) —
 *   v1 mobs are spawn-egg / {@code /summon} only.</li>
 * </ul>
 *
 * <p>There's no code-gen step in this runtime, so a custom mob isn't a bespoke Java class per
 * spec: one shared entity class and one shared renderer class back every spec picking a given
 * {@code bodyTemplate}, each spec still gets its own real {@code EntityType} (attributes/hitbox/
 * category attach per-EntityType, not per-Java-class) and its own renderer *instance* (texture is
 * a constructor parameter, not a per-class constant) — same idea as vanilla's own Husk/Zombie or
 * WitherSkeleton/Skeleton relationship (a shared renderer class, reused across sibling EntityTypes).
 *
 * <p>Body templates (v1): {@code "zombie"} → {@link Zombie}/{@link
 * net.minecraft.client.renderer.entity.ZombieRenderer}, {@code "skeleton"} → {@link
 * AbstractSkeleton}/{@link net.minecraft.client.renderer.entity.SkeletonRenderer}, {@code "spider"}
 * → {@link Spider}/{@link net.minecraft.client.renderer.entity.SpiderRenderer}, {@code "creeper"}
 * → {@link Creeper}/{@link net.minecraft.client.renderer.entity.CreeperRenderer}. Chosen because
 * none of the four depend on a variant registry (unlike Cow/Pig/Chicken/Wolf) or profession data
 * (unlike Villager) — subclassing those without also registering a default variant/profession entry
 * risks a crash the first time the entity renders or breeds. More templates are a natural fast-follow
 * once that's scoped.
 *
 * <p><b>Custom Model</b> ({@link EntitySpec#useCustomModel}) swaps only the rendering half of the
 * above — {@link GenericEntityModel}/{@link GenericMobRenderer} replace the template's own vanilla
 * model/renderer, built dynamically from {@link EntitySpec.Geometry} (see {@link
 * #buildLayerDefinition}) rather than compiled, since this runtime has no code-gen step. The
 * *entity* class (AI/physics) is still whichever {@code bodyTemplate} was picked either way.
 */
public final class EntitySpecs {
    private EntitySpecs() {}

    public static DeferredRegister<EntityType<?>> createRegister(String modId) {
        return DeferredRegister.create(Registries.ENTITY_TYPE, modId);
    }

    public static DeferredRegister.Items createSpawnEggRegister(String modId) {
        return DeferredRegister.createItems(modId);
    }

    /** One real {@link EntityType} per spec, keyed by {@link EntitySpec#id}. */
    public static Map<String, DeferredHolder<EntityType<?>, ? extends EntityType<? extends Mob>>> registerAll(
            DeferredRegister<EntityType<?>> register, List<EntitySpec> specs, String modId) {
        Map<String, DeferredHolder<EntityType<?>, ? extends EntityType<? extends Mob>>> result = new LinkedHashMap<>();
        for (EntitySpec spec : specs) {
            MobCategory category = resolveCategory(spec.mobCategory);
            float width = Math.max(0.1f, spec.hitboxWidth);
            float height = Math.max(0.1f, spec.hitboxHeight);
            boolean fireImmune = spec.fireImmune;
            ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, Identifier.fromNamespaceAndPath(modId, spec.id));
            DeferredHolder<EntityType<?>, ? extends EntityType<? extends Mob>> holder = switch (resolveTemplate(spec.bodyTemplate)) {
                case ZOMBIE -> register.register(spec.id, () -> build(TemplateZombieEntity::new, category, width, height, fireImmune, key));
                case SKELETON -> register.register(spec.id, () -> build(TemplateSkeletonEntity::new, category, width, height, fireImmune, key));
                case SPIDER -> register.register(spec.id, () -> build(TemplateSpiderEntity::new, category, width, height, fireImmune, key));
                case CREEPER -> register.register(spec.id, () -> build(TemplateCreeperEntity::new, category, width, height, fireImmune, key));
            };
            result.put(spec.id, holder);
        }
        return result;
    }

    private static <T extends Mob> EntityType<T> build(
            EntityType.EntityFactory<T> factory, MobCategory category, float width, float height,
            boolean fireImmune, ResourceKey<EntityType<?>> key) {
        EntityType.Builder<T> builder = EntityType.Builder.of(factory, category).sized(width, height);
        if (fireImmune) builder = builder.fireImmune();
        return builder.build(key);
    }

    /** One spawn-egg {@link Item} per spec, keyed by {@link EntitySpec#id} — the two hex colors on
     * the spec never reach here, they only drive the webapp-generated egg icon PNG (this MC
     * version's SpawnEggItem has no runtime color-tint mechanism any more). */
    public static Map<String, DeferredItem<Item>> registerSpawnEggs(
            DeferredRegister.Items itemRegister, List<EntitySpec> specs,
            Map<String, DeferredHolder<EntityType<?>, ? extends EntityType<? extends Mob>>> registered) {
        Map<String, DeferredItem<Item>> result = new LinkedHashMap<>();
        for (EntitySpec spec : specs) {
            var type = registered.get(spec.id);
            if (type == null) continue;
            DeferredItem<Item> egg = itemRegister.register(spec.id + "_spawn_egg",
                () -> new SpawnEggItem(new Item.Properties().spawnEgg(type.get())));
            result.put(spec.id, egg);
        }
        return result;
    }

    /** Registers each spec's full {@link AttributeSupplier} (max health/movement speed/attack
     * damage on top of the body template's own base attributes) — required for every new {@link
     * EntityType}, on both dists (a dedicated server needs identical attribute suppliers). */
    public static void registerAttributes(
            IEventBus modBus, List<EntitySpec> specs,
            Map<String, DeferredHolder<EntityType<?>, ? extends EntityType<? extends Mob>>> registered) {
        modBus.addListener(EntityAttributeCreationEvent.class, event -> {
            for (EntitySpec spec : specs) {
                var type = registered.get(spec.id);
                if (type == null) continue;
                AttributeSupplier.Builder attrs = switch (resolveTemplate(spec.bodyTemplate)) {
                    case ZOMBIE -> Zombie.createAttributes();
                    case SKELETON -> AbstractSkeleton.createAttributes();
                    case SPIDER -> Spider.createAttributes();
                    case CREEPER -> Creeper.createAttributes();
                };
                attrs.add(Attributes.MAX_HEALTH, spec.maxHealth)
                    .add(Attributes.MOVEMENT_SPEED, spec.movementSpeed)
                    .add(Attributes.ATTACK_DAMAGE, spec.attackDamage);
                event.put(type.get(), attrs.build());
            }
        });
    }

    /** Client-only — must only ever be called from {@code ScreenSpecMod}'s {@code Dist.CLIENT}
     * branch, never from {@link sheepfromheaven.screenspec.runtime.ModContent#register}. Looks the
     * {@link EntityType} back up by id at event-fire time (fires after registration completes)
     * instead of needing {@link #registerAll}'s map threaded back out to the caller. */
    public static void registerRenderers(IEventBus modBus, String modId, List<EntitySpec> specs) {
        modBus.addListener(EntityRenderersEvent.RegisterRenderers.class, event -> {
            for (EntitySpec spec : specs) {
                EntityType<?> type = BuiltInRegistries.ENTITY_TYPE.getValue(Identifier.fromNamespaceAndPath(modId, spec.id));
                Identifier texture = Identifier.fromNamespaceAndPath(modId, "entity/" + spec.id);
                if (spec.useCustomModel && spec.geometry != null) {
                    ModelLayerLocation layer = modelLayerLocation(modId, spec);
                    registerRenderer(event, type, (EntityRendererProvider<Mob>) ctx ->
                        new GenericMobRenderer<>(ctx, new GenericEntityModel(ctx.bakeLayer(layer)), texture));
                    continue;
                }
                switch (resolveTemplate(spec.bodyTemplate)) {
                    case ZOMBIE -> registerRenderer(event, type, (EntityRendererProvider<Zombie>) ctx -> new TemplateZombieRenderer(ctx, texture));
                    case SKELETON -> registerRenderer(event, type, (EntityRendererProvider<Skeleton>) ctx -> new TemplateSkeletonRenderer(ctx, texture));
                    case SPIDER -> registerRenderer(event, type, (EntityRendererProvider<Spider>) ctx -> new TemplateSpiderRenderer(ctx, texture));
                    case CREEPER -> registerRenderer(event, type, (EntityRendererProvider<Creeper>) ctx -> new TemplateCreeperRenderer(ctx, texture));
                }
            }
        });
    }

    /** Client-only, same caller restriction as {@link #registerRenderers} — registers the dynamic
     * {@link LayerDefinition} for every {@link EntitySpec#useCustomModel} spec. Fires (and must be
     * registered) before {@link EntityRenderersEvent.RegisterRenderers}, so {@code context.bakeLayer}
     * has something to bake — NeoForge fires these two events in that fixed order regardless of
     * mod-bus listener registration order. */
    public static void registerModelLayers(IEventBus modBus, String modId, List<EntitySpec> specs) {
        modBus.addListener(EntityRenderersEvent.RegisterLayerDefinitions.class, event -> {
            for (EntitySpec spec : specs) {
                if (!spec.useCustomModel || spec.geometry == null) continue;
                event.registerLayerDefinition(modelLayerLocation(modId, spec), () -> buildLayerDefinition(spec.geometry));
            }
        });
    }

    private static ModelLayerLocation modelLayerLocation(String modId, EntitySpec spec) {
        return new ModelLayerLocation(Identifier.fromNamespaceAndPath(modId, spec.id), "main");
    }

    /** Builds the equivalent of a hand-written vanilla {@code LayerDefinition} from a spec's
     * cuboid list — plain builder calls in a loop, no reflection/code-gen. Each cuboid becomes its
     * own named child part of the root, posed at its own center (so it rotates around that center,
     * not a corner) with the box itself added at a `-size/2` local offset to land back at the
     * right place — mirrors how a hand-authored vanilla model poses an per-limb part vs. the cube(s)
     * inside it. */
    private static LayerDefinition buildLayerDefinition(EntitySpec.Geometry geometry) {
        MeshDefinition mesh = new MeshDefinition();
        PartDefinition root = mesh.getRoot();
        if (geometry.cuboids != null) {
            for (EntitySpec.Cuboid cuboid : geometry.cuboids) {
                float halfW = cuboid.size[0] / 2f, halfH = cuboid.size[1] / 2f, halfD = cuboid.size[2] / 2f;
                CubeListBuilder box = CubeListBuilder.create()
                    .texOffs(cuboid.uv[0], cuboid.uv[1])
                    .mirror(cuboid.mirror)
                    .addBox(-halfW, -halfH, -halfD, cuboid.size[0], cuboid.size[1], cuboid.size[2]);
                PartPose pose = PartPose.offsetAndRotation(
                    cuboid.position[0] + halfW, cuboid.position[1] + halfH, cuboid.position[2] + halfD,
                    (float) Math.toRadians(cuboid.rotation[0]),
                    (float) Math.toRadians(cuboid.rotation[1]),
                    (float) Math.toRadians(cuboid.rotation[2]));
                root.addOrReplaceChild(cuboid.name, box, pose);
            }
        }
        return LayerDefinition.create(mesh, Math.max(1, geometry.textureWidth), Math.max(1, geometry.textureHeight));
    }

    /** Same contravariant registration vanilla itself relies on for e.g. HuskRenderer (a renderer
     * fixed to the body template's own class) registered against a subclass's EntityType — {@code
     * T} is inferred from {@code provider}, and {@code type} only needs to extend it. */
    private static <T extends Mob> void registerRenderer(
            EntityRenderersEvent.RegisterRenderers event, EntityType<?> type, EntityRendererProvider<T> provider) {
        @SuppressWarnings("unchecked")
        EntityType<? extends T> typed = (EntityType<? extends T>) type;
        event.registerEntityRenderer(typed, provider);
    }

    private enum Template { ZOMBIE, SKELETON, SPIDER, CREEPER }

    private static Template resolveTemplate(String key) {
        return switch (key == null ? "zombie" : key) {
            case "skeleton" -> Template.SKELETON;
            case "spider" -> Template.SPIDER;
            case "creeper" -> Template.CREEPER;
            default -> Template.ZOMBIE;
        };
    }

    private static MobCategory resolveCategory(String key) {
        return switch (key == null ? "monster" : key) {
            case "creature" -> MobCategory.CREATURE;
            case "ambient" -> MobCategory.AMBIENT;
            case "misc" -> MobCategory.MISC;
            default -> MobCategory.MONSTER;
        };
    }
}
