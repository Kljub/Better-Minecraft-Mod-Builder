package sheepfromheaven.screenspec.runtime.wandering;

import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BiomeTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.entity.ai.village.poi.PoiManager;
import net.minecraft.world.entity.ai.village.poi.PoiTypes;
import net.minecraft.world.entity.animal.equine.TraderLlama;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.levelgen.Heightmap;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.BuildCreativeModeTabContentsEvent;
import net.neoforged.neoforge.event.entity.EntityAttributeCreationEvent;
import net.neoforged.neoforge.event.entity.RegisterSpawnPlacementsEvent;
import net.neoforged.neoforge.event.tick.LevelTickEvent;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Registers the custom wandering traders of one mod ({@code elements/wandering_traders.json}): one
 * {@link SpecWanderingTrader} EntityType each (vanilla attributes and spawn placement), its spawn
 * egg, and a spawner that works like vanilla's WanderingTraderSpawner — in the overworld, while
 * the {@code spawnWanderingTraders} game rule is on, it tries every {@code spawnDelay} ticks with
 * {@code spawnChance}% near a random player (at a village meeting point if one is close), with
 * llamas on a lead, and the trader leaves after {@code despawnDelay}. The countdown restarts with
 * the server (vanilla keeps its own in the save).
 */
public final class WanderingTraderSpecs {
    private WanderingTraderSpecs() {}

    private static final int CHECK_INTERVAL = 1200;

    public static void register(String modId, IEventBus modBus, List<WanderingTraderSpec> specs) {
        List<WanderingTraderSpec> valid = new ArrayList<>();
        for (WanderingTraderSpec s : specs) if (s != null && s.id != null && !s.id.isBlank()) valid.add(s);
        if (valid.isEmpty()) return;

        DeferredRegister<EntityType<?>> types = DeferredRegister.create(Registries.ENTITY_TYPE, modId);
        DeferredRegister.Items items = DeferredRegister.createItems(modId);
        Map<String, DeferredHolder<EntityType<?>, EntityType<SpecWanderingTrader>>> registered = new LinkedHashMap<>();
        List<DeferredItem<Item>> eggs = new ArrayList<>();
        for (WanderingTraderSpec spec : valid) {
            ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, Identifier.fromNamespaceAndPath(modId, spec.id));
            DeferredHolder<EntityType<?>, EntityType<SpecWanderingTrader>> holder = types.register(spec.id, () -> {
                EntityType<SpecWanderingTrader> type = EntityType.Builder.<SpecWanderingTrader>of(SpecWanderingTrader::new, MobCategory.CREATURE)
                    .sized(0.6F, 1.95F).eyeHeight(1.62F).clientTrackingRange(10).build(key);
                SpecWanderingTrader.configure(type, modId, spec.id);
                return type;
            });
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
            for (var holder : registered.values()) event.put(holder.get(), Mob.createMobAttributes().build());
        });
        modBus.addListener(RegisterSpawnPlacementsEvent.class, event -> {
            for (var holder : registered.values()) {
                event.register(holder.get(), SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                    Mob::checkMobSpawnRules, RegisterSpawnPlacementsEvent.Operation.REPLACE);
            }
        });
        if (!eggs.isEmpty()) {
            modBus.addListener(BuildCreativeModeTabContentsEvent.class, event -> {
                if (event.getTabKey() == CreativeModeTabs.SPAWN_EGGS) for (DeferredItem<Item> egg : eggs) event.accept(egg.get());
            });
        }

        // Spawner: ticks left until the next attempt, per trader (game-wide, overworld only).
        Map<String, Integer> countdown = new HashMap<>();
        RandomSource random = RandomSource.create();
        int[] tick = {0};
        NeoForge.EVENT_BUS.addListener(LevelTickEvent.Post.class, event -> {
            if (!(event.getLevel() instanceof ServerLevel level) || level.dimension() != Level.OVERWORLD) return;
            if (++tick[0] % CHECK_INTERVAL != 0 || !level.getGameRules().get(GameRules.SPAWN_WANDERING_TRADERS)) return;
            for (WanderingTraderSpec spec : valid) {
                int left = countdown.getOrDefault(spec.id, Math.max(CHECK_INTERVAL, spec.spawnDelay)) - CHECK_INTERVAL;
                if (left > 0) { countdown.put(spec.id, left); continue; }
                countdown.put(spec.id, Math.max(CHECK_INTERVAL, spec.spawnDelay));
                if (random.nextInt(100) < Math.max(0, Math.min(100, spec.spawnChance))) spawn(level, registered.get(spec.id).get(), spec, random);
            }
        });

        if (FMLEnvironment.getDist() == Dist.CLIENT) {
            sheepfromheaven.screenspec.runtime.wandering.client.WanderingTraderSpecsClient.register(modId, modBus, valid, registered);
        }
    }

    /** Vanilla's WanderingTraderSpawner.spawn, for our type and settings. */
    private static void spawn(ServerLevel level, EntityType<SpecWanderingTrader> type, WanderingTraderSpec spec, RandomSource random) {
        Player player = level.getRandomPlayer();
        if (player == null) return;
        BlockPos playerPos = player.blockPosition();
        Optional<BlockPos> meeting = level.getPoiManager().find(p -> p.is(PoiTypes.MEETING), p -> true, playerPos, 48, PoiManager.Occupancy.ANY);
        BlockPos reference = meeting.orElse(playerPos);
        BlockPos pos = findSpawnPositionNear(level, type, reference, 48, random);
        if (pos == null || !hasEnoughSpace(level, pos) || level.getBiome(pos).is(BiomeTags.WITHOUT_WANDERING_TRADER_SPAWNS)) return;
        SpecWanderingTrader trader = type.spawn(level, pos, EntitySpawnReason.EVENT);
        if (trader == null) return;
        for (int i = 0; i < Math.max(0, Math.min(4, spec.llamas)); i++) {
            BlockPos llamaPos = findSpawnPositionNear(level, EntityTypes.TRADER_LLAMA, trader.blockPosition(), 4, random);
            if (llamaPos == null) continue;
            TraderLlama llama = EntityTypes.TRADER_LLAMA.spawn(level, llamaPos, EntitySpawnReason.EVENT);
            if (llama != null) llama.setLeashedTo(trader, true);
        }
        trader.setDespawnDelay(Math.max(CHECK_INTERVAL, spec.despawnDelay));
        trader.setWanderTarget(reference);
        trader.setHomeTo(reference, 16);
    }

    private static BlockPos findSpawnPositionNear(ServerLevel level, EntityType<?> type, BlockPos ref, int radius, RandomSource random) {
        for (int i = 0; i < 10; i++) {
            int x = ref.getX() + random.nextInt(radius * 2) - radius;
            int z = ref.getZ() + random.nextInt(radius * 2) - radius;
            BlockPos pos = new BlockPos(x, level.getHeight(SpawnPlacements.getHeightmapType(type), x, z), z);
            if (SpawnPlacements.getPlacementType(type).isSpawnPositionOk(level, pos, type)) return pos;
        }
        return null;
    }

    private static boolean hasEnoughSpace(ServerLevel level, BlockPos pos) {
        for (BlockPos p : BlockPos.betweenClosed(pos, pos.offset(1, 2, 1))) {
            if (!level.getBlockState(p).getCollisionShape(level, p).isEmpty()) return false;
        }
        return true;
    }
}
