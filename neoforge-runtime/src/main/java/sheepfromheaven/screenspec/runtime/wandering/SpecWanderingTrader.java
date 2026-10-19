package sheepfromheaven.screenspec.runtime.wandering;

import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.npc.wanderingtrader.WanderingTrader;
import net.minecraft.world.item.trading.MerchantOffers;
import net.minecraft.world.item.trading.TradeSet;
import net.minecraft.world.level.Level;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A vanilla wandering trader (same AI, despawning, llamas, invisibility potion at night) whose
 * offers come from the mod's own trade sets instead of vanilla's. The sets are per EntityType,
 * configured by the factory (the super constructor runs before any field of ours would be set).
 */
public class SpecWanderingTrader extends WanderingTrader {
    private static final Map<EntityType<?>, List<ResourceKey<TradeSet>>> TRADE_SETS = new ConcurrentHashMap<>();

    public SpecWanderingTrader(EntityType<? extends WanderingTrader> type, Level level) {
        super(type, level);
    }

    static void configure(EntityType<?> type, String modId, String id) {
        TRADE_SETS.put(type, List.of("buying", "rare", "common").stream()
            .map(pool -> ResourceKey.create(Registries.TRADE_SET, Identifier.fromNamespaceAndPath(modId, id + "/" + pool)))
            .toList());
    }

    @Override
    protected void updateTrades(ServerLevel level) {
        MerchantOffers offers = this.getOffers();
        for (ResourceKey<TradeSet> set : TRADE_SETS.getOrDefault(this.getType(), List.of())) this.addOffersFromTradeSet(level, offers, set);
    }
}
