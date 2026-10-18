package sheepfromheaven.screenspec.runtime.entity.client;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.core.component.DataComponents;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import sheepfromheaven.screenspec.runtime.entity.EntitySpec;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * Draws a Mesh Models mob: every part with a {@code mesh} renders that OBJ model (an item model
 * the webapp exported, reached through an ItemStack's {@code minecraft:item_model} component) at
 * the part's current pose — after setupAnim, so the keyframe animations move the mesh parts
 * exactly like cubes. Each OBJ is written in its part's Java model space; item rendering shifts by
 * -0.5 blocks (ItemTransform.NO_TRANSFORM), which is undone here.
 */
public class MeshPartsLayer<T extends net.minecraft.world.entity.Mob> extends RenderLayer<SpecRenderState, SpecModel> {
    private final List<List<String>> chains = new ArrayList<>();
    private final List<ItemStack> stacks = new ArrayList<>();

    MeshPartsLayer(RenderLayerParent<SpecRenderState, SpecModel> renderer, EntitySpec spec) {
        super(renderer);
        Map<String, String> parent = new HashMap<>();
        for (EntitySpec.Part p : spec.parts) if (p != null && p.name != null) parent.putIfAbsent(p.name, p.parent);
        for (EntitySpec.Part p : spec.parts) {
            if (p == null || p.name == null || p.mesh == null || p.mesh.isBlank()) continue;
            Identifier model = Identifier.tryParse(p.mesh);
            if (model == null) continue;
            // Root-first chain of part names down to this part.
            List<String> chain = new ArrayList<>();
            for (String n = p.name; n != null && chain.size() < 64; n = parent.get(n)) chain.add(0, n);
            ItemStack stack = new ItemStack(Items.STICK);
            stack.set(DataComponents.ITEM_MODEL, model);
            chains.add(chain);
            stacks.add(stack);
        }
    }

    static boolean hasMeshes(EntitySpec spec) {
        return spec != null && spec.parts.stream().anyMatch(p -> p != null && p.mesh != null && !p.mesh.isBlank());
    }

    int size() {
        return stacks.size();
    }

    ItemStack stack(int i) {
        return stacks.get(i);
    }

    @Override
    public void submit(PoseStack poseStack, SubmitNodeCollector collector, int lightCoords, SpecRenderState state, float yRot, float xRot) {
        ModelPart root = getParentModel().root();
        Function<String, ModelPart> lookup = root.createPartLookup();
        int overlay = LivingEntityRenderer.getOverlayCoords(state, 0.0F);
        for (int i = 0; i < chains.size() && i < state.meshParts.size(); i++) {
            var item = state.meshParts.get(i);
            if (item.isEmpty()) continue;
            poseStack.pushPose();
            root.translateAndRotate(poseStack);
            boolean ok = true;
            for (String name : chains.get(i)) {
                ModelPart part = lookup.apply(name);
                if (part == null) { ok = false; break; }
                if (!part.visible) { ok = false; break; }
                part.translateAndRotate(poseStack);
            }
            if (ok) {
                poseStack.translate(0.5F, 0.5F, 0.5F);
                item.submit(poseStack, collector, lightCoords, overlay, state.outlineColor);
            }
            poseStack.popPose();
        }
    }
}
