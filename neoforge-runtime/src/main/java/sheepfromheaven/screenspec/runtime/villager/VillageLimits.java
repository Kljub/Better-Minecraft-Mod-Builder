package sheepfromheaven.screenspec.runtime.villager;

import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.ai.memory.MemoryModuleType;
import net.minecraft.world.entity.ai.village.poi.PoiManager;
import net.minecraft.world.entity.ai.village.poi.PoiTypes;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.entity.npc.villager.VillagerData;
import net.minecraft.world.entity.npc.villager.VillagerProfession;
import net.minecraft.world.phys.AABB;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.tick.EntityTickEvent;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * "Max per village" for custom professions ({@link ProfessionSpec#maxPerVillage}). Minecraft has
 * no village object to ask, so a village here is everything within {@link #RADIUS} blocks of the
 * nearest meeting point (bell) — or of the villager when there's none. Every few seconds each
 * villager with a limited profession checks its village; ranked by level, XP and age, the ones past
 * the limit give the job back — but only if they never traded (XP 0), the same rule vanilla uses
 * before a villager may lose its profession. Limit 0 additionally keeps the job site out of the
 * acquirable_job_site tag (webapp export), so nobody picks it up in the first place.
 */
final class VillageLimits {
    static final int RADIUS = 48;
    private static final int CHECK_EVERY = 100; // ticks

    private VillageLimits() {}

    static void register(String modId, List<ProfessionSpec> specs) {
        Map<ResourceKey<VillagerProfession>, Integer> limits = new HashMap<>();
        for (ProfessionSpec spec : specs) {
            if (spec.maxPerVillage >= 0) limits.put(ResourceKey.create(Registries.VILLAGER_PROFESSION, Identifier.fromNamespaceAndPath(modId, spec.id)), spec.maxPerVillage);
        }
        if (limits.isEmpty()) return;
        NeoForge.EVENT_BUS.addListener(EntityTickEvent.Post.class, event -> {
            if (!(event.getEntity() instanceof Villager villager) || !(villager.level() instanceof ServerLevel level)) return;
            if ((villager.tickCount + villager.getId()) % CHECK_EVERY != 0) return;
            VillagerData data = villager.getVillagerData();
            ResourceKey<VillagerProfession> key = data.profession().unwrapKey().orElse(null);
            Integer limit = key == null ? null : limits.get(key);
            if (limit == null || villager.getVillagerXp() > 0 || data.level() > 1) return;
            if (!overLimit(level, villager, key, limit)) return;
            villager.releasePoi(MemoryModuleType.JOB_SITE);
            villager.setVillagerData(data.withProfession(level.registryAccess(), VillagerProfession.NONE));
        });
    }

    /** Whether this villager ranks past the limit among same-job villagers of its village. */
    private static boolean overLimit(ServerLevel level, Villager villager, ResourceKey<VillagerProfession> key, int limit) {
        if (limit == 0) return true;
        BlockPos center = level.getPoiManager()
            .findClosest(holder -> holder.is(PoiTypes.MEETING), villager.blockPosition(), RADIUS, PoiManager.Occupancy.ANY)
            .orElse(villager.blockPosition());
        List<Villager> sameJob = level.getEntitiesOfClass(Villager.class, new AABB(center).inflate(RADIUS, 24, RADIUS),
            v -> v.isAlive() && v.getVillagerData().profession().is(key));
        if (sameJob.size() <= limit) return false;
        // Experienced and long-employed villagers keep the job; newcomers give it up first.
        sameJob.sort(Comparator.<Villager>comparingInt(v -> -v.getVillagerData().level())
            .thenComparingInt(v -> -v.getVillagerXp())
            .thenComparingInt(v -> -v.tickCount)
            .thenComparingInt(Villager::getId));
        return sameJob.indexOf(villager) >= limit;
    }
}
