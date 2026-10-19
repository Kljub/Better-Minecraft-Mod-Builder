package sheepfromheaven.screenspec.runtime;

import net.neoforged.bus.api.IEventBus;
import sheepfromheaven.screenspec.runtime.command.CommandSpec;
import sheepfromheaven.screenspec.runtime.command.CommandSpecs;
import sheepfromheaven.screenspec.runtime.fluid.FluidSpec;
import sheepfromheaven.screenspec.runtime.fluid.FluidSpecs;
import sheepfromheaven.screenspec.runtime.gamerule.GameRuleSpec;
import sheepfromheaven.screenspec.runtime.gamerule.GameRuleSpecs;
import sheepfromheaven.screenspec.runtime.entity.EntitySpec;
import sheepfromheaven.screenspec.runtime.entity.EntitySpecs;
import sheepfromheaven.screenspec.runtime.plant.PlantSpec;
import sheepfromheaven.screenspec.runtime.plant.PlantSpecs;
import sheepfromheaven.screenspec.runtime.particle.ParticleSpec;
import sheepfromheaven.screenspec.runtime.particle.ParticleSpecs;
import sheepfromheaven.screenspec.runtime.keybind.KeyBindingSpec;
import sheepfromheaven.screenspec.runtime.keybind.KeyBindingSpecs;
import sheepfromheaven.screenspec.runtime.boat.BoatSpec;
import sheepfromheaven.screenspec.runtime.boat.BoatSpecs;
import sheepfromheaven.screenspec.runtime.projectile.ProjectileSpec;
import sheepfromheaven.screenspec.runtime.projectile.ProjectileSpecs;
import sheepfromheaven.screenspec.runtime.trim.ArmorTrimSpec;
import sheepfromheaven.screenspec.runtime.trim.ArmorTrimSpecs;
import sheepfromheaven.screenspec.runtime.villager.ProfessionSpec;
import sheepfromheaven.screenspec.runtime.villager.ProfessionSpecs;

import java.util.Arrays;

/**
 * Registers the webapp's generic "mod elements" that need real Java (lib/elements kinds with a
 * {@code manifest} output): each kind's entries are one JSON array at
 * {@code assets/<modid>/screenspec/elements/<kind>.json}. Called for every loaded mod by
 * {@code ScreenSpecMod}; a mod without any of these manifests is a no-op.
 */
public final class ModElements {
    private ModElements() {}

    private static <T> java.util.List<T> load(String namespace, String kind, Class<T[]> type) {
        return Arrays.asList(GsonSpecIO.fromClasspath(namespace, "elements/" + kind, type));
    }

    public static void register(String modId, IEventBus modBus) {
        CommandSpecs.register(modId, load(modId, "commands", CommandSpec[].class));
        GameRuleSpecs.register(modId, modBus, load(modId, "game_rules", GameRuleSpec[].class));
        FluidSpecs.register(modId, modBus, load(modId, "fluids", FluidSpec[].class));
        ProfessionSpecs.register(modId, modBus, load(modId, "villager_professions", ProfessionSpec[].class));
        sheepfromheaven.screenspec.runtime.wandering.WanderingTraderSpecs.register(modId, modBus,
            load(modId, "wandering_traders", sheepfromheaven.screenspec.runtime.wandering.WanderingTraderSpec[].class));
        PlantSpecs.register(modId, modBus, load(modId, "plants", PlantSpec[].class));
        // Sounds first: other elements may refer to the sound events.
        sheepfromheaven.screenspec.runtime.sound.SoundSpecs.register(modId, modBus,
            load(modId, "sounds", sheepfromheaven.screenspec.runtime.sound.SoundSpec[].class));
        EntitySpecs.register(modId, modBus, load(modId, "entities", EntitySpec[].class));
        ParticleSpecs.register(modId, modBus, load(modId, "particles", ParticleSpec[].class));
        KeyBindingSpecs.register(modId, modBus, load(modId, "key_bindings", KeyBindingSpec[].class));
        BoatSpecs.register(modId, modBus, load(modId, "boats", BoatSpec[].class));
        ProjectileSpecs.register(modId, modBus, load(modId, "projectiles", ProjectileSpec[].class));
        ArmorTrimSpecs.register(modId, modBus, load(modId, "armor_trims", ArmorTrimSpec[].class));
        sheepfromheaven.screenspec.runtime.mesh.MeshModelSpecs.register(modId, modBus,
            load(modId, "mesh_models", sheepfromheaven.screenspec.runtime.mesh.MeshModelSpec[].class));
    }
}
