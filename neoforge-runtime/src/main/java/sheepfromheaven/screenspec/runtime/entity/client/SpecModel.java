package sheepfromheaven.screenspec.runtime.entity.client;

import net.minecraft.client.animation.AnimationChannel;
import net.minecraft.client.animation.AnimationDefinition;
import net.minecraft.client.animation.Keyframe;
import net.minecraft.client.animation.KeyframeAnimation;
import net.minecraft.client.animation.KeyframeAnimations;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import org.joml.Vector3f;
import sheepfromheaven.screenspec.runtime.entity.EntitySpec;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * A custom mob's model, built at runtime from the spec's parts (same calls a Blockbench/webapp
 * exported Java class makes in createBodyLayer), with its keyframe animations baked from the
 * spec: idle (looping while standing), walk (driven by walk speed) and attack (on each hit).
 */
public class SpecModel extends EntityModel<SpecRenderState> {
    private final KeyframeAnimation idle;
    private final KeyframeAnimation walk;
    private final KeyframeAnimation attack;

    public SpecModel(ModelPart root, EntitySpec spec) {
        super(root);
        this.idle = bake(root, spec, spec.idleAnimation);
        this.walk = bake(root, spec, spec.walkAnimation);
        this.attack = bake(root, spec, spec.attackAnimation);
    }

    @Override
    public void setupAnim(SpecRenderState state) {
        super.setupAnim(state);
        if (walk != null) walk.applyWalk(state.walkAnimationPos, state.walkAnimationSpeed, 2.0F, 2.5F);
        if (idle != null) idle.apply(state.idleAnimationState, state.ageInTicks);
        if (attack != null) attack.apply(state.attackAnimationState, state.ageInTicks);
    }

    /** Same structure as an exported createBodyLayer(); unknown/duplicate parents fall back to the root. */
    public static LayerDefinition createLayer(EntitySpec spec) {
        MeshDefinition mesh = new MeshDefinition();
        Map<String, PartDefinition> parts = new HashMap<>();
        for (EntitySpec.Part p : spec.parts) {
            if (p == null || p.name == null || parts.containsKey(p.name)) continue;
            CubeListBuilder cubes = CubeListBuilder.create();
            for (EntitySpec.Cube c : p.cubes) {
                cubes = cubes.texOffs(c.u, c.v).mirror(c.mirror).addBox(c.x, c.y, c.z, c.w, c.h, c.d, new CubeDeformation(c.inflate));
            }
            EntitySpec.Pose o = p.pose == null ? new EntitySpec.Pose() : p.pose;
            PartDefinition parent = p.parent != null && parts.containsKey(p.parent) ? parts.get(p.parent) : mesh.getRoot();
            parts.put(p.name, parent.addOrReplaceChild(p.name, cubes, PartPose.offsetAndRotation(o.x, o.y, o.z, o.rx, o.ry, o.rz)));
        }
        return LayerDefinition.create(mesh, Math.max(1, spec.textureWidth), Math.max(1, spec.textureHeight));
    }

    /** Bakes the named animation; channels for parts the model lacks are dropped (vanilla would throw). */
    private static KeyframeAnimation bake(ModelPart root, EntitySpec spec, String name) {
        if (name == null || name.isBlank()) return null;
        EntitySpec.Animation anim = spec.animations.stream().filter(a -> name.equals(a.name)).findFirst().orElse(null);
        if (anim == null) return null;
        Function<String, ModelPart> lookup = root.createPartLookup();
        AnimationDefinition.Builder builder = AnimationDefinition.Builder.withLength(Math.max(0.05F, anim.length));
        if (anim.looping) builder = builder.looping();
        int channels = 0;
        for (EntitySpec.Channel ch : anim.channels) {
            if (ch == null || ch.bone == null || lookup.apply(ch.bone) == null || ch.keyframes.isEmpty()) continue;
            AnimationChannel.Target target = switch (ch.target == null ? "" : ch.target) {
                case "position" -> AnimationChannel.Targets.POSITION;
                case "scale" -> AnimationChannel.Targets.SCALE;
                default -> AnimationChannel.Targets.ROTATION;
            };
            List<EntitySpec.Key> keys = ch.keyframes;
            Keyframe[] frames = new Keyframe[keys.size()];
            for (int i = 0; i < keys.size(); i++) {
                EntitySpec.Key k = keys.get(i);
                Vector3f v = switch (ch.target == null ? "" : ch.target) {
                    case "position" -> KeyframeAnimations.posVec(k.x, k.y, k.z);
                    case "scale" -> KeyframeAnimations.scaleVec(k.x, k.y, k.z);
                    default -> KeyframeAnimations.degreeVec(k.x, k.y, k.z);
                };
                frames[i] = new Keyframe(k.time, v, "catmullrom".equals(k.interpolation) ? AnimationChannel.Interpolations.CATMULLROM : AnimationChannel.Interpolations.LINEAR);
            }
            builder = builder.addAnimation(ch.bone, new AnimationChannel(target, frames));
            channels++;
        }
        return channels == 0 ? null : builder.build().bake(root);
    }
}
