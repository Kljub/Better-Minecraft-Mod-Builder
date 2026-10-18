package sheepfromheaven.screenspec.runtime.sound;

import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.List;

/** Registers one {@link SoundEvent} per {@link SoundSpec}. Internal — called by {@link sheepfromheaven.screenspec.runtime.ModElements}. */
public final class SoundSpecs {
    private SoundSpecs() {}

    public static void register(String modId, IEventBus modBus, List<SoundSpec> specs) {
        if (specs.isEmpty()) return;
        DeferredRegister<SoundEvent> sounds = DeferredRegister.create(Registries.SOUND_EVENT, modId);
        for (SoundSpec spec : specs) {
            if (spec == null || spec.id == null || spec.id.isBlank()) continue;
            Identifier id = Identifier.fromNamespaceAndPath(modId, spec.id);
            sounds.register(spec.id, () -> spec.range > 0 && spec.range != 16
                ? SoundEvent.createFixedRangeEvent(id, spec.range)
                : SoundEvent.createVariableRangeEvent(id));
        }
        sounds.register(modBus);
    }
}
