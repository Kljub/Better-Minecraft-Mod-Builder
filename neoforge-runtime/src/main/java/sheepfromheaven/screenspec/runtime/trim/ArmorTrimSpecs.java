package sheepfromheaven.screenspec.runtime.trim;

import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.SmithingTemplateItem;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.event.BuildCreativeModeTabContentsEvent;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.ArrayList;
import java.util.List;

/**
 * Armor trim patterns are pure data in this MC version (trim_pattern + smithing_trim recipe +
 * paletted textures, all written by the export bundle); the one thing that needs Java is the
 * smithing template item, registered exactly like vanilla's
 * ({@code SmithingTemplateItem#createArmorTrimTemplate}, uncommon rarity, Ingredients tab).
 * Internal — called by {@link sheepfromheaven.screenspec.runtime.ModElements}.
 */
public final class ArmorTrimSpecs {
    private ArmorTrimSpecs() {}

    public static void register(String modId, IEventBus modBus, List<ArmorTrimSpec> specs) {
        if (specs.isEmpty()) return;
        DeferredRegister.Items items = DeferredRegister.createItems(modId);
        List<DeferredItem<SmithingTemplateItem>> templates = new ArrayList<>();
        for (ArmorTrimSpec spec : specs) {
            templates.add(items.registerItem(spec.id + "_armor_trim_smithing_template",
                SmithingTemplateItem::createArmorTrimTemplate, () -> new Item.Properties().rarity(Rarity.UNCOMMON)));
        }
        items.register(modBus);
        modBus.addListener(BuildCreativeModeTabContentsEvent.class, event -> {
            if (event.getTabKey() != CreativeModeTabs.INGREDIENTS) return;
            for (DeferredItem<SmithingTemplateItem> t : templates) event.accept(t.get());
        });
    }
}
