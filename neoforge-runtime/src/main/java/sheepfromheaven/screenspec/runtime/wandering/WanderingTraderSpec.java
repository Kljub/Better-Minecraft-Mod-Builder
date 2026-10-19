package sheepfromheaven.screenspec.runtime.wandering;

/**
 * A custom wandering trader from the webapp's "Village Professions" tab (type "Wandering trader") —
 * an entry of {@code assets/<modid>/screenspec/elements/wandering_traders.json}. Its offers are
 * data: the trade sets {@code <modid>:<id>/buying|rare|common} the export writes. Must stay in sync
 * with webapp/lib/elements/modKinds.ts (VILLAGER_PROFESSION).
 */
public class WanderingTraderSpec {
    public String id;
    public String displayName = "";
    /** path under assets/<modid>/, empty = vanilla wandering trader look */
    public String texture = "";
    /** % chance per spawn attempt (vanilla starts at 25 and rises to 75 while none spawns) */
    public int spawnChance = 25;
    /** ticks between spawn attempts (vanilla 24000 = one Minecraft day) */
    public int spawnDelay = 24000;
    /** ticks until it leaves again (vanilla 48000) */
    public int despawnDelay = 48000;
    /** trader llamas on a lead (vanilla 2) */
    public int llamas = 2;
    public boolean spawnEgg = true;
}
