package sheepfromheaven.screenspec.runtime;

import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiConsumer;
import java.util.function.Function;
import java.util.function.IntSupplier;

/**
 * Shared widget-building logic used by both {@link SpecScreen} and {@link SpecContainerScreen}.
 *
 * <p>Encapsulates tab state management ({@code activeTabByTabsWidget}, child-index maps, toggle
 * groups), origin resolution, visibility filtering, and the build loop — everything that would
 * otherwise be duplicated between the two screen base classes.
 *
 * <p>Each screen constructs one instance, supplies a base-position getter (centering offset for
 * {@link SpecScreen}; {@code leftPos}/{@code topPos} for {@link SpecContainerScreen}), an
 * {@code addWidget} sink, and a {@code switchTab} callback so tab buttons can trigger the screen's
 * own {@code switchTab} method (which may do additional work like firing {@code onTabSwitch}).
 */
final class SpecWidgetBuilder {

    private final ScreenSpec spec;
    private final ActionHost host;
    private final SpecWidgetRenderer renderer;
    private final IntSupplier baseX;
    private final IntSupplier baseY;
    /** Wraps {@code screen.addRenderableWidget} — returns the widget that was added. */
    private final Function<AbstractWidget, AbstractWidget> addWidget;
    /** Called when a tab button is clicked; forwards to the screen's own {@code switchTab}. */
    private final BiConsumer<String, String> switchTabCallback;

    // mutable tab + widget state — reset on each build() call
    private final Map<String, String>           activeTabByTabsWidget = new HashMap<>();
    private final Map<String, WidgetSpec>       byId;
    private final Map<String, List<WidgetSpec>> childrenByParent;
    private final Map<String, AbstractWidget>   widgetsById    = new LinkedHashMap<>();
    private final Map<String, List<String>>     toggleGroups   = new HashMap<>();

    SpecWidgetBuilder(ScreenSpec spec, ActionHost host, SpecWidgetRenderer renderer,
                      IntSupplier baseX, IntSupplier baseY,
                      Function<AbstractWidget, AbstractWidget> addWidget,
                      BiConsumer<String, String> switchTabCallback) {
        this.spec               = spec;
        this.host               = host;
        this.renderer           = renderer;
        this.baseX              = baseX;
        this.baseY              = baseY;
        this.addWidget          = addWidget;
        this.switchTabCallback  = switchTabCallback;

        Map<String, WidgetSpec>       ids      = new LinkedHashMap<>();
        Map<String, List<WidgetSpec>> children = new LinkedHashMap<>();
        for (WidgetSpec w : spec.widgets) {
            ids.put(w.id, w);
            if (w.parentId != null) {
                children.computeIfAbsent(w.parentId, k -> new ArrayList<>()).add(w);
            }
        }
        this.byId            = ids;
        this.childrenByParent = children;
    }

    // -------------------------------------------------------------------------
    // Public API used by the two screen classes
    // -------------------------------------------------------------------------

    /** Clears widget/toggle state and (re)builds all visible interactive widgets. */
    void build() {
        widgetsById.clear();
        toggleGroups.clear();
        initTabDefaults();
        for (WidgetSpec w : visibleWidgets()) {
            buildWidget(w);
        }
    }

    /** Returns the currently active tab child id for a {@code tabs} widget, or {@code null}. */
    String activeTab(String tabsWidgetId) {
        return activeTabByTabsWidget.get(tabsWidgetId);
    }

    /** Updates the active tab — called by the screen's own {@code switchTab} before it rebuilds. */
    void setActiveTab(String tabsWidgetId, String tabId) {
        activeTabByTabsWidget.put(tabsWidgetId, tabId);
    }

    /** Returns the live-built widget for {@code id}, or {@code null} if not yet built. */
    @SuppressWarnings("unchecked")
    <T extends AbstractWidget> T getWidget(String id) {
        return (T) widgetsById.get(id);
    }

    /** The raw {@link WidgetSpec} for {@code id}, or {@code null} if no widget has that id. */
    WidgetSpec widgetSpec(String id) {
        return byId.get(id);
    }

    /**
     * Whether {@code w} is visible given the current tab state and its own/ancestors' {@code
     * visible} bindings — {@code false} if any ancestor is a {@code tab} that isn't the currently
     * active child of its parent {@code tabs} widget, or if {@code w} or any ancestor has a
     * {@code visible} binding that currently resolves to {@code false}.
     */
    boolean isVisible(WidgetSpec w) {
        if (!isBindingVisible(w)) return false;
        WidgetSpec cur = w;
        while (cur.parentId != null) {
            WidgetSpec parent = byId.get(cur.parentId);
            if (parent == null) return true;
            if ("tabs".equals(parent.type) && "tab".equals(cur.type)) {
                String active = activeTabByTabsWidget.get(parent.id);
                if (active != null && !active.equals(cur.id)) return false;
            }
            if (!isBindingVisible(parent)) return false;
            cur = parent;
        }
        return true;
    }

    /**
     * Whether {@code w}'s own {@code visible} binding (if declared) currently resolves to {@code
     * true} — {@code true} when there's no such binding, or no provider is registered for it yet.
     */
    private boolean isBindingVisible(WidgetSpec w) {
        String path = w.bindings.get("visible");
        if (path == null) return true;
        String value = DataRegistry.resolve(SpecWidgetRenderer.qualify(spec.modId, path));
        return value == null || !"false".equalsIgnoreCase(value);
    }

    /** Handles a toggle-group selection: marks only {@code selectedId} as active in its group. */
    void selectToggleGroup(String group, String selectedId) {
        for (String memberId : toggleGroups.getOrDefault(group, List.of())) {
            AbstractWidget w = widgetsById.get(memberId);
            if (w instanceof ToggleButtonWidget toggle) toggle.setSelected(memberId.equals(selectedId));
        }
    }

    /**
     * Returns the visible widgets for the current tab state — useful for render loops that need
     * to iterate only the active tab's content.
     */
    List<WidgetSpec> visibleWidgets() {
        List<WidgetSpec> result = new ArrayList<>();
        for (WidgetSpec w : spec.widgets) {
            if (isVisible(w)) result.add(w);
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private void initTabDefaults() {
        for (WidgetSpec w : spec.widgets) {
            if (!"tabs".equals(w.type) || activeTabByTabsWidget.containsKey(w.id)) continue;
            for (WidgetSpec child : childrenByParent.getOrDefault(w.id, List.of())) {
                if ("tab".equals(child.type) && isBindingVisible(child)) {
                    activeTabByTabsWidget.put(w.id, child.id);
                    break;
                }
            }
        }
    }

    /** Which edge a {@code tabs} widget's tab strip sits on ({@code tab_position} prop, default top). */
    static TabButtonWidget.Side tabSide(WidgetSpec tabsWidget) {
        return switch (tabsWidget.prop("tab_position", "top")) {
            case "left"  -> TabButtonWidget.Side.LEFT;
            case "right" -> TabButtonWidget.Side.RIGHT;
            default      -> TabButtonWidget.Side.TOP;
        };
    }

    /**
     * Absolute {x, y, w, h} of a {@code tabs} widget's content pane — the widget minus its tab
     * strip. {@code tab_height} is the strip's thickness: its height for top tabs, its width for
     * side tabs. Mirrors the webapp's {@code tabContentRect}.
     */
    int[] tabBodyRect(WidgetSpec tabsWidget) {
        int[] o = originOf(tabsWidget);
        int strip = tabsWidget.propInt("tab_height", 20);
        return switch (tabSide(tabsWidget)) {
            case LEFT  -> new int[]{ o[0] + strip, o[1], tabsWidget.w - strip, tabsWidget.h };
            case RIGHT -> new int[]{ o[0], o[1], tabsWidget.w - strip, tabsWidget.h };
            case TOP   -> new int[]{ o[0], o[1] + strip, tabsWidget.w, tabsWidget.h - strip };
        };
    }

    /**
     * Resolves a widget's absolute screen position by walking its {@code parentId} chain.
     * A {@code tab} widget's content starts at its parent {@code tabs} widget's content pane
     * (see {@link #tabBodyRect}); for all other widgets the offset is additive.
     */
    int[] originOf(WidgetSpec w) {
        if (w.parentId == null) return new int[]{ baseX.getAsInt() + w.x, baseY.getAsInt() + w.y };
        WidgetSpec parent = byId.get(w.parentId);
        if (parent == null) return new int[]{ baseX.getAsInt() + w.x, baseY.getAsInt() + w.y };
        if ("tab".equals(w.type) && "tabs".equals(parent.type)) {
            int[] body = tabBodyRect(parent);
            return new int[]{ body[0], body[1] };
        }
        int[] po = originOf(parent);
        return new int[]{ po[0] + w.x, po[1] + w.y };
    }

    private void buildWidget(WidgetSpec w) {
        if ("panel".equals(w.type) || "label".equals(w.type) || "icon".equals(w.type)
                || "tab".equals(w.type) || "inventory_area".equals(w.type) || "scrollbar".equals(w.type)
                || "custom".equals(w.type)) {
            return;
        }
        if ("tabs".equals(w.type)) {
            buildTabSelector(w);
            return;
        }
        WidgetFactory factory = WidgetFactories.get(w.type);
        if (factory == null) return;
        int[] origin = originOf(w);
        AbstractWidget widget = addWidget.apply(factory.create(w, host));
        widget.setX(origin[0]);
        widget.setY(origin[1]);
        widgetsById.put(w.id, widget);
        if ("toggle_button".equals(w.type)) {
            String group = w.prop("group", "");
            if (!group.isEmpty()) toggleGroups.computeIfAbsent(group, g -> new ArrayList<>()).add(w.id);
        }
    }

    /**
     * How far a tab extends INTO the body panel below it. Vanilla draws its 32px-tall creative
     * tabs at {@code topPos - 28} — a 4px overlap: the sprite's bottom 3 rows of connection art
     * cover the panel's 3px top bevel, and its final all-grey row lands on the panel's first
     * interior row, merging the two seamlessly.
     */
    static final int TAB_OVERLAP = 4;

    /** Receives the resolved layout of one tab selector button — see {@link #forEachTab}. */
    @FunctionalInterface
    interface TabVisitor {
        void visit(WidgetSpec tab, TabButtonWidget.Position pos, boolean active, int x, int y, int w, int h);
    }

    /**
     * Resolves the selector-button layout for every {@code tab} child of {@code tabsWidget} and
     * hands each to {@code visitor}. Shared by {@link #buildTabSelector} (which builds the actual
     * buttons) and the screens' background pass (which draws inactive tabs' sprites *underneath*
     * the body panel, matching vanilla's creative-inventory layering).
     *
     * <p>The panel body starts 3px below the header (vanilla nine-slice border).
     * Active tabs extend {@link #TAB_OVERLAP}px INTO the body so their bottom connection art covers
     * the bevel, making them appear seamlessly connected — same as the webapp canvas.
     * Inactive tabs sit 2px lower and are 2px shorter (standard MC creative-inventory look).
     */
    void forEachTab(WidgetSpec tabsWidget, TabVisitor visitor) {
        List<WidgetSpec> tabs = new ArrayList<>();
        for (WidgetSpec c : childrenByParent.getOrDefault(tabsWidget.id, List.of())) {
            if ("tab".equals(c.type) && isBindingVisible(c)) tabs.add(c);
        }
        if (tabs.isEmpty()) return;

        int[] origin   = originOf(tabsWidget);
        int   headerH  = tabsWidget.propInt("tab_height", 20);
        String activeId = activeTabByTabsWidget.get(tabsWidget.id);
        TabButtonWidget.Side side = tabSide(tabsWidget);
        if (side != TabButtonWidget.Side.TOP) {
            forEachSideTab(tabsWidget, tabs, side, origin, headerH, activeId, visitor);
            return;
        }
        boolean hasLayout = tabs.stream().anyMatch(t -> t.w > 0);
        int gap      = 2;
        int defaultW = hasLayout ? 0 : Math.max(8, (tabsWidget.w - gap * Math.max(0, tabs.size()-1)) / tabs.size());
        int cursor   = 0;
        for (WidgetSpec tab : tabs) {
            int tabX = hasLayout ? tab.x : cursor;
            int tabW = hasLayout ? (tab.w > 0 ? tab.w : defaultW) : defaultW;
            boolean isActive = tab.id.equals(activeId);
            // Position variant: tab touching left edge → _1 (left), right edge → _7 (right), else _2 (middle)
            TabButtonWidget.Position pos = (tabX <= 0)
                    ? TabButtonWidget.Position.LEFT
                    : (tabX + tabW >= tabsWidget.w)
                        ? TabButtonWidget.Position.RIGHT
                        : TabButtonWidget.Position.MIDDLE;
            int btnY = origin[1] + (isActive ? 0 : 2);
            int btnH = isActive ? (headerH + TAB_OVERLAP) : (headerH - 2);
            visitor.visit(tab, pos, isActive, origin[0] + tabX, btnY, tabW, btnH);
            cursor += tabW + gap;
        }
    }

    /**
     * Side (left/right) tabs: stacked top-to-bottom, evenly sharing the widget's height (no
     * per-tab layout) — mirrors the webapp's {@code computeSideTabLayout}. {@code tab_height} is
     * the strip's width. Same overlap rules as top tabs, turned sideways: the active tab reaches
     * {@link #TAB_OVERLAP}px into the body; inactive ones sit 2px further out and are 2px thinner.
     */
    private void forEachSideTab(WidgetSpec tabsWidget, List<WidgetSpec> tabs, TabButtonWidget.Side side,
                                int[] origin, int strip, String activeId, TabVisitor visitor) {
        int gap = 2;
        int n   = tabs.size();
        int len = Math.max(16, (tabsWidget.h - gap * (n - 1)) / n);
        boolean left = side == TabButtonWidget.Side.LEFT;
        int cursor = 0;
        for (WidgetSpec tab : tabs) {
            boolean isActive = tab.id.equals(activeId);
            // For side tabs LEFT/MIDDLE/RIGHT mean top/middle/bottom of the strip — picks the
            // tab_{left,right}_{top,middle,bottom} sprite whose corner art meets the body's corner.
            TabButtonWidget.Position pos = cursor <= 0
                    ? TabButtonWidget.Position.LEFT
                    : cursor + len >= tabsWidget.h
                        ? TabButtonWidget.Position.RIGHT
                        : TabButtonWidget.Position.MIDDLE;
            int btnW = isActive ? (strip + TAB_OVERLAP) : (strip - 2);
            int btnX = left
                    ? origin[0] + (isActive ? 0 : 2)
                    : origin[0] + tabsWidget.w - strip - (isActive ? TAB_OVERLAP : 0);
            visitor.visit(tab, pos, isActive, btnX, origin[1] + cursor, btnW, len);
            cursor += len + gap;
        }
    }

    /**
     * Grows an inactive tab's selector bounds (from {@link #forEachTab}) by {@link #TAB_OVERLAP}
     * toward the body, so the screens' background pass can tuck its edge behind the body panel.
     * Returns {x, y, w, h}.
     */
    int[] inactiveTabSpriteBounds(WidgetSpec tabsWidget, int x, int y, int w, int h) {
        return switch (tabSide(tabsWidget)) {
            case LEFT  -> new int[]{ x, y, w + TAB_OVERLAP, h };
            case RIGHT -> new int[]{ x - TAB_OVERLAP, y, w + TAB_OVERLAP, h };
            case TOP   -> new int[]{ x, y, w, h + TAB_OVERLAP };
        };
    }

    private void buildTabSelector(WidgetSpec tabsWidget) {
        String tabsId = tabsWidget.id;
        boolean nested = tabsWidget.parentId != null;
        TabButtonWidget.Side side = tabSide(tabsWidget);
        forEachTab(tabsWidget, (tab, pos, isActive, x, y, w, h) -> {
            String tabId = tab.id;
            Button btn = Button.builder(Component.literal(tab.text), b -> switchTabCallback.accept(tabsId, tabId))
                .bounds(x, y, w, h)
                .build(b -> new TabButtonWidget(b, renderer, pos, side, nested));
            btn.active = !isActive;
            ((TabButtonWidget) btn).setSelected(isActive);
            addWidget.apply(btn);
            widgetsById.put(tab.id, btn);
        });
    }
}
