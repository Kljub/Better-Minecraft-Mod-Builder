package sheepfromheaven.screenspec.runtime.entity.client;

import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.client.renderer.item.ItemStackRenderState;
import net.minecraft.world.entity.AnimationState;

import java.util.ArrayList;
import java.util.List;

/** Render state of a custom mob: the living-entity basics plus its animation timers. */
public class SpecRenderState extends LivingEntityRenderState {
    public final AnimationState idleAnimationState = new AnimationState();
    public final AnimationState attackAnimationState = new AnimationState();
    /** Mesh Models: one item render state per mesh part (see MeshPartsLayer) */
    public final List<ItemStackRenderState> meshParts = new ArrayList<>();
}
