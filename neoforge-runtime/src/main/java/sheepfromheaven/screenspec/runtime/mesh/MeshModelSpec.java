package sheepfromheaven.screenspec.runtime.mesh;

/**
 * One item or block from the webapp's "Mesh Models" tab — an entry of
 * {@code assets/<modid>/screenspec/elements/mesh_models.json}. Its model is an OBJ mesh the
 * webapp exports with NeoForge's OBJ loader ({@code models/mesh/<id>/root.json} + item/blockstate
 * definitions), so the runtime only registers the item / block. Mesh entities go through
 * {@code entities.json} instead (parts with a {@code mesh}). Must stay in sync with
 * webapp/lib/elements/meshKind.ts.
 */
public class MeshModelSpec {
    public String id;
    /** item | block */
    public String target = "item";
    public String displayName = "";
    public float hardness = 1.5f;
    /** block outline/collision in pixels (0..16), from the mesh's bounds */
    public Box box;

    public static class Box {
        public double[] from = {0, 0, 0};
        public double[] to = {16, 16, 16};
    }
}
