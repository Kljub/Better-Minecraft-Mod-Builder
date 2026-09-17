package sheepfromheaven.screenspec.runtime;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.AbstractContainerMenu;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Builds a real Minecraft {@link AbstractContainerScreen} - one with player-placeable inventory
 * slots - from a {@link ScreenSpec} whose {@code container} field is set. Counterpart to
 * {@link SpecScreen} for screens that need slots; see that class for the plain, slotless case.
 *
 * <p>The mod still writes its own {@code AbstractContainerMenu} subclass and registers a
 * {@code MenuType} for it (this library only renders - see the {@code container/menu system} note
 * in the README) - build its slots with {@link SpecSlots} so the same {@link SlotAreaSpec} layout
 * drives both the server-side slot positions and the background this class draws:
 *
 * <pre>{@code
 * public class MyScreen extends SpecContainerScreen<MyMenu> {
 *     public MyScreen(MyMenu menu, Inventory playerInventory, Component title, ScreenSpec spec) {
 *         super(menu, playerInventory, title, spec);
 *     }
 * }
 * }</pre>
 */
public class SpecContainerScreen<T extends AbstractContainerMenu> extends AbstractContainerScreen<T> implements ActionHost {
    private final ScreenSpec spec;
    private final ContainerSpec containerSpec;
    private final Map<String, ScrollableSlotArea> scrollableAreas;
    private final SpecWidgetRenderer renderer;
    private SpecWidgetBuilder builder;
    private final Map<String, List<ActionListener>> listeners = new HashMap<>();
    private final List<ActionListener> globalListeners = new ArrayList<>();

    /**
     * Opens this screen by re-reading the spec JSON from disk on every open — use this constructor
     * during development so "Save to test mod" + reopen takes effect immediately without restarting
     * or triggering F3+T. Reads via the ClassLoader (which opens a fresh stream for directory
     * classpath entries in dev, bypassing the ResourceManager's in-memory cache). In production,
     * prefer the {@link #SpecContainerScreen(AbstractContainerMenu, Inventory, Component, ScreenSpec)}
     * overload with a {@code static final} spec.
     */
    public SpecContainerScreen(T menu, Inventory inventory, Component title, String namespace, String specName) {
        this(menu, inventory, title, ScreenSpecLoader.fromClasspath(namespace, specName));
    }

    public SpecContainerScreen(T menu, Inventory inventory, Component title, ScreenSpec spec) {
        super(menu, inventory, title, spec.width, spec.height);
        this.spec = spec;
        this.containerSpec = Objects.requireNonNull(spec.container, "spec.container is null - use SpecScreen for slotless screens");
        this.scrollableAreas = menu instanceof ScrollableAreaHost host ? host.scrollableAreas() : Map.of();
        this.renderer = new SpecWidgetRenderer(spec);
        this.inventoryLabelY = this.imageHeight - 94;
    }

    public ScreenSpec spec() {
        return spec;
    }

    private SpecWidgetBuilder builder() {
        if (builder == null) {
            builder = new SpecWidgetBuilder(spec, this, renderer,
                () -> leftPos, () -> topPos,
                this::addRenderableWidget,
                this::switchTab);
        }
        return builder;
    }

    /**
     * Sets the display text of a label widget, overriding the static {@code text} field from the
     * spec. Safe to call from {@link #extractRenderState} each frame for live data.
     */
    protected void bindText(String widgetId, String text) {
        renderer.bindText(widgetId, text);
    }

    /**
     * Sets a progress widget's numeric value, overriding its static {@code value} prop. Safe to
     * call from {@link #extractRenderState} each frame for live data.
     */
    protected void bindValue(String widgetId, double value) {
        renderer.bindValue(widgetId, value);
    }

    @SuppressWarnings("unchecked")
    public <T2 extends AbstractWidget> T2 getWidget(String id) {
        return builder().getWidget(id);
    }

    /** The id of the currently active child of a {@code tabs} widget, or {@code null} if unknown. */
    public String activeTab(String tabsWidgetId) {
        return builder().activeTab(tabsWidgetId);
    }

    // --- ActionHost implementation ---

    private String qualify(String id) {
        return SpecWidgetRenderer.qualify(spec.modId, id);
    }

    /**
     * Registers a listener for a specific widget id or action id.
     *
     * @param key widget id (e.g. {@code "save_btn"}) or action id (e.g. {@code "my_mod:save"})
     */
    public SpecContainerScreen<T> on(String key, ActionListener listener) {
        listeners.computeIfAbsent(Objects.requireNonNull(key), k -> new ArrayList<>()).add(listener);
        return this;
    }

    /** Registers a listener that fires for every widget action on this screen. */
    public SpecContainerScreen<T> onAny(ActionListener listener) {
        globalListeners.add(listener);
        return this;
    }

    /**
     * Registers a validated listener for a declared action id. Throws
     * {@link IllegalArgumentException} at startup time if {@code localAction}
     * is not listed in {@link ScreenSpec#actions}.
     */
    public SpecContainerScreen<T> onDeclaredAction(String localAction, ActionListener listener) {
        Set<String> known = spec.knownActions();
        if (!known.isEmpty() && !known.contains(localAction)) {
            throw new IllegalArgumentException(
                "Action \"" + localAction + "\" is not declared in screen \""
                + spec.id + "\". Known actions: " + known
            );
        }
        return on(qualify(localAction), listener);
    }

    @Override
    public void dispatchAction(String widgetId, WidgetSpec widgetSpec, Object value) {
        String action = qualify(widgetSpec.action);

        if (action != null && !action.isEmpty()) {
            List<ActionListener> byAction = listeners.get(action);
            if (byAction != null) {
                for (ActionListener l : byAction) l.on(widgetId, widgetSpec, value);
            }
        }

        List<ActionListener> byId = listeners.get(widgetId);
        if (byId != null) {
            for (ActionListener l : byId) l.on(widgetId, widgetSpec, value);
        }

        for (ActionListener l : globalListeners) l.on(widgetId, widgetSpec, value);

        String actionId = (action != null && !action.isEmpty()) ? action : widgetId;
        onAction(actionId, widgetSpec, value);
    }

    @Override
    public void selectToggleGroup(String group, String selectedId) {
        builder().selectToggleGroup(group, selectedId);
    }

    @Override
    public Font getFont() {
        return this.font;
    }

    /**
     * Called whenever a widget fires an action (button press, toggle, slider, input).
     * Override in subclasses to wire up behavior — mirrors {@link SpecScreen#onAction}.
     *
     * <p>{@code actionId} is the widget's qualified action id (e.g. {@code "my_mod.save"})
     * when the widget has an {@code action} field set, or the widget id otherwise.
     */
    protected void onAction(String actionId, WidgetSpec widgetSpec, Object value) {
    }

    /** Switches a {@code tabs} widget to the given child tab and rebuilds interactive widgets. */
    public void switchTab(String tabsWidgetId, String tabId) {
        if (tabId.equals(builder().activeTab(tabsWidgetId))) return;
        builder().setActiveTab(tabsWidgetId, tabId);
        this.clearWidgets();
        init();
        onTabSwitch(tabsWidgetId, tabId);
    }

    /** Called after this screen switches a {@code tabs} widget to a different tab via {@link #switchTab}. */
    protected void onTabSwitch(String tabsWidgetId, String tabId) {
    }

    /** Called for any {@code WidgetSpec.type} with no registered {@link WidgetFactory} and that isn't panel/label/icon/tabs/tab. */
    protected void onUnknownWidgetType(WidgetSpec spec) {
    }

    @Override
    protected void init() {
        super.init();
        builder().build();
        syncAreaVisibility();
        Set<String> explicitTargets = new HashSet<>();
        for (WidgetSpec w : this.spec.widgets) {
            if (!w.type.equals("scrollbar") || !builder().isVisible(w)) continue;
            String targetId = w.prop("target", "");
            ScrollableSlotArea target = scrollableAreas.get(targetId);
            explicitTargets.add(targetId);
            // an explicitly-placed scrollbar still only shows up once its target actually overflows
            if (target != null && !target.scrollable()) {
                continue;
            }
            // the target's own axis is the source of truth once it resolves; the widget's prop only matters standalone
            boolean horizontal = target != null ? target.horizontal() : "x".equals(w.prop("axis", "y"));
            addRenderableWidget(new SpecScrollbarWidget(leftPos + w.x, topPos + w.y, w.w, w.h, this, target, horizontal));
        }
        // no designer widget targets these, but they turned out to need one anyway - default to the area's right (or bottom) edge
        for (SlotAreaSpec area : this.containerSpec.slots) {
            if (!isAreaVisible(area.id)) continue;
            ScrollableSlotArea scrollArea = scrollableAreas.get(area.id);
            if (scrollArea == null || !scrollArea.scrollable() || explicitTargets.contains(area.id)) {
                continue;
            }
            boolean horizontal = scrollArea.horizontal();
            int gridW = scrollArea.visibleCols() * area.slot_size;
            int gridH = scrollArea.visibleRows() * area.slot_size;
            int barX, barY, barW, barH;
            if (horizontal) {
                barX = leftPos + area.x;
                barY = topPos + area.y + gridH;
                barW = gridW;
                barH = SpecScrollbarWidget.DEFAULT_WIDTH;
            } else {
                barX = leftPos + area.x + gridW;
                barY = topPos + area.y;
                barW = SpecScrollbarWidget.DEFAULT_WIDTH;
                barH = gridH;
            }
            addRenderableWidget(new SpecScrollbarWidget(barX, barY, barW, barH, this, scrollArea, horizontal));
        }
    }

    /**
     * If {@link #menu} implements {@link TabAwareAreaHost}, hides/shows each {@code inventory_area}
     * widget's slots to match the current tab state — otherwise vanilla would keep rendering an
     * inactive tab's slot items on top of whichever tab is actually showing (see {@link
     * SlotAreaVisibility}).
     */
    private void syncAreaVisibility() {
        if (!(this.menu instanceof TabAwareAreaHost host)) return;
        for (WidgetSpec w : this.spec.widgets) {
            if (!"inventory_area".equals(w.type)) continue;
            host.setAreaVisible(w.id, builder().isVisible(w));
        }
    }

    /** Whether {@code areaId}'s backing {@code inventory_area} widget is visible given the current tab state. */
    private boolean isAreaVisible(String areaId) {
        WidgetSpec w = builder().widgetSpec(areaId);
        return w == null || builder().isVisible(w);
    }

    private void applyBindings() {
        renderer.refreshBindings();
        for (WidgetSpec w : builder().visibleWidgets()) {
            if (w.bindings.isEmpty()) continue;
            AbstractWidget widget = builder().getWidget(w.id);
            if (widget == null) continue;
            String enabled = w.bindings.get("enabled");
            if (enabled != null) {
                String value = DataRegistry.resolve(qualify(enabled));
                if (value != null) widget.active = Boolean.parseBoolean(value);
            }
            String visible = w.bindings.get("visible");
            if (visible != null) {
                String value = DataRegistry.resolve(qualify(visible));
                if (value != null) widget.visible = Boolean.parseBoolean(value);
            }
            String text = w.bindings.get("text");
            if (text != null) {
                String value = DataRegistry.resolve(qualify(text));
                if (value != null) widget.setMessage(Component.literal(value));
            }
        }
    }

    /**
     * Draws the screen background: vanilla panel texture covering the full spec area, then
     * the tab-body panel, then explicit {@code panel} widgets, then slot grid borders.
     * Called by the MC rendering pipeline before interactive widgets and labels.
     */
    @Override
    public void extractBackground(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float a) {
        applyBindings();
        boolean hasTabs = this.spec.widgets.stream().anyMatch(w -> w.type.equals("tabs"));
        if (!hasTabs) renderer.renderVanillaPanel(new McDrawContext(graphics), leftPos, topPos, imageWidth, imageHeight);
        for (WidgetSpec w : this.spec.widgets) {
            if (!w.type.equals("tabs")) continue;
            // Inactive tabs render beneath the body panel (extended by the bevel so their bottom
            // edge tucks behind it) — vanilla creative-inventory layering. The active tab's sprite
            // is drawn by its TabButtonWidget, on top of the panel.
            builder().forEachTab(w, (tab, pos, active, x, y, tw, th) -> {
                if (!active) renderer.renderTab(new McDrawContext(graphics), false, pos, w.parentId != null, x, y, tw, th + SpecWidgetBuilder.TAB_OVERLAP);
            });
            renderTabBody(graphics, w);
        }
        for (WidgetSpec w : this.spec.widgets) {
            if (!builder().isVisible(w)) continue;
            if (w.type.equals("panel"))          renderPanel(graphics, w);
            else if (w.type.equals("sprite"))    renderSprite(graphics, w);
            else if (w.type.equals("progress"))  renderProgress(graphics, w);
            else if (w.type.equals("xp_bar"))    renderXpBar(graphics, w);
            else if (w.type.equals("heart_bar"))  renderHeartBar(graphics, w);
            else if (w.type.equals("armor_bar"))  renderArmorBar(graphics, w);
            else if (w.type.equals("hunger_bar")) renderHungerBar(graphics, w);
            else if (w.type.equals("boss_bar"))   renderBossBar(graphics, w);
            else if (w.type.equals("skill_check")) renderSkillCheck(graphics, w);
            else if (w.type.equals("custom"))    renderCustom(graphics, w);
            else if (w.type.equals("player_preview")) renderPlayerPreview(graphics, w, mouseX, mouseY);
        }
        for (SlotAreaSpec area : this.containerSpec.slots) {
            if (isAreaVisible(area.id)) drawSlotGrid(graphics, area);
        }
    }

    /** Draws the raised-panel bevel for the body area below a {@code tabs} widget's header row. */
    protected void renderTabBody(GuiGraphicsExtractor graphics, WidgetSpec tabsWidget) {
        int[] origin = builder().originOf(tabsWidget);
        int tabHeight = tabsWidget.propInt("tab_height", 20);
        renderer.renderVanillaPanel(new McDrawContext(graphics), origin[0], origin[1] + tabHeight, tabsWidget.w, tabsWidget.h - tabHeight);
    }

    /**
     * Renders spec {@code label} and {@code icon} widgets (and suppresses vanilla's automatic
     * title/"Inventory" text). Called by {@link AbstractContainerScreen} already inside a
     * {@code pose().translate(leftPos, topPos)} block, so all coordinates here must be
     * screen-relative (0,0 = screen top-left corner).
     */
    @Override
    protected void extractLabels(GuiGraphicsExtractor graphics, int xm, int ym) {
        renderer.refreshBindings();
        for (WidgetSpec w : builder().visibleWidgets()) {
            int[] o = builder().originOf(w);
            int rx = o[0] - this.leftPos;
            int ry = o[1] - this.topPos;
            if (w.type.equals("label"))     renderer.renderLabel(new McDrawContext(graphics), this.font, w, rx, ry);
            else if (w.type.equals("icon")) renderer.renderIcon(new McDrawContext(graphics), w, rx, ry, this::resolveIcon);
            else if (w.type.equals("requirement")) renderer.renderRequirement(new McDrawContext(graphics), w, rx, ry, this::resolveIcon);
            else if (w.type.equals("button") || w.type.equals("toggle_button")) renderer.renderButtonIcon(new McDrawContext(graphics), w, rx, ry, this::resolveIcon);
        }
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        for (SlotAreaSpec area : this.containerSpec.slots) {
            if (!isAreaVisible(area.id)) continue;
            ScrollableSlotArea scrollArea = scrollableAreas.get(area.id);
            if (scrollArea == null) continue;
            int x = leftPos + area.x, y = topPos + area.y;
            int w = scrollArea.visibleCols() * area.slot_size, h = scrollArea.visibleRows() * area.slot_size;
            if (mouseX >= x && mouseX < x + w && mouseY >= y && mouseY < y + h) {
                sendScrollButton(scrollArea, scrollArea.scrollRow() - (int) Math.signum(scrollY));
                return true;
            }
        }
        return super.mouseScrolled(mouseX, mouseY, scrollX, scrollY);
    }

    /**
     * Applies a scroll locally (for instant feedback) and networks it to the server.
     * Called by {@link SpecScrollbarWidget} and {@link #mouseScrolled}; not meant for mod code.
     */
    void sendScrollButton(ScrollableSlotArea area, int row) {
        int id = SpecScroll.encode(this.containerSpec, area.area().id, row);
        this.menu.clickMenuButton(this.minecraft.player, id);
        this.minecraft.gameMode.handleInventoryButtonClick(this.menu.containerId, id);
    }

    /**
     * Draws a vanilla-styled slot grid for {@code area}. Row count comes from
     * {@link ScrollableSlotArea#visibleRows()} when scrollable, otherwise {@code area.viewport_rows}.
     */
    protected void drawSlotGrid(GuiGraphicsExtractor graphics, SlotAreaSpec area) {
        int x = leftPos + area.x;
        int y = topPos + area.y;
        ScrollableSlotArea scrollArea = scrollableAreas.get(area.id);
        int rows = scrollArea != null ? scrollArea.visibleRows() : area.viewport_rows;
        int cols = scrollArea != null ? scrollArea.visibleCols() : area.cols;
        int size = area.slot_size;
        for (int row = 0; row < rows; row++) {
            for (int col = 0; col < cols; col++) {
                int sx = x + col * size;
                int sy = y + row * size;
                graphics.fill(sx,            sy,            sx + size,     sy + 1,        0xFF373737);
                graphics.fill(sx,            sy,            sx + 1,        sy + size,     0xFF373737);
                graphics.fill(sx,            sy + size - 1, sx + size,     sy + size,     0xFFFFFFFF);
                graphics.fill(sx + size - 1, sy,            sx + size,     sy + size,     0xFFFFFFFF);
                graphics.fill(sx + 1,        sy + 1,        sx + size - 1, sy + size - 1, 0xFF8B8B8B);
            }
        }
    }

    protected void renderPanel(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] o = builder().originOf(w);
        renderer.renderPanel(new McDrawContext(graphics), w, o[0], o[1]);
    }

    /** Draws a {@code sprite} widget as a flat textured quad. Override for custom texture resolution. */
    protected void renderSprite(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] o = builder().originOf(w);
        renderer.renderSprite(new McDrawContext(graphics), w, o[0], o[1]);
    }

    /** Draws a {@code progress} widget as a solid-fill bar. Override for custom styling. */
    protected void renderProgress(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] o = builder().originOf(w);
        renderer.renderProgress(new McDrawContext(graphics), this.font, w, o[0], o[1]);
    }

    /** Draws an {@code xp_bar} widget using the real vanilla experience-bar sprites. */
    protected void renderXpBar(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] o = builder().originOf(w);
        renderer.renderXpBar(new McDrawContext(graphics), w, o[0], o[1]);
    }

    /** Draws a {@code heart_bar} widget using real vanilla heart sprites. */
    protected void renderHeartBar(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] o = builder().originOf(w);
        renderer.renderHeartBar(new McDrawContext(graphics), this.font, w, o[0], o[1]);
    }

    /** Draws an {@code armor_bar} widget using real vanilla armor sprites. */
    protected void renderArmorBar(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] o = builder().originOf(w);
        renderer.renderArmorBar(new McDrawContext(graphics), this.font, w, o[0], o[1]);
    }

    /** Draws a {@code hunger_bar} widget using real vanilla food sprites. */
    protected void renderHungerBar(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] o = builder().originOf(w);
        renderer.renderHungerBar(new McDrawContext(graphics), this.font, w, o[0], o[1]);
    }

    /** Draws a {@code boss_bar} widget using real vanilla boss-bar sprites. */
    protected void renderBossBar(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] o = builder().originOf(w);
        renderer.renderBossBar(new McDrawContext(graphics), this.font, w, o[0], o[1]);
    }

    /** Draws a {@code skill_check} widget's sweeping dial. */
    protected void renderSkillCheck(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] o = builder().originOf(w);
        renderer.renderSkillCheck(new McDrawContext(graphics), this.font, w, o[0], o[1]);
    }

    /** Restarts a {@code skill_check} widget's sweep, e.g. to begin its next attempt. */
    public void resetSkillCheck(String widgetId) {
        renderer.resetSkillCheck(widgetId);
    }

    @Override
    public boolean keyPressed(KeyEvent event) {
        if (super.keyPressed(event)) {
            return true;
        }
        for (WidgetSpec w : builder().visibleWidgets()) {
            if (renderer.handleSkillCheckKey(w, event.key(), this)) {
                return true;
            }
        }
        return false;
    }

    protected void renderLabel(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] o = builder().originOf(w);
        renderer.renderLabel(new McDrawContext(graphics), this.font, w, o[0], o[1]);
    }

    protected void renderIcon(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] o = builder().originOf(w);
        renderer.renderIcon(new McDrawContext(graphics), w, o[0], o[1], this::resolveIcon);
    }

    /** Resolves an {@code icon} widget's {@code icon} id to a texture location. Returns {@code null} (no-op) by default. */
    protected Identifier resolveIcon(WidgetSpec w) {
        return null;
    }

    /**
     * Draws a {@code custom} widget by delegating to its registered {@link CustomWidgetRenderer},
     * or a labeled placeholder if none is registered for its {@code customType}.
     */
    protected void renderCustom(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] o = builder().originOf(w);
        renderer.renderCustom(graphics, this.font, w, o[0], o[1]);
    }

    /** Draws a {@code player_preview} widget: the live local player model, eyes following the mouse. */
    protected void renderPlayerPreview(GuiGraphicsExtractor graphics, WidgetSpec w, int mouseX, int mouseY) {
        int[] o = builder().originOf(w);
        renderer.renderPlayerPreview(graphics, w, o[0], o[1], mouseX, mouseY);
    }
}
