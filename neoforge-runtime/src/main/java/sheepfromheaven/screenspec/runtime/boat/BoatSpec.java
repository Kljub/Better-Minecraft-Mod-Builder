package sheepfromheaven.screenspec.runtime.boat;

/**
 * Mirrors the "boat" (Special entity) element exported by the MC Screen Designer web tool (see
 * {@code webapp/lib/elements/modKinds.ts}). Field names and JSON shape must stay in sync with that file.
 */
public final class BoatSpec {
    /** base id: entity + item {@code <id>_boat}, chest variant {@code <id>_chest_boat};
     * textures {@code textures/entity/boat/<id>.png} / {@code textures/entity/chest_boat/<id>.png} */
    public String id;
    /** also register the chest-boat variant */
    public boolean chestBoat = true;
}
