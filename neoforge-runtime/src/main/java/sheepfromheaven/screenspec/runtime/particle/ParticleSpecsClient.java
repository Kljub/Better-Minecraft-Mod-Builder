package sheepfromheaven.screenspec.runtime.particle;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.util.LightCoordsUtil;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.client.event.RegisterParticleProvidersEvent;

import java.util.List;

/** Client half of {@link ParticleSpecs} — kept separate so a dedicated server never loads client particle classes. */
final class ParticleSpecsClient {
    private ParticleSpecsClient() {}

    static void register(IEventBus modBus, List<ParticleSpecs.Registered> particles) {
        modBus.addListener(RegisterParticleProvidersEvent.class, event -> {
            for (ParticleSpecs.Registered p : particles) {
                ParticleSpec spec = p.spec();
                event.registerSpriteSet(p.type().get(), sprites -> (options, level, x, y, z, xd, yd, zd, random) ->
                    new SpecParticle(level, x, y, z, xd, yd, zd, sprites, spec));
            }
        });
    }

    /** One configurable particle — the knobs map 1:1 onto vanilla Particle fields. */
    private static final class SpecParticle extends SingleQuadParticle {
        private final SpriteSet sprites;
        private final ParticleSpec spec;

        SpecParticle(ClientLevel level, double x, double y, double z, double xd, double yd, double zd, SpriteSet sprites, ParticleSpec spec) {
            super(level, x, y, z, xd, yd, zd, firstSprite(sprites, spec, level));
            this.sprites = sprites;
            this.spec = spec;
            // Spawn with exactly the velocity the command/caller asked for (vanilla adds jitter otherwise).
            this.xd = xd;
            this.yd = yd;
            this.zd = zd;
            this.gravity = spec.gravity;
            this.friction = spec.friction;
            this.hasPhysics = spec.physics;
            this.lifetime = Math.max(1, spec.lifetime + (spec.lifetimeVariance > 0 ? random.nextInt(spec.lifetimeVariance + 1) : 0));
            this.quadSize *= Math.max(0.01F, spec.scale);
            int rgb = parseColor(spec.tint);
            setColor(((rgb >> 16) & 0xFF) / 255F, ((rgb >> 8) & 0xFF) / 255F, (rgb & 0xFF) / 255F);
            if (spec.animated) setSpriteFromAge(sprites);
        }

        private static TextureAtlasSprite firstSprite(SpriteSet sprites, ParticleSpec spec, ClientLevel level) {
            return spec.animated ? sprites.get(0, 1) : sprites.get(level.getRandom());
        }

        @Override
        public void tick() {
            super.tick();
            if (spec.animated && !removed) setSpriteFromAge(sprites);
            if (spec.fadeOut) {
                float left = (lifetime - age) / (float) lifetime;
                setAlpha(Math.min(1F, left * 4F));
            }
        }

        @Override
        protected SingleQuadParticle.Layer getLayer() {
            return spec.translucent || spec.fadeOut ? SingleQuadParticle.Layer.TRANSLUCENT : SingleQuadParticle.Layer.OPAQUE;
        }

        @Override
        protected int getLightCoords(float partialTick) {
            return spec.emissive ? LightCoordsUtil.FULL_BRIGHT : super.getLightCoords(partialTick);
        }

        private static int parseColor(String hex) {
            try {
                return Integer.parseInt(hex.startsWith("#") ? hex.substring(1) : hex, 16) & 0xFFFFFF;
            } catch (RuntimeException e) {
                return 0xFFFFFF;
            }
        }
    }
}
