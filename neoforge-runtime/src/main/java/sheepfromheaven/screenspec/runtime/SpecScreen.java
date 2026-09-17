package sheepfromheaven.screenspec.runtime;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Builds a real Minecraft {@link Screen} from a {@link ScreenSpec} exported by
 * the MC Screen Designer web tool.
 *
 * <p>Use the listener API to wire up behavior without subclassing:
 * <pre>{@code
 * SpecScreen screen = new SpecScreen(Component.literal("Options"), spec);
 * screen.on("save_btn",    (id, s, v) -> save());
 * screen.on("volume",      (id, s, v) -> setVolume((Double) v));
 * screen.on("close_btn",   (id, s, v) -> onClose());
 * Minecraft.getInstance().setScreen(screen);
 * }</pre>
 *
 * <p>{@code on(key)} matches both widget ids and declared {@code action} ids.
 * Action ids are qualified at runtime: a widget with {@code "action": "save"}
 * and a spec with {@code modId = "my_mod"} fires as {@code "my_mod.save"}.
 * Prefer {@link #onDeclaredAction} for validated, schema-checked registration.
 *
 * <p>Subclassing is also supported; override {@link #onAction} instead:
 * <pre>{@code
 * public class MyOptionsScreen extends SpecScreen {
 *     public MyOptionsScreen(ScreenSpec spec) {
 *         super(Component.literal("My Options"), spec);
 *     }
 *
 *     protected void onAction(String widgetId, WidgetSpec spec, Object value) {
 *         if (widgetId.equals("save_button")) save();
 *     }
 * }
 * }</pre>
 *
 * <h3>Nesting and tabs</h3>
 * <p>A widget's {@code x}/{@code y} are relative to its {@code parentId} (or to the screen
 * origin, if it has none) - see {@link SpecWidgetBuilder#originOf}. The designer's {@code tabs} widget type is
 * built on this: a {@code tabs} widget's {@code tab} children are drawn as a selector row along
 * its top edge, and only the active tab's own children are built/rendered/bound, swapped out on
 * click (see {@link #switchTab} / {@link #onTabSwitch}). A {@code tab} widget's own {@code x}/
 * {@code y}/{@code w}/{@code h} are ignored - its content area is always the space directly below
 * the selector row, filling the rest of its parent {@code tabs} widget.
 */
public class SpecScreen extends Screen implements ActionHost {
    private final ScreenSpec spec;
    private final Map<String, List<ActionListener>> listeners = new HashMap<>();
    private final List<ActionListener> globalListeners = new ArrayList<>();
    private final SpecWidgetRenderer renderer;
    private SpecWidgetBuilder builder;
    // centering offset — recalculated in init() each time the screen is (re)sized
    private int originX;
    private int originY;

    protected SpecScreen(Component title, ScreenSpec spec) {
        super(title);
        this.spec = spec;
        this.renderer = new SpecWidgetRenderer(spec);
    }

    private SpecWidgetBuilder builder() {
        if (builder == null) {
            builder = new SpecWidgetBuilder(spec, this, renderer,
                () -> originX, () -> originY,
                this::addRenderableWidget,
                this::switchTab);
        }
        return builder;
    }

    public ScreenSpec spec() {
        return spec;
    }

    @Override
    public Font getFont() {
        return this.font;
    }

    @SuppressWarnings("unchecked")
    public <T extends AbstractWidget> T getWidget(String id) {
        return builder().getWidget(id);
    }

    /**
     * Registers a listener for a specific widget id or action id.
     * When a widget fires, listeners are looked up by both the widget's {@code id}
     * and its {@code action} field (if set), so a single key can match either.
     *
     * @param key widget id (e.g. {@code "save_btn"}) or action id (e.g. {@code "my_mod:save"})
     */
    public SpecScreen on(String key, ActionListener listener) {
        listeners.computeIfAbsent(Objects.requireNonNull(key), k -> new ArrayList<>()).add(listener);
        return this;
    }

    /**
     * Registers a listener that fires for every widget action on this screen.
     */
    public SpecScreen onAny(ActionListener listener) {
        globalListeners.add(listener);
        return this;
    }

    /**
     * Called whenever a widget produces a value: a button press ({@code
     * value} is {@code null}), a toggle button's new selected state ({@code
     * Boolean}), a slider's new value ({@code Double}), or an input box's new
     * text ({@code String}). Override in subclasses to wire up behavior.
     *
     * <p>{@code actionId} is the widget's qualified action id (e.g. {@code "my_mod.save"})
     * when the widget has an {@code action} field set, or the widget id otherwise.
     */
    protected void onAction(String actionId, WidgetSpec spec, Object value) {
    }

    /**
     * Sets the display text of a label widget, overriding the static {@code text}
     * field from the spec. Safe to call from {@link #extractRenderState} each frame for live data.
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

    /** Called for any {@code WidgetSpec.type} with no registered {@link WidgetFactory} and that isn't panel/label/icon/tabs/tab. */
    protected void onUnknownWidgetType(WidgetSpec spec) {
    }

    private String qualify(String id) {
        return SpecWidgetRenderer.qualify(spec.modId, id);
    }

    /**
     * Registers a validated listener for a declared action id. Throws
     * {@link IllegalArgumentException} at startup time if {@code localAction}
     * is not listed in {@link ScreenSpec#actions}, catching misconfiguration
     * before the game runs.
     *
     * <pre>{@code
     * // spec has modId="my_mod", actions contains "save"
     * screen.onDeclaredAction("save", (id, s, v) -> save());
     * // listens for "my_mod.save"; throws if "save" not in spec.actions
     * }</pre>
     *
     * @param localAction unscoped action name as declared in the designer
     */
    public SpecScreen onDeclaredAction(String localAction, ActionListener listener) {
        java.util.Set<String> known = spec.knownActions();
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

        // listeners keyed on the declared action id
        if (action != null && !action.isEmpty()) {
            List<ActionListener> byAction = listeners.get(action);
            if (byAction != null) {
                for (ActionListener l : byAction) l.on(widgetId, widgetSpec, value);
            }
        }

        // listeners keyed on the widget id
        List<ActionListener> byId = listeners.get(widgetId);
        if (byId != null) {
            for (ActionListener l : byId) l.on(widgetId, widgetSpec, value);
        }

        // global listeners
        for (ActionListener l : globalListeners) l.on(widgetId, widgetSpec, value);

        // subclass hook — receives the action id when set, widget id otherwise
        String actionId = (action != null && !action.isEmpty()) ? action : widgetId;
        onAction(actionId, widgetSpec, value);
    }

    @Override
    public void selectToggleGroup(String group, String selectedId) {
        builder().selectToggleGroup(group, selectedId);
    }

    /**
     * Switches a {@code tabs} widget to a different child tab: rebuilds this screen's widgets
     * (swapping in the new tab's content) and fires {@link #onTabSwitch}. No-op if {@code tabId}
     * is already active.
     */
    public void switchTab(String tabsWidgetId, String tabId) {
        if (tabId.equals(builder().activeTab(tabsWidgetId))) return;
        builder().setActiveTab(tabsWidgetId, tabId);
        this.clearWidgets();
        init();
        onTabSwitch(tabsWidgetId, tabId);
    }

    /** The id of the currently active child of a {@code tabs} widget, or {@code null} if unknown. */
    public String activeTab(String tabsWidgetId) {
        return builder().activeTab(tabsWidgetId);
    }

    /** Called after this screen switches a {@code tabs} widget to a different tab via {@link #switchTab}. */
    protected void onTabSwitch(String tabsWidgetId, String tabId) {
    }

    @Override
    protected void init() {
        originX = (this.width  - spec.width)  / 2;
        originY = (this.height - spec.height) / 2;
        builder().build();
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTicks) {
        applyBindings();
        renderer.refreshBindings();
        for (WidgetSpec w : spec.widgets) {
            if (!w.type.equals("tabs")) continue;
            // Inactive tabs render beneath the body panel (see SpecContainerScreen.renderBg).
            builder().forEachTab(w, (tab, pos, active, x, y, tw, th) -> {
                if (!active) renderer.renderTab(new McDrawContext(graphics), false, pos, w.parentId != null, x, y, tw, th + SpecWidgetBuilder.TAB_OVERLAP);
            });
            renderTabBody(graphics, w);
        }
        for (WidgetSpec w : builder().visibleWidgets()) {
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
        for (var renderable : renderables) {
            renderable.extractRenderState(graphics, mouseX, mouseY, partialTicks);
        }
        for (WidgetSpec w : builder().visibleWidgets()) {
            if (w.type.equals("label"))     renderLabel(graphics, w);
            else if (w.type.equals("icon")) renderIcon(graphics, w);
            else if (w.type.equals("requirement")) renderRequirement(graphics, w);
            else if (w.type.equals("button") || w.type.equals("toggle_button")) renderButtonIcon(graphics, w);
        }
    }

    /**
     * Draws the raised-panel bevel for the body area below a {@code tabs} widget's header row.
     * Active tab buttons extend 3px into this body (see {@link SpecWidgetBuilder}) to cover the
     * panel's top bevel edge, visually connecting them — same as the webapp canvas.
     */
    protected void renderTabBody(GuiGraphicsExtractor graphics, WidgetSpec tabsWidget) {
        int[] origin = builder().originOf(tabsWidget);
        int tabHeight = tabsWidget.propInt("tab_height", 20);
        renderer.renderVanillaPanel(new McDrawContext(graphics), origin[0], origin[1] + tabHeight, tabsWidget.w, tabsWidget.h - tabHeight);
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
     * Draws a {@code panel} widget using the MC nine-slice sprite so it matches
     * the webapp's WYSIWYG preview. Override for custom textures per {@code style}.
     */
    protected void renderPanel(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] origin = builder().originOf(w);
        renderer.renderPanel(new McDrawContext(graphics), w, origin[0], origin[1]);
    }

    /**
     * Draws a {@code label} widget's text, honoring the {@code color},
     * {@code shadow} and {@code align} props from the designer.
     */
    protected void renderLabel(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] origin = builder().originOf(w);
        renderer.renderLabel(new McDrawContext(graphics), this.font, w, origin[0], origin[1]);
    }

    /**
     * Draws a {@code sprite} widget as a flat textured quad. Override for custom texture resolution.
     */
    protected void renderSprite(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] origin = builder().originOf(w);
        renderer.renderSprite(new McDrawContext(graphics), w, origin[0], origin[1]);
    }

    /**
     * Draws a {@code progress} widget as a solid-fill bar. Override for custom styling.
     */
    protected void renderProgress(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] origin = builder().originOf(w);
        renderer.renderProgress(new McDrawContext(graphics), this.font, w, origin[0], origin[1]);
    }

    /**
     * Draws an {@code xp_bar} widget: a flat-fill horizontal bar in vanilla experience-bar
     * colors (no built-in label — place a {@code label} widget above it if you want to show
     * the level number).
     */
    protected void renderXpBar(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] origin = builder().originOf(w);
        renderer.renderXpBar(new McDrawContext(graphics), w, origin[0], origin[1]);
    }

    /** Draws a {@code heart_bar} widget using real vanilla heart sprites. */
    protected void renderHeartBar(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] origin = builder().originOf(w);
        renderer.renderHeartBar(new McDrawContext(graphics), this.font, w, origin[0], origin[1]);
    }

    /** Draws an {@code armor_bar} widget using real vanilla armor sprites. */
    protected void renderArmorBar(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] origin = builder().originOf(w);
        renderer.renderArmorBar(new McDrawContext(graphics), this.font, w, origin[0], origin[1]);
    }

    /** Draws a {@code hunger_bar} widget using real vanilla food sprites. */
    protected void renderHungerBar(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] origin = builder().originOf(w);
        renderer.renderHungerBar(new McDrawContext(graphics), this.font, w, origin[0], origin[1]);
    }

    /** Draws a {@code boss_bar} widget using real vanilla boss-bar sprites. */
    protected void renderBossBar(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] origin = builder().originOf(w);
        renderer.renderBossBar(new McDrawContext(graphics), this.font, w, origin[0], origin[1]);
    }

    /** Draws a {@code skill_check} widget's sweeping dial. */
    protected void renderSkillCheck(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] origin = builder().originOf(w);
        renderer.renderSkillCheck(new McDrawContext(graphics), this.font, w, origin[0], origin[1]);
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

    /**
     * Draws an {@code icon} widget. No-op by default; override
     * {@link #resolveIcon} to map an icon id to your mod's texture.
     */
    protected void renderIcon(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] origin = builder().originOf(w);
        renderer.renderIcon(new McDrawContext(graphics), w, origin[0], origin[1], this::resolveIcon);
    }

    /** Resolves an {@code icon} widget's {@code icon} id to a texture location. Returns {@code null} (no-op) by default. */
    protected Identifier resolveIcon(WidgetSpec w) {
        return null;
    }

    /**
     * Draws a {@code requirement} widget: an item icon with a satisfied/unmet colored border.
     * Uses {@link #resolveIcon} to map the widget's {@code icon} id to a texture, same as {@code icon}.
     */
    protected void renderRequirement(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] origin = builder().originOf(w);
        renderer.renderRequirement(new McDrawContext(graphics), w, origin[0], origin[1], this::resolveIcon);
    }

    /**
     * Draws a {@code button}/{@code toggle_button} widget's icon overlay, if its {@code icon} id
     * resolves to something (see {@link #resolveIcon}). No-op by default.
     */
    protected void renderButtonIcon(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] origin = builder().originOf(w);
        renderer.renderButtonIcon(new McDrawContext(graphics), w, origin[0], origin[1], this::resolveIcon);
    }

    /**
     * Draws a {@code custom} widget by delegating to its registered {@link CustomWidgetRenderer},
     * or a labeled placeholder if none is registered for its {@code customType}.
     */
    protected void renderCustom(GuiGraphicsExtractor graphics, WidgetSpec w) {
        int[] origin = builder().originOf(w);
        renderer.renderCustom(graphics, this.font, w, origin[0], origin[1]);
    }

    /** Draws a {@code player_preview} widget: the live local player model, eyes following the mouse. */
    protected void renderPlayerPreview(GuiGraphicsExtractor graphics, WidgetSpec w, int mouseX, int mouseY) {
        int[] origin = builder().originOf(w);
        renderer.renderPlayerPreview(graphics, w, origin[0], origin[1], mouseX, mouseY);
    }
}
