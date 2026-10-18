package sheepfromheaven.screenspec.runtime.villager;

import com.google.common.collect.ImmutableSet;
import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.entity.ai.village.poi.PoiType;
import net.minecraft.world.entity.npc.villager.VillagerProfession;
import net.minecraft.world.item.trading.TradeSet;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.List;

/**
 * Registers each {@link ProfessionSpec} as a real {@link VillagerProfession} plus the
 * {@link PoiType} for its job-site block — the same pair vanilla's own professions are
 * (see {@code VillagerProfession.bootstrap}/{@code PoiTypes.bootstrap}). Trades are data-driven in
 * this MC version: level N reads the trade set {@code <modid>:<id>/level_N}, which the export
 * bundle writes (plus the trades themselves and the {@code acquirable_job_site} tag entry that
 * lets unemployed villagers find the job site). Internal — called by
 * {@link sheepfromheaven.screenspec.runtime.ModElements}.
 */
public final class ProfessionSpecs {
    private ProfessionSpecs() {}

    public static void register(String modId, IEventBus modBus, List<ProfessionSpec> specs) {
        if (specs.isEmpty()) return;
        DeferredRegister<PoiType> pois = DeferredRegister.create(Registries.POINT_OF_INTEREST_TYPE, modId);
        DeferredRegister<VillagerProfession> professions = DeferredRegister.create(Registries.VILLAGER_PROFESSION, modId);

        for (ProfessionSpec spec : specs) {
            DeferredHolder<PoiType, PoiType> poi = pois.register(spec.id, () -> {
                Block block = resolveBlock(modId, spec);
                return new PoiType(ImmutableSet.copyOf(block.getStateDefinition().getPossibleStates()), 1, 1);
            });
            ResourceKey<PoiType> poiKey = poi.getKey();
            professions.register(spec.id, () -> {
                Int2ObjectMap<ResourceKey<TradeSet>> trades = new Int2ObjectOpenHashMap<>();
                for (int level = 1; level <= 5; level++) {
                    trades.put(level, ResourceKey.create(Registries.TRADE_SET, Identifier.fromNamespaceAndPath(modId, spec.id + "/level_" + level)));
                }
                return new VillagerProfession(
                    Component.translatable("entity." + modId + ".villager." + spec.id),
                    holder -> holder.is(poiKey),
                    holder -> holder.is(poiKey),
                    ImmutableSet.of(),
                    ImmutableSet.of(),
                    resolveSound(spec.workSound),
                    trades);
            });
        }
        pois.register(modBus);
        professions.register(modBus);
        VillageLimits.register(modId, specs);
    }

    private static Block resolveBlock(String modId, ProfessionSpec spec) {
        Identifier id = spec.jobSiteBlock == null ? null : Identifier.tryParse(spec.jobSiteBlock);
        Block block = id == null ? null : BuiltInRegistries.BLOCK.getValue(id);
        // No silent fallback: every vanilla workstation already belongs to a vanilla PoiType, and one
        // block state in two PoiTypes fails registration anyway — so say which spec is wrong.
        if (block == null || block == Blocks.AIR) {
            throw new IllegalStateException("[screenspec] " + modId + ": villager profession '" + spec.id
                + "' has unknown job site block '" + spec.jobSiteBlock + "'");
        }
        return block;
    }

    private static SoundEvent resolveSound(String id) {
        if (id == null || id.isBlank()) return null;
        Identifier key = Identifier.tryParse(id);
        return key == null ? null : BuiltInRegistries.SOUND_EVENT.getValue(key);
    }
}
