package sheepfromheaven.screenspec.runtime.armor.client;

import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.Model;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.client.renderer.entity.state.HumanoidRenderState;
import net.minecraft.client.resources.model.EquipmentClientInfo;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.client.extensions.common.IClientItemExtensions;
import net.neoforged.neoforge.client.extensions.common.RegisterClientExtensionsEvent;
import net.neoforged.neoforge.registries.DeferredItem;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import sheepfromheaven.screenspec.runtime.armor.ArmorSpec;
import sheepfromheaven.screenspec.runtime.armor.ArmorSpecs;
import sheepfromheaven.screenspec.runtime.entity.EntitySpec;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Custom 3D armor (webapp: Armor → "3D model"): each piece renders a {@link HumanoidModel} whose
 * vanilla body parts carry only that piece's cubes, through NeoForge's
 * {@link IClientItemExtensions#getHumanoidArmorModel} hook. The vanilla armor layer posts it with the
 * wearer's pose (setupAnim at submit time) and the texture comes from {@link #getArmorTexture}.
 * Bone convention: FabricExtras' ArmorModelAPI (MIT) — armorHead/armorBody/armorRightArm/… anchored
 * to the vanilla skeleton, decorative parts nested under them.
 */
public final class ArmorModelsClient {
    private static final Logger LOGGER = LoggerFactory.getLogger("screenspec");

    /** vanilla HumanoidModel part pivots (Java model space) */
    private static final Map<String, float[]> ANCHORS = Map.of(
        "head", new float[] {0, 0, 0},
        "body", new float[] {0, 0, 0},
        "right_arm", new float[] {-5, 2, 0},
        "left_arm", new float[] {5, 2, 0},
        "right_leg", new float[] {-1.9F, 12, 0},
        "left_leg", new float[] {1.9F, 12, 0});

    private static final String[][] PIECES = { {"helmet", "head"}, {"chestplate", "chest"}, {"leggings", "legs"}, {"boots", "feet"} };

    private ArmorModelsClient() {}

    public static void register(String modId, IEventBus modBus, List<ArmorSpec> specs, Map<String, DeferredItem<Item>> pieces) {
        modBus.addListener(RegisterClientExtensionsEvent.class, event -> {
            for (ArmorSpec spec : specs) {
                if (spec.customModel == null || spec.customModel.parts == null || spec.customModel.parts.isEmpty()) continue;
                Identifier texture = Identifier.fromNamespaceAndPath(modId,
                    spec.customModel.texture == null || spec.customModel.texture.isBlank() ? "textures/armor/" + spec.id + ".png" : spec.customModel.texture);
                for (String[] piece : PIECES) {
                    DeferredItem<Item> item = pieces.get(ArmorSpecs.pieceId(spec, piece[0]));
                    if (item == null) continue;
                    event.registerItem(new Extension(spec, piece[1], texture), item.get());
                }
            }
        });
    }

    private static final class Extension implements IClientItemExtensions {
        private final ArmorSpec spec;
        private final String slot;
        private final Identifier texture;
        private HumanoidModel<HumanoidRenderState> model;
        private boolean failed;

        Extension(ArmorSpec spec, String slot, Identifier texture) {
            this.spec = spec;
            this.slot = slot;
            this.texture = texture;
        }

        @Override
        public Model getHumanoidArmorModel(ItemStack stack, EquipmentClientInfo.LayerType layerType, Model original) {
            if (failed) return original;
            if (model == null) {
                try {
                    model = new HumanoidModel<>(buildLayer(spec.customModel, slot).bakeRoot());
                } catch (RuntimeException e) {
                    // A broken model shouldn't crash rendering: log once, fall back to the vanilla layer.
                    failed = true;
                    LOGGER.error("screenspec: custom armor model of '{}' ({}) failed to build — using the vanilla armor layer", spec.id, slot, e);
                    return original;
                }
            }
            return model;
        }

        @Override
        public Identifier getArmorTexture(ItemStack stack, EquipmentClientInfo.LayerType type, EquipmentClientInfo.Layer layer, Identifier _default) {
            return failed ? _default : texture;
        }
    }

    /** Empty vanilla skeleton (part names/pivots HumanoidModel expects) plus this slot's armor parts. */
    static LayerDefinition buildLayer(ArmorSpec.CustomModel m, String slot) {
        MeshDefinition mesh = new MeshDefinition();
        PartDefinition root = mesh.getRoot();
        Map<String, PartDefinition> anchors = new HashMap<>();
        PartDefinition head = root.addOrReplaceChild("head", CubeListBuilder.create(), PartPose.ZERO);
        head.addOrReplaceChild("hat", CubeListBuilder.create(), PartPose.ZERO);
        anchors.put("head", head);
        for (String name : new String[] {"body", "right_arm", "left_arm", "right_leg", "left_leg"}) {
            float[] p = ANCHORS.get(name);
            anchors.put(name, root.addOrReplaceChild(name, CubeListBuilder.create(), PartPose.offset(p[0], p[1], p[2])));
        }

        // Parts arrive parent-first (webapp javaParts); keep the ones under this slot's armor bones.
        Map<String, PartDefinition> included = new HashMap<>();
        for (EntitySpec.Part part : m.parts) {
            if (part == null || part.name == null || included.containsKey(part.name)) continue;
            EntitySpec.Pose o = part.pose == null ? new EntitySpec.Pose() : part.pose;
            PartDefinition parent;
            PartPose pose;
            if (part.parent == null) {
                ArmorSpec.Anchor a = m.anchors == null ? null : m.anchors.get(part.name);
                if (a == null || !slot.equals(a.slot) || !anchors.containsKey(a.anchor)) continue;
                parent = anchors.get(a.anchor);
                float[] pivot = ANCHORS.get(a.anchor);
                // Root parts are posed in model space; under an anchor they're relative to its pivot.
                pose = PartPose.offsetAndRotation(o.x - pivot[0], o.y - pivot[1], o.z - pivot[2], o.rx, o.ry, o.rz);
            } else {
                parent = included.get(part.parent);
                if (parent == null) continue;
                pose = PartPose.offsetAndRotation(o.x, o.y, o.z, o.rx, o.ry, o.rz);
            }
            CubeListBuilder cubes = CubeListBuilder.create();
            for (EntitySpec.Cube c : part.cubes) {
                cubes = cubes.texOffs(c.u, c.v).mirror(c.mirror).addBox(c.x, c.y, c.z, c.w, c.h, c.d, new CubeDeformation(c.inflate));
            }
            included.put(part.name, parent.addOrReplaceChild(part.name, cubes, pose));
        }
        return LayerDefinition.create(mesh, Math.max(1, m.textureWidth), Math.max(1, m.textureHeight));
    }
}
