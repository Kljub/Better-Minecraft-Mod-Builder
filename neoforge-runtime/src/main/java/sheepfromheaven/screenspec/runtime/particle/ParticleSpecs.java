package sheepfromheaven.screenspec.runtime.particle;

import net.minecraft.core.particles.ParticleType;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.Registries;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.ArrayList;
import java.util.List;

/**
 * Registers each {@link ParticleSpec} as a {@link SimpleParticleType} (usable from {@code
 * /particle}, functions and mod code); its look and motion are a configurable client particle in
 * {@link ParticleSpecsClient}. The sprite list ({@code assets/<modid>/particles/<id>.json}) and the
 * textures come from the export bundle. Internal — called by
 * {@link sheepfromheaven.screenspec.runtime.ModElements}.
 */
public final class ParticleSpecs {
    private ParticleSpecs() {}

    public record Registered(ParticleSpec spec, DeferredHolder<ParticleType<?>, SimpleParticleType> type) {}

    public static void register(String modId, IEventBus modBus, List<ParticleSpec> specs) {
        if (specs.isEmpty()) return;
        DeferredRegister<ParticleType<?>> register = DeferredRegister.create(Registries.PARTICLE_TYPE, modId);
        List<Registered> registered = new ArrayList<>();
        for (ParticleSpec spec : specs) {
            registered.add(new Registered(spec, register.register(spec.id, () -> new SimpleParticleType(false))));
        }
        register.register(modBus);
        if (FMLEnvironment.getDist() == Dist.CLIENT) ParticleSpecsClient.register(modBus, registered);
    }
}
