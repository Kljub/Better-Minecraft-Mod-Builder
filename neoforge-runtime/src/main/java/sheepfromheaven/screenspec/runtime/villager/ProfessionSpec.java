package sheepfromheaven.screenspec.runtime.villager;

/**
 * Mirrors the "villagerProfession" element exported by the MC Screen Designer web tool (see
 * {@code webapp/lib/elements/modKinds.ts}). Field names and JSON shape must stay in sync with that file.
 */
public final class ProfessionSpec {
    /** registry path of the profession and its point-of-interest (job site) type */
    public String id;
    /** block id an unemployed villager claims to take this job, e.g. {@code "minecraft:loom"} */
    public String jobSiteBlock;
    /** sound id played while working at the job site; empty = none */
    public String workSound = "";
}
