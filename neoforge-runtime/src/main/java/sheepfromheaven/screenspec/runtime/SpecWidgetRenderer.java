package sheepfromheaven.screenspec.runtime;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.Player;

import java.util.HashMap;
import java.util.Map;

/**
 * Renders the decoration widget kinds - {@code panel}, {@code label}, {@code icon} - and resolves
 * their {@code text} bindings identically for {@link SpecScreen} and {@link SpecContainerScreen},
 * so a widget spec looks and behaves the same regardless of which one ends up hosting it. Before
 * this class existed the two screens each reimplemented these renderers by hand and had drifted -
 * {@code SpecContainerScreen} drew panels as flat fills instead of the nine-slice sprite and had no
 * {@code text} binding or {@code icon} support at all. That drift is exactly the kind of thing that
 * forces a mod author extending this library to learn two slightly different widget models
 * depending on whether their screen happens to have inventory slots; centralizing the rendering
 * here means that choice only affects slots, not everything else on the screen.
 *
 * <p>Position is passed in per call rather than owned here, since {@link SpecScreen} centers its
 * spec in the window (an {@code originX}/{@code originY} offset) while {@link SpecContainerScreen}
 * anchors it at the container's {@code leftPos}/{@code topPos} - the one difference that's actually
 * inherent to the two screens' base classes, not an accident of duplicated code.
 */
final class SpecWidgetRenderer {
    private final ScreenSpec spec;
    // resolved bound text for decoration widgets (label/icon) - cleared and recomputed each frame
    private final Map<String, String> boundText = new HashMap<>();
    // subclass-driven text overrides - NOT cleared each frame; take priority over boundText
    private final Map<String, String> pinnedText = new HashMap<>();
    // resolved bound value for progress widgets - cleared and recomputed each frame
    private final Map<String, Double> boundValue = new HashMap<>();
    // subclass-driven value overrides - NOT cleared each frame; take priority over boundValue
    private final Map<String, Double> pinnedValue = new HashMap<>();
    // resolved bound satisfied flag for requirement widgets - cleared and recomputed each frame
    private final Map<String, Boolean> boundSatisfied = new HashMap<>();
    // src path → Identifier cache for sprite widgets - avoids allocation on every render frame
    private final Map<String, Identifier> spriteTexCache = new HashMap<>();
    // skill_check: wall-clock ms each widget's sweep started, lazily set on first render
    private final Map<String, Long> skillCheckStart = new HashMap<>();
    // skill_check: whether this sweep has already fired its key-press outcome (blocks re-firing)
    private final Map<String, Boolean> skillCheckResolved = new HashMap<>();

    SpecWidgetRenderer(ScreenSpec spec) {
        this.spec = spec;
    }

    /** See {@code SpecScreen#bindText} / {@code SpecContainerScreen#bindText}. */
    void bindText(String widgetId, String text) {
        pinnedText.put(widgetId, text);
    }

    /** See {@code SpecScreen#bindValue} / {@code SpecContainerScreen#bindValue}. */
    void bindValue(String widgetId, double value) {
        pinnedValue.put(widgetId, value);
    }

    /**
     * Qualifies a short id with {@code modId} using a {@code "."} separator (e.g. {@code "health"}
     * -> {@code "my_mod.health"}). Ids that are {@code null}, empty, already contain {@code "."}, or
     * whose spec has no {@code modId} are returned unchanged.
     */
    static String qualify(String modId, String id) {
        if (id == null || id.isEmpty() || id.contains(".") || modId == null || modId.isEmpty()) {
            return id;
        }
        return modId + "." + id;
    }

    /**
     * Recomputes {@link #boundText} and {@link #boundValue} from every widget's declared {@code
     * text}/{@code value} bindings. Call once per frame before rendering labels/icons/progress
     * bars. Only those two targets are handled here - {@code enabled}/{@code visible} bindings
     * apply to a live {@code AbstractWidget} and stay the host screen's responsibility, since
     * {@code SpecContainerScreen} doesn't build interactive widgets of its own the way {@code
     * SpecScreen} does.
     */
    void refreshBindings() {
        boundText.clear();
        boundValue.clear();
        boundSatisfied.clear();
        for (WidgetSpec w : spec.widgets) {
            String textPath = w.bindings.get("text");
            if (textPath != null) {
                String value = DataRegistry.resolve(qualify(spec.modId, textPath));
                if (value != null) boundText.put(w.id, value);
            }
            String valuePath = w.bindings.get("value");
            if (valuePath != null) {
                String value = DataRegistry.resolve(qualify(spec.modId, valuePath));
                if (value != null) {
                    try {
                        boundValue.put(w.id, Double.parseDouble(value));
                    } catch (NumberFormatException ignored) {
                        // leave unbound - falls back to the widget's static/pinned value
                    }
                }
            }
            String satisfiedPath = w.bindings.get("satisfied");
            if (satisfiedPath != null) {
                String value = DataRegistry.resolve(qualify(spec.modId, satisfiedPath));
                if (value != null) boundSatisfied.put(w.id, Boolean.parseBoolean(value));
            }
        }
    }

    /** Resolves a label/icon widget's display text: pinned override, then binding, then the spec's static {@code text}. */
    String resolveText(WidgetSpec w) {
        return pinnedText.getOrDefault(w.id, boundText.getOrDefault(w.id, w.text));
    }

    /** Resolves a progress widget's numeric value: pinned override, then binding, then {@code fallback}. */
    double resolveValue(WidgetSpec w, double fallback) {
        Double pinned = pinnedValue.get(w.id);
        if (pinned != null) return pinned;
        return boundValue.getOrDefault(w.id, fallback);
    }

    /** Resolves a {@code requirement} widget's fulfillment flag: binding first, else {@code fallback}. */
    boolean resolveSatisfied(WidgetSpec w, boolean fallback) {
        return boundSatisfied.getOrDefault(w.id, fallback);
    }

    /**
     * Draws a {@code panel} widget using the MC nine-slice sprite, at {@code (x, y)} in screen
     * space (the caller has already added its own origin offset to {@code w.x}/{@code w.y}).
     */
    void renderPanel(DrawContext ctx, WidgetSpec w, int x, int y) {
        String style = w.prop("style", "default");
        if (style.equals("transparent")) {
            return;
        }
        if (style.equals("dark")) {
            ctx.fill(x, y, x + w.w, y + w.h, 0x80000000);
            return;
        }
        renderVanillaPanel(ctx, x, y, w.w, w.h);
    }

    // Vanilla's own survival-inventory background - the raised-panel bevel look shared by every
    // vanilla container screen. Only its top-left 176x166 is real content (the rest of the 256x256
    // texture is unused atlas padding); its border is a uniform 3px bevel on all four sides (checked
    // pixel-by-pixel along each edge), so it nine-slices cleanly. (88, 10) is a flat-grey point deep
    // enough in the fill to dodge the player-model/crafting-grid/armor-slot art drawn over the middle
    // of this same texture - same reference point `scripts/extractMCTextures.py` uses on the webapp
    // side. Referencing vanilla's own texture (rather than shipping a copy) means a resource pack
    // that reskins the inventory background reskins our panels too, for free.
    private static final Identifier PANEL_TEX = Identifier.withDefaultNamespace("textures/gui/container/inventory.png");
    private static final int PANEL_TEX_W = 256;
    private static final int PANEL_TEX_H = 256;
    private static final int PANEL_CONTENT_W = 176;
    private static final int PANEL_CONTENT_H = 166;
    private static final int PANEL_BORDER = 3;
    private static final int PANEL_SAFE_U = 88;
    private static final int PANEL_SAFE_V = 10;

    /**
     * Draws a raised MC panel at an arbitrary rect by nine-slicing vanilla's own inventory
     * background texture (see above) - shared by {@link #renderPanel} and a {@code tabs} widget's
     * body area, which needs the same "framed panel" look without being an actual {@code panel}
     * widget itself.
     */
    void renderVanillaPanel(DrawContext ctx, int x, int y, int w, int h) {
        int rightU  = PANEL_CONTENT_W - PANEL_BORDER;
        int bottomV = PANEL_CONTENT_H - PANEL_BORDER;
        int destFillW = Math.max(0, w - PANEL_BORDER * 2);
        int destFillH = Math.max(0, h - PANEL_BORDER * 2);

        // top row: corners plus a horizontally-stretched top edge sampled from a safe column
        ninePatch(ctx, PANEL_TEX, x,                y, 0,               0, PANEL_BORDER,   PANEL_BORDER, PANEL_BORDER, PANEL_BORDER, PANEL_TEX_W, PANEL_TEX_H);
        ninePatch(ctx, PANEL_TEX, x + PANEL_BORDER,  y, PANEL_SAFE_U,    0, 1,               PANEL_BORDER, destFillW,    PANEL_BORDER, PANEL_TEX_W, PANEL_TEX_H);
        ninePatch(ctx, PANEL_TEX, x + w - PANEL_BORDER, y, rightU,      0, PANEL_BORDER,   PANEL_BORDER, PANEL_BORDER, PANEL_BORDER, PANEL_TEX_W, PANEL_TEX_H);

        if (destFillH > 0) {
            // middle rows: left/right edges stretched vertically, center fill stretched both ways
            int midY = y + PANEL_BORDER;
            ninePatch(ctx, PANEL_TEX, x,                    midY, 0,            PANEL_SAFE_V, PANEL_BORDER, 1, PANEL_BORDER, destFillH, PANEL_TEX_W, PANEL_TEX_H);
            ninePatch(ctx, PANEL_TEX, x + PANEL_BORDER,      midY, PANEL_SAFE_U, PANEL_SAFE_V, 1,            1, destFillW,    destFillH, PANEL_TEX_W, PANEL_TEX_H);
            ninePatch(ctx, PANEL_TEX, x + w - PANEL_BORDER,  midY, rightU,       PANEL_SAFE_V, PANEL_BORDER, 1, PANEL_BORDER, destFillH, PANEL_TEX_W, PANEL_TEX_H);
        }

        // bottom row: corners plus a horizontally-stretched bottom edge, only if taller than the top border alone
        int bottomDestY = y + h - PANEL_BORDER;
        if (bottomDestY > y + PANEL_BORDER) {
            ninePatch(ctx, PANEL_TEX, x,                    bottomDestY, 0,            bottomV, PANEL_BORDER, PANEL_BORDER, PANEL_BORDER, PANEL_BORDER, PANEL_TEX_W, PANEL_TEX_H);
            ninePatch(ctx, PANEL_TEX, x + PANEL_BORDER,      bottomDestY, PANEL_SAFE_U, bottomV, 1,            PANEL_BORDER, destFillW,    PANEL_BORDER, PANEL_TEX_W, PANEL_TEX_H);
            ninePatch(ctx, PANEL_TEX, x + w - PANEL_BORDER,  bottomDestY, rightU,       bottomV, PANEL_BORDER, PANEL_BORDER, PANEL_BORDER, PANEL_BORDER, PANEL_TEX_W, PANEL_TEX_H);
        }
    }

    /**
     * Draws a {@code label} widget's text at {@code (x, y)} in screen space, honoring the
     * {@code color}, {@code shadow} and {@code align} props from the designer and this widget's
     * resolved bound/pinned text (see {@link #resolveText}).
     *
     * <p>The default color 0xFF404040 matches vanilla's own container title color (-12566464).
     * Text with an alpha of 0 is invisible, and the designer's color picker only ever stores a
     * plain 0xRRGGBB (see PropertyPanel's argbIntToHex), so — same as {@code progress} and
     * {@code requirement}'s colors — the alpha byte is forced to opaque here rather than trusted
     * from the stored value.
     */
    void renderLabel(DrawContext ctx, Font font, WidgetSpec w, int x, int y) {
        int color = w.propInt("color", 0xFF404040) | 0xFF000000;
        boolean shadow = w.propBoolean("shadow", false);
        String align = w.prop("align", "left");
        String text = resolveText(w);
        int textWidth = font.width(text);
        int alignedX = switch (align) {
            case "center" -> x + (w.w - textWidth) / 2;
            case "right" -> x + w.w - textWidth;
            default -> x;
        };
        ctx.drawText(font, text, alignedX, y, color, shadow);
    }

    /** Draws an {@code icon} widget at {@code (x, y)} in screen space. No-op if {@code resolveIcon} returns {@code null}. */
    void renderIcon(DrawContext ctx, WidgetSpec w, int x, int y, IconResolver resolveIcon) {
        Identifier location = resolveIcon.resolve(w);
        if (location == null) {
            return;
        }
        int scale = w.propInt("scale", 1);
        ctx.blitIcon(location, x, y, w.w * scale, w.h * scale);
    }

    /**
     * Draws a small icon overlay on top of an already-rendered {@code button}/{@code
     * toggle_button} at {@code (x, y)} in screen space — vanilla's own {@code Button} rendering
     * has no icon slot, so this layers one on afterward rather than requiring a custom widget
     * subclass. No-op if {@code resolveIcon} returns {@code null} (the default — override it to
     * map this widget's {@code icon} id to your mod's texture, same as {@link #renderIcon}).
     * <p>
     * Left-padded and vertically centered; the button's own label stays vanilla-centered on the
     * full width rather than shifting over to form a centered icon+label group, so a long label
     * can still overlap a present icon — size the button or shorten the text if that happens.
     */
    void renderButtonIcon(DrawContext ctx, WidgetSpec w, int x, int y, IconResolver resolveIcon) {
        Identifier location = resolveIcon.resolve(w);
        if (location == null) {
            return;
        }
        int iconSize = Math.max(4, Math.min(w.h - 4, 9));
        int iconX = x + 4;
        int iconY = y + (w.h - iconSize) / 2;
        ctx.blitIcon(location, iconX, iconY, iconSize, iconSize);
    }

    private static final int REQUIREMENT_COLOR_MET = 0xFF00FF00;
    private static final int REQUIREMENT_COLOR_UNMET = 0xFFFF0000;

    /**
     * Draws a {@code requirement} widget at {@code (x, y)} in screen space: an item icon (see
     * {@link #renderIcon}) framed by a solid border whose color reflects this widget's {@code
     * satisfied} binding - fulfilled requirements (green by default) vs. unmet ones (red by
     * default). Ported from mine-now's {@code StructureMarkerScreen#drawRequirementRow} slot look.
     */
    void renderRequirement(DrawContext ctx, WidgetSpec w, int x, int y, IconResolver resolveIcon) {
        boolean satisfied = resolveSatisfied(w, false);
        int borderColor = (satisfied
                ? w.propInt("color_met", REQUIREMENT_COLOR_MET)
                : w.propInt("color_unmet", REQUIREMENT_COLOR_UNMET)) | 0xFF000000;
        int borderWidth = Math.max(1, w.propInt("border_width", 2));

        ctx.fill(x, y, x + w.w, y + w.h, borderColor);
        ctx.fill(x + borderWidth, y + borderWidth, x + w.w - borderWidth, y + w.h - borderWidth, 0xFF8B8B8B);

        Identifier location = resolveIcon.resolve(w);
        if (location == null) {
            return;
        }
        int iconX = x + borderWidth;
        int iconY = y + borderWidth;
        int iconW = w.w - borderWidth * 2;
        int iconH = w.h - borderWidth * 2;
        ctx.blitIcon(location, iconX, iconY, iconW, iconH);
    }

    /** Maps an {@code icon} widget's {@code icon} id to a texture location; mirrors each screen's overridable {@code resolveIcon}. */
    @FunctionalInterface
    interface IconResolver {
        Identifier resolve(WidgetSpec w);
    }

    // Vanilla's own creative-inventory tab sprites - the recognizable "folder tab" look the webapp's
    // canvas mimics. The selected tab uses one of three column variants that differ at their left/right
    // edges (_1 = leftmost, _2 = middle, _7 = rightmost); the unselected state always uses _1 since
    // the subtle edge difference is invisible at reduced size. Referencing vanilla's own sprites means
    // a resource pack that reskins these also reskins ours. Unlike `widget/tab`, these have no
    // nine-slice .mcmeta (vanilla only ever blits them at a fixed 26×32), so the slicing below is
    // done by hand: 4px border on all four sides. 4 (not the outline+bevel's 3) because the corner
    // transition art extends one pixel past it: the white inner bevel's diagonal pixel sits at
    // (3,3), and the bottom corners' art that fades the side border into the panel bevel spans the
    // last rows. The unselected variant is the same art shifted down 2px (it sits 2px shorter).
    private static final Identifier TAB_SEL_LEFT   = Identifier.withDefaultNamespace("textures/gui/sprites/container/creative_inventory/tab_top_selected_1.png");
    private static final Identifier TAB_SEL_MIDDLE = Identifier.withDefaultNamespace("textures/gui/sprites/container/creative_inventory/tab_top_selected_2.png");
    private static final Identifier TAB_SEL_RIGHT  = Identifier.withDefaultNamespace("textures/gui/sprites/container/creative_inventory/tab_top_selected_7.png");
    private static final Identifier TAB_UNSELECTED = Identifier.withDefaultNamespace("textures/gui/sprites/container/creative_inventory/tab_top_unselected_1.png");
    private static final int TAB_TEX_W = 26;
    private static final int TAB_TEX_H = 32;
    private static final int TAB_BORDER = 4;
    private static final int TAB_UNSELECTED_TOP_V = 2;
    // Safe sampling coordinates for the stretched regions, mirroring the webapp's *_slice.png files
    // (which are only 7px wide - 3px edges + a single mid column): the corner diagonal in these
    // sprites extends past the 3px corner into the interior, so stretching the whole interior drags
    // the diagonal out. Sampling a single flat column/row deep in the sprite avoids that.
    private static final int TAB_SAFE_U = 13;
    private static final int TAB_SAFE_V = 16;

    // Nested tab sprites — vanilla widget/tab.png and widget/tab_selected.png (130×24), uniform 3px
    // border on all sides, no left/middle/right variants. Unlike tab_selected.png, tab.png's real
    // border art doesn't start until row 4 - rows 0-3 are fully transparent padding, since vanilla
    // draws unselected tabs without the raised lip selected tabs have. Sampling row 0 straight (as if
    // both textures were laid out identically) grabs that transparent padding instead of the border,
    // which renders as the top of the tab going missing.
    private static final Identifier NESTED_TAB_SEL   = Identifier.withDefaultNamespace("textures/gui/sprites/widget/tab_selected.png");
    private static final Identifier NESTED_TAB_UNSEL = Identifier.withDefaultNamespace("textures/gui/sprites/widget/tab.png");
    private static final int NESTED_TAB_TEX_W  = 130;
    private static final int NESTED_TAB_TEX_H  = 24;
    private static final int NESTED_TAB_BORDER = 3;
    private static final int NESTED_TAB_UNSELECTED_TOP_V = 4;
    private static final int NESTED_TAB_SAFE_U = 65;
    private static final int NESTED_TAB_SAFE_V = 12;

    /** Draws a {@code tabs} selector button. {@code nested} selects the compact {@code widget/tab}
     *  sprite (3px uniform border); {@code !nested} uses vanilla's creative-inventory sprite (4px,
     *  position-dependent). */
    void renderTab(DrawContext ctx, boolean active, TabButtonWidget.Position position, boolean nested, int x, int y, int w, int h) {
        if (nested) {
            renderNestedTab(ctx, active, x, y, w, h);
        } else {
            renderTopTab(ctx, active, position, x, y, w, h);
        }
    }

    private void renderTopTab(DrawContext ctx, boolean active, TabButtonWidget.Position position, int x, int y, int w, int h) {
        Identifier tex;
        if (!active) {
            tex = TAB_UNSELECTED;
        } else {
            tex = switch (position) {
                case LEFT  -> TAB_SEL_LEFT;
                case RIGHT -> TAB_SEL_RIGHT;
                default    -> TAB_SEL_MIDDLE;
            };
        }
        int topV = active ? 0 : TAB_UNSELECTED_TOP_V;
        int rightU    = TAB_TEX_W - TAB_BORDER;
        int bottomV   = TAB_TEX_H - TAB_BORDER;
        int destFillW = Math.max(0, w - TAB_BORDER * 2);
        int destFillH = Math.max(0, h - TAB_BORDER * 2);

        // top row: fixed corners, top edge stretched from a 1px-wide safe column
        ninePatch(ctx, tex, x,                y, 0,          topV, TAB_BORDER, TAB_BORDER, TAB_BORDER, TAB_BORDER, TAB_TEX_W, TAB_TEX_H);
        ninePatch(ctx, tex, x + TAB_BORDER,    y, TAB_SAFE_U, topV, 1,          TAB_BORDER, destFillW,  TAB_BORDER, TAB_TEX_W, TAB_TEX_H);
        ninePatch(ctx, tex, x + w - TAB_BORDER, y, rightU,    topV, TAB_BORDER, TAB_BORDER, TAB_BORDER, TAB_BORDER, TAB_TEX_W, TAB_TEX_H);

        if (destFillH > 0) {
            // middle rows: left/right edges stretched from a 1px-tall safe row, flat center fill
            int fillY = y + TAB_BORDER;
            ninePatch(ctx, tex, x,                 fillY, 0,          TAB_SAFE_V, TAB_BORDER, 1, TAB_BORDER, destFillH, TAB_TEX_W, TAB_TEX_H);
            ninePatch(ctx, tex, x + TAB_BORDER,     fillY, TAB_SAFE_U, TAB_SAFE_V, 1,          1, destFillW,  destFillH, TAB_TEX_W, TAB_TEX_H);
            ninePatch(ctx, tex, x + w - TAB_BORDER, fillY, rightU,     TAB_SAFE_V, TAB_BORDER, 1, TAB_BORDER, destFillH, TAB_TEX_W, TAB_TEX_H);
        }

        // bottom row: fixed corners from the texture's last 3 rows — these hold the connection art
        // where the tab's side border fades into the panel's top bevel (e.g. the selected sprite's
        // right shadow turns white then grey over rows 29-31). The bottom edge between them is
        // plain fill, stretched from the safe column.
        int bottomDestY = y + h - TAB_BORDER;
        if (bottomDestY > y + TAB_BORDER) {
            ninePatch(ctx, tex, x,                 bottomDestY, 0,          bottomV, TAB_BORDER, TAB_BORDER, TAB_BORDER, TAB_BORDER, TAB_TEX_W, TAB_TEX_H);
            ninePatch(ctx, tex, x + TAB_BORDER,     bottomDestY, TAB_SAFE_U, bottomV, 1,          TAB_BORDER, destFillW,  TAB_BORDER, TAB_TEX_W, TAB_TEX_H);
            ninePatch(ctx, tex, x + w - TAB_BORDER, bottomDestY, rightU,     bottomV, TAB_BORDER, TAB_BORDER, TAB_BORDER, TAB_BORDER, TAB_TEX_W, TAB_TEX_H);
        }
    }

    private void renderNestedTab(DrawContext ctx, boolean active, int x, int y, int w, int h) {
        Identifier tex    = active ? NESTED_TAB_SEL : NESTED_TAB_UNSEL;
        int b             = NESTED_TAB_BORDER;
        int topV          = active ? 0 : NESTED_TAB_UNSELECTED_TOP_V;
        int rightU        = NESTED_TAB_TEX_W - b;
        int bottomV       = NESTED_TAB_TEX_H - b;
        int destFillW     = Math.max(0, w - b * 2);
        int destFillH     = Math.max(0, h - b * 2);

        ninePatch(ctx, tex, x,         y, 0,                   topV,                b, b, b,         b,         NESTED_TAB_TEX_W, NESTED_TAB_TEX_H);
        ninePatch(ctx, tex, x + b,     y, NESTED_TAB_SAFE_U,   topV,                1, b, destFillW, b,         NESTED_TAB_TEX_W, NESTED_TAB_TEX_H);
        ninePatch(ctx, tex, x + w - b, y, rightU,              topV,                b, b, b,         b,         NESTED_TAB_TEX_W, NESTED_TAB_TEX_H);

        if (destFillH > 0) {
            int fillY = y + b;
            ninePatch(ctx, tex, x,         fillY, 0,                 NESTED_TAB_SAFE_V, b, 1, b,         destFillH, NESTED_TAB_TEX_W, NESTED_TAB_TEX_H);
            ninePatch(ctx, tex, x + b,     fillY, NESTED_TAB_SAFE_U, NESTED_TAB_SAFE_V, 1, 1, destFillW, destFillH, NESTED_TAB_TEX_W, NESTED_TAB_TEX_H);
            ninePatch(ctx, tex, x + w - b, fillY, rightU,            NESTED_TAB_SAFE_V, b, 1, b,         destFillH, NESTED_TAB_TEX_W, NESTED_TAB_TEX_H);
        }

        int bottomDestY = y + h - b;
        if (bottomDestY > y + b) {
            ninePatch(ctx, tex, x,         bottomDestY, 0,                 bottomV, b, b, b,         b, NESTED_TAB_TEX_W, NESTED_TAB_TEX_H);
            ninePatch(ctx, tex, x + b,     bottomDestY, NESTED_TAB_SAFE_U, bottomV, 1, b, destFillW, b, NESTED_TAB_TEX_W, NESTED_TAB_TEX_H);
            ninePatch(ctx, tex, x + w - b, bottomDestY, rightU,            bottomV, b, b, b,         b, NESTED_TAB_TEX_W, NESTED_TAB_TEX_H);
        }
    }

    /**
     * Draws a {@code sprite} widget: a flat textured quad sampled from a mod or vanilla texture.
     *
     * <p>{@code src} is the path under a resource pack's {@code assets/<namespace>/textures/}
     * directory (e.g. {@code "gui/sprites/widget/button.png"}). The namespace defaults to
     * {@code minecraft}; mod-specific textures must be placed in the vanilla namespace or the
     * src format extended in a future revision.
     *
     * <p>{@code fit} is {@code "fill"} (default) or {@code "tile"}. Fill stretches the full
     * texture to the widget bounds. Tile repeats it at {@code tile_w}/{@code tile_h} pixel
     * intervals (default 16×16), clipping the last partial tile at each edge.
     * {@code contain}/{@code cover}/{@code none} require the natural texture size, which is
     * not available at render time without querying the texture manager; they fall back to fill.
     */
    void renderSprite(DrawContext ctx, WidgetSpec w, int x, int y) {
        String src = w.prop("src", "");
        if (src.isEmpty()) return;
        // src is a pack-relative path (e.g. "gui/sprites/widget/custom.png", matching where it
        // lived under assets/<namespace>/textures/ in the pack it was picked from in the
        // designer) — resolve it under this spec's own modId so a custom sprite ships at
        // assets/<modid>/textures/<src>, not under the "minecraft" namespace.
        String ns = (spec.modId != null && !spec.modId.isEmpty()) ? spec.modId : "minecraft";
        Identifier tex = spriteTexCache.computeIfAbsent(src, s -> Identifier.fromNamespaceAndPath(ns, s));
        String fit = w.prop("fit", "fill");
        if ("tile".equals(fit)) {
            int tileW = w.propInt("tile_w", 16);
            int tileH = w.propInt("tile_h", 16);
            for (int ty = 0; ty < w.h; ty += tileH) {
                for (int tx = 0; tx < w.w; tx += tileW) {
                    int dw = Math.min(tileW, w.w - tx);
                    int dh = Math.min(tileH, w.h - ty);
                    // srcW/texW = dw/tileW samples the correct fractional UV for the partial last tile
                    ninePatch(ctx, tex, x + tx, y + ty, 0, 0, dw, dh, dw, dh, tileW, tileH);
                }
            }
        } else {
            // Treat the texture as a 1×1 atlas so UV spans 0..1 = full texture, stretched to widget bounds.
            ninePatch(ctx, tex, x, y, 0, 0, 1, 1, w.w, w.h, 1, 1);
        }
    }

    // Solid-fill look ported from mine-now's InhabitantScreen need bars (drawNeedBar) - no texture
    // atlas, just flat graphics.fill() rects: a dark track, a 1px border, and a fill rect whose
    // width is round(w.w * clamp(fraction, 0, 1)). "color" props are stored as plain RGB ints (see
    // PropertyPanel's argbIntToHex, which masks to the low 24 bits) so the alpha byte is forced to
    // opaque (0xFF000000) here rather than trusted from the stored value.
    private static final int PROGRESS_TRACK_COLOR = 0xFF2B2B2B;
    private static final int PROGRESS_BORDER_COLOR = 0xFF1A1A1A;
    private static final int PROGRESS_THRESHOLD_HIGH = 0xFF3CB043;
    private static final int PROGRESS_THRESHOLD_MID = 0xFFD9A400;
    private static final int PROGRESS_THRESHOLD_LOW = 0xFFCC3333;

    private static int progressFillColor(WidgetSpec w, double frac) {
        if ("solid".equals(w.prop("style", "threshold"))) {
            return w.propInt("color", 0x3CB043) | 0xFF000000;
        }
        if (frac >= 0.66) return PROGRESS_THRESHOLD_HIGH;
        if (frac >= 0.33) return PROGRESS_THRESHOLD_MID;
        return PROGRESS_THRESHOLD_LOW;
    }

    /**
     * Draws a {@code progress} widget at {@code (x, y)} in screen space: a solid-fill horizontal
     * bar (fills left-to-right) with an optional centered {@code min}/{@code max}/{@code value}
     * percentage label. {@code value} comes from this widget's {@code value} binding/pin if set
     * (see {@link #resolveValue}), otherwise its static {@code value} prop.
     */
    void renderProgress(DrawContext ctx, Font font, WidgetSpec w, int x, int y) {
        double min = w.propDouble("min", 0);
        double max = w.propDouble("max", 100);
        double value = resolveValue(w, w.propDouble("value", min));
        double frac = max > min ? Math.max(0.0, Math.min(1.0, (value - min) / (max - min))) : 0.0;
        int filled = Math.round((float) (w.w * frac));

        ctx.fill(x, y, x + w.w, y + w.h, PROGRESS_TRACK_COLOR);
        if (filled > 0) {
            ctx.fill(x, y, x + filled, y + w.h, progressFillColor(w, frac));
        }
        ctx.fill(x,               y,             x + w.w, y + 1,   PROGRESS_BORDER_COLOR);
        ctx.fill(x,               y + w.h - 1,   x + w.w, y + w.h, PROGRESS_BORDER_COLOR);
        ctx.fill(x,               y,             x + 1,   y + w.h, PROGRESS_BORDER_COLOR);
        ctx.fill(x + w.w - 1,     y,             x + w.w, y + w.h, PROGRESS_BORDER_COLOR);

        if (w.propBoolean("show_label", true)) {
            String template = w.text.isEmpty() ? "%s%%" : w.text;
            String text = template.replace("%s", String.valueOf(Math.round(frac * 100)));
            int textX = x + (w.w - font.width(text)) / 2;
            int textY = y + (w.h - font.lineHeight) / 2 + 1;
            ctx.drawText(font, text, textX, textY, 0xFFFFFFFF, false);
        }
    }

    private static Identifier id(String path) {
        return Identifier.withDefaultNamespace(path);
    }

    private static Identifier hud(String path) {
        return id("hud/" + path);
    }

    private static final Identifier XP_BAR_BACKGROUND_SPRITE = hud("experience_bar_background");
    private static final Identifier XP_BAR_PROGRESS_SPRITE = hud("experience_bar_progress");

    /**
     * Draws an {@code xp_bar} widget at {@code (x, y)} in screen space using the real vanilla
     * experience-bar sprites (background + partial-width progress fill — the same technique
     * vanilla's own HUD uses). {@code value} (0-100, percent progress to the next level) comes
     * from this widget's {@code value} binding/pin if set (see {@link #resolveValue}), otherwise
     * its static {@code value} prop. No built-in level label — place a {@code label} widget above
     * it if you want to show the level number.
     */
    void renderXpBar(DrawContext ctx, WidgetSpec w, int x, int y) {
        double value = resolveValue(w, w.propDouble("value", 0));
        double frac = Math.max(0.0, Math.min(1.0, value / 100.0));
        int filled = Math.round((float) (w.w * frac));

        ctx.blitSprite(XP_BAR_BACKGROUND_SPRITE, x, y, w.w, w.h);
        if (filled > 0) {
            ctx.blitSpritePartial(XP_BAR_PROGRESS_SPRITE, w.w, w.h, x, y, filled, w.h);
        }
    }

    private static final Identifier HEART_CONTAINER_SPRITE = hud("heart/container");
    private static final Identifier HEART_FULL_SPRITE = hud("heart/full");
    private static final Identifier HEART_HALF_SPRITE = hud("heart/half");
    private static final Identifier HEART_ABSORBING_FULL_SPRITE = hud("heart/absorbing_full");
    private static final Identifier HEART_ABSORBING_HALF_SPRITE = hud("heart/absorbing_half");
    private static final Identifier HEART_WITHERED_FULL_SPRITE = hud("heart/withered_full");
    private static final Identifier HEART_WITHERED_HALF_SPRITE = hud("heart/withered_half");

    /**
     * Draws a {@code heart_bar} widget: a row of real vanilla heart sprites (9x9 each, 8px
     * stride), container-then-overlay just like vanilla's own health HUD. {@code value} is
     * current HP (2 per heart), {@code max} is max HP (determines container count), {@code color}
     * picks the heart sprite set: {@code red} (normal), {@code gold} (absorption hearts) or
     * {@code black} (withered-effect hearts). Single row only — unlike vanilla it doesn't wrap
     * past 10 containers. {@code rotation} (0/90/180/270) rotates the whole row clockwise around
     * the designer box's center — the row itself is laid out at its natural size (derived from
     * {@code max}, not {@code w}/{@code h}), but the *pivot* uses {@code w}/{@code h} because the
     * designer swaps them on every rotate step to keep the selection box matching the rotated
     * footprint (see EditorPage.rotateWidget in the webapp), so the box's center is always the
     * correct pivot regardless of rotation. {@code text} (or its {@code text} binding, resolved
     * the same way as a {@code label} widget) is drawn centered over the widget's own box —
     * outside the rotation transform, so it stays upright even when the bar is rotated.
     */
    void renderHeartBar(DrawContext ctx, Font font, WidgetSpec w, int x, int y) {
        double max = w.propDouble("max", 20);
        double value = resolveValue(w, w.propDouble("value", max));
        int hp = (int) Math.round(Math.max(0, Math.min(max, value)));
        int containers = Math.max(1, (int) Math.ceil(max / 2.0));

        int rotation = ((w.propInt("rotation", 0) % 360) + 360) % 360;
        if (rotation != 0) {
            ctx.pushRotation(x + w.w / 2, y + w.h / 2, rotation);
        }

        String color = w.prop("color", "red");
        Identifier full = "gold".equals(color) ? HEART_ABSORBING_FULL_SPRITE
            : "black".equals(color) ? HEART_WITHERED_FULL_SPRITE : HEART_FULL_SPRITE;
        Identifier half = "gold".equals(color) ? HEART_ABSORBING_HALF_SPRITE
            : "black".equals(color) ? HEART_WITHERED_HALF_SPRITE : HEART_HALF_SPRITE;

        for (int i = 0; i < containers; i++) {
            int xo = x + i * 8;
            ctx.blitSprite(HEART_CONTAINER_SPRITE, xo, y, 9, 9);
            if (i * 2 + 1 < hp) {
                ctx.blitSprite(full, xo, y, 9, 9);
            } else if (i * 2 + 1 == hp) {
                ctx.blitSprite(half, xo, y, 9, 9);
            }
        }

        if (rotation != 0) {
            ctx.popRotation();
        }

        String text = resolveText(w);
        if (!text.isEmpty()) {
            int textX = x + (w.w - font.width(text)) / 2;
            int textY = y + (w.h - font.lineHeight) / 2;
            ctx.drawText(font, text, textX, textY, 0xFFFFFFFF, true);
        }
    }

    private static final Identifier ARMOR_EMPTY_SPRITE = hud("armor_empty");
    private static final Identifier ARMOR_HALF_SPRITE = hud("armor_half");
    private static final Identifier ARMOR_FULL_SPRITE = hud("armor_full");

    // All three icon-row widgets (armor_bar, hunger_bar) always draw exactly 10 fixed 9px icons
    // at 8px stride, regardless of w/h — this is the resulting native footprint, used to center
    // an optional text overlay on top of where the icons actually are.
    private static final int ICON_ROW_NATIVE_W = 81;
    private static final int ICON_ROW_NATIVE_H = 9;

    private void drawIconRowText(DrawContext ctx, Font font, WidgetSpec w, int x, int y) {
        String text = resolveText(w);
        if (text.isEmpty()) return;
        int textX = x + (ICON_ROW_NATIVE_W - font.width(text)) / 2;
        int textY = y + (ICON_ROW_NATIVE_H - font.lineHeight) / 2;
        ctx.drawText(font, text, textX, textY, 0xFFFFFFFF, true);
    }

    /**
     * Draws an {@code armor_bar} widget: a fixed row of 10 real vanilla armor sprites (9x9 each,
     * 8px stride), same layout as vanilla's own armor HUD. {@code value} is current armor points.
     * {@code text} (or its {@code text} binding) is drawn centered over the icon row.
     */
    void renderArmorBar(DrawContext ctx, Font font, WidgetSpec w, int x, int y) {
        double value = resolveValue(w, w.propDouble("value", 0));
        int armor = (int) Math.round(value);
        for (int i = 0; i < 10; i++) {
            int xo = x + i * 8;
            if (i * 2 + 1 < armor) {
                ctx.blitSprite(ARMOR_FULL_SPRITE, xo, y, 9, 9);
            } else if (i * 2 + 1 == armor) {
                ctx.blitSprite(ARMOR_HALF_SPRITE, xo, y, 9, 9);
            } else {
                ctx.blitSprite(ARMOR_EMPTY_SPRITE, xo, y, 9, 9);
            }
        }
        drawIconRowText(ctx, font, w, x, y);
    }

    private static final Identifier FOOD_EMPTY_SPRITE = hud("food_empty");
    private static final Identifier FOOD_HALF_SPRITE = hud("food_half");
    private static final Identifier FOOD_FULL_SPRITE = hud("food_full");

    /**
     * Draws a {@code hunger_bar} widget: a fixed row of 10 real vanilla food sprites. Matches
     * vanilla's fill direction — as {@code value} rises the rightmost icon fills first, same as
     * the real hunger HUD (it anchors from the screen's right edge; here re-based to this
     * widget's own left edge). {@code value} is current hunger points (2 per icon). {@code text}
     * (or its {@code text} binding) is drawn centered over the icon row.
     */
    void renderHungerBar(DrawContext ctx, Font font, WidgetSpec w, int x, int y) {
        double value = resolveValue(w, w.propDouble("value", w.propDouble("max", 20)));
        int food = (int) Math.round(value);
        for (int i = 0; i < 10; i++) {
            int xo = x + (9 - i) * 8;
            ctx.blitSprite(FOOD_EMPTY_SPRITE, xo, y, 9, 9);
            if (i * 2 + 1 < food) {
                ctx.blitSprite(FOOD_FULL_SPRITE, xo, y, 9, 9);
            } else if (i * 2 + 1 == food) {
                ctx.blitSprite(FOOD_HALF_SPRITE, xo, y, 9, 9);
            }
        }
        drawIconRowText(ctx, font, w, x, y);
    }

    private static final Identifier[] BOSS_BAR_BACKGROUND_SPRITES = {
        id("boss_bar/pink_background"), id("boss_bar/blue_background"), id("boss_bar/red_background"),
        id("boss_bar/green_background"), id("boss_bar/yellow_background"), id("boss_bar/purple_background"),
        id("boss_bar/white_background"),
    };
    private static final Identifier[] BOSS_BAR_PROGRESS_SPRITES = {
        id("boss_bar/pink_progress"), id("boss_bar/blue_progress"), id("boss_bar/red_progress"),
        id("boss_bar/green_progress"), id("boss_bar/yellow_progress"), id("boss_bar/purple_progress"),
        id("boss_bar/white_progress"),
    };
    private static final java.util.List<String> BOSS_BAR_COLORS =
        java.util.List.of("pink", "blue", "red", "green", "yellow", "purple", "white");

    /**
     * Draws a {@code boss_bar} widget using the real vanilla boss-bar sprites (background +
     * partial-width progress fill, same technique as {@link #renderXpBar}). {@code value} is
     * percent (0-100) and {@code color} picks the sprite set vanilla offers.
     * <p>
     * {@code rotation} (0/90/180/270) rotates the bar clockwise around the designer box's center.
     * Unlike {@code heart_bar}, this widget's fill math genuinely depends on its own width, so
     * rotation needs the *native* (pre-rotation) size recovered by swapping {@code w}/{@code h}
     * back when rotated 90/270 — {@code w}/{@code h} themselves are already the rotated footprint
     * (the designer swaps them on every rotate step, see EditorPage.rotateWidget), so their
     * center is still the correct pivot. {@code text} (or its {@code text} binding, resolved the
     * same way as a {@code label} widget) is drawn centered over the widget's own box — outside
     * the rotation transform, so it stays upright even when the bar is rotated.
     */
    void renderBossBar(DrawContext ctx, Font font, WidgetSpec w, int x, int y) {
        double value = resolveValue(w, w.propDouble("value", 0));
        double frac = Math.max(0.0, Math.min(1.0, value / 100.0));
        int colorIdx = Math.max(0, BOSS_BAR_COLORS.indexOf(w.prop("color", "pink")));

        int rotation = ((w.propInt("rotation", 0) % 360) + 360) % 360;
        boolean swapped = rotation == 90 || rotation == 270;
        int nativeW = swapped ? w.h : w.w;
        int nativeH = swapped ? w.w : w.h;
        int nativeX = x + (w.w - nativeW) / 2;
        int nativeY = y + (w.h - nativeH) / 2;
        int filled = Math.round((float) (nativeW * frac));

        if (rotation != 0) {
            ctx.pushRotation(x + w.w / 2, y + w.h / 2, rotation);
        }

        ctx.blitSprite(BOSS_BAR_BACKGROUND_SPRITES[colorIdx], nativeX, nativeY, nativeW, nativeH);
        if (filled > 0) {
            ctx.blitSpritePartial(BOSS_BAR_PROGRESS_SPRITES[colorIdx], nativeW, nativeH, nativeX, nativeY, filled, nativeH);
        }

        if (rotation != 0) {
            ctx.popRotation();
        }

        String text = resolveText(w);
        if (!text.isEmpty()) {
            int textX = x + (w.w - font.width(text)) / 2;
            int textY = y + (w.h - font.lineHeight) / 2;
            ctx.drawText(font, text, textX, textY, 0xFFFFFFFF, true);
        }
    }

    private static final int SKILL_CHECK_FAIL_COLOR = 0x60969696;
    private static final int SKILL_CHECK_NORMAL_COLOR = 0xFFAAAAAA;
    private static final int SKILL_CHECK_BONUS_COLOR = 0xFFFFFFFF;
    private static final int SKILL_CHECK_NEEDLE_COLOR = 0xFFFF3B30;

    /**
     * Whether {@code angle} (degrees, any range) falls within [{@code start}, {@code end}]
     * (degrees), wrapping correctly when {@code end < start} (e.g. a zone spanning 350-10).
     */
    private static boolean angleInRange(double angle, double start, double end) {
        double a = ((angle % 360) + 360) % 360;
        double s = ((start % 360) + 360) % 360;
        double e = ((end % 360) + 360) % 360;
        return s <= e ? a >= s && a <= e : a >= s || a <= e;
    }

    /** name (from the designer's "Trigger Key" prop) → GLFW-style key code. Unrecognized names fall back to space. */
    private static int resolveKeyCode(String name) {
        return switch (name.toLowerCase(java.util.Locale.ROOT)) {
            case "enter", "return" -> com.mojang.blaze3d.platform.InputConstants.KEY_RETURN;
            case "a" -> com.mojang.blaze3d.platform.InputConstants.KEY_A;
            case "b" -> com.mojang.blaze3d.platform.InputConstants.KEY_B;
            case "c" -> com.mojang.blaze3d.platform.InputConstants.KEY_C;
            case "d" -> com.mojang.blaze3d.platform.InputConstants.KEY_D;
            case "e" -> com.mojang.blaze3d.platform.InputConstants.KEY_E;
            case "f" -> com.mojang.blaze3d.platform.InputConstants.KEY_F;
            case "q" -> com.mojang.blaze3d.platform.InputConstants.KEY_Q;
            case "r" -> com.mojang.blaze3d.platform.InputConstants.KEY_R;
            case "s" -> com.mojang.blaze3d.platform.InputConstants.KEY_S;
            case "w" -> com.mojang.blaze3d.platform.InputConstants.KEY_W;
            default -> com.mojang.blaze3d.platform.InputConstants.KEY_SPACE;
        };
    }

    /** This widget's sweep progress right now: 0 at the start, 1 once it's finished (needle at rest). */
    private double skillCheckProgress(WidgetSpec w) {
        Long start = skillCheckStart.get(w.id);
        if (start == null) return 0.0;
        double durationMs = w.propDouble("duration_ticks", 40) * 50.0;
        double elapsed = net.minecraft.util.Util.getMillis() - start;
        return Math.max(0.0, Math.min(1.0, elapsed / durationMs));
    }

    /**
     * Draws a {@code skill_check} widget: a circular dial with a red needle that sweeps 0-360deg
     * clockwise from the top over {@code duration_ticks} (20 = 1 second), then stops. The ring has
     * three zones: [{@code bonus_start}, {@code bonus_end}] (white — a bonus), [{@code
     * normal_start}, {@code normal_end}] (gray — a plain pass), and everywhere else (dim — a
     * failure). Press the configured {@code key} (see {@link #handleSkillCheckKey}) while the
     * needle is over one of them for that outcome. Starts (and re-starts, if already finished)
     * its sweep the moment it's first drawn each time it's visible; call {@link
     * #resetSkillCheck} to explicitly restart it (e.g. for the next attempt) without waiting for
     * it to leave and re-enter view. Procedural — approximated from small filled squares, since
     * there's no vanilla circle/arc/line primitive.
     */
    void renderSkillCheck(DrawContext ctx, Font font, WidgetSpec w, int x, int y) {
        skillCheckStart.computeIfAbsent(w.id, id -> net.minecraft.util.Util.getMillis());
        double progress = skillCheckProgress(w);
        double angleDeg = progress * 360.0;

        double cx = x + w.w / 2.0;
        double cy = y + w.h / 2.0;
        double radius = Math.min(w.w, w.h) / 2.0 - 2;
        double bonusStart = w.propDouble("bonus_start", 300);
        double bonusEnd = w.propDouble("bonus_end", 330);
        double normalStart = w.propDouble("normal_start", 240);
        double normalEnd = w.propDouble("normal_end", 300);

        for (double deg = 0; deg < 360; deg += 4) {
            boolean inBonus = angleInRange(deg, bonusStart, bonusEnd);
            boolean inNormal = !inBonus && angleInRange(deg, normalStart, normalEnd);
            double rad = Math.toRadians(deg);
            int px = (int) Math.round(cx + radius * Math.sin(rad));
            int py = (int) Math.round(cy - radius * Math.cos(rad));
            int ptR = (inBonus || inNormal) ? 2 : 1;
            int color = inBonus ? SKILL_CHECK_BONUS_COLOR : inNormal ? SKILL_CHECK_NORMAL_COLOR : SKILL_CHECK_FAIL_COLOR;
            ctx.fill(px - ptR, py - ptR, px + ptR, py + ptR, color);
        }

        if (progress < 1.0) {
            double rad = Math.toRadians(angleDeg);
            double sinA = Math.sin(rad);
            double cosA = Math.cos(rad);
            for (double rr = 0; rr <= radius; rr += 1.5) {
                int px = (int) Math.round(cx + rr * sinA);
                int py = (int) Math.round(cy - rr * cosA);
                ctx.fill(px - 1, py - 1, px + 1, py + 1, SKILL_CHECK_NEEDLE_COLOR);
            }
        }

        String text = resolveText(w);
        if (!text.isEmpty()) {
            int textX = (int) Math.round(cx - font.width(text) / 2.0);
            int textY = (int) Math.round(cy - font.lineHeight / 2.0);
            ctx.drawText(font, text, textX, textY, 0xFFFFFFFF, true);
        }
    }

    /** Restarts a {@code skill_check} widget's sweep from the top, e.g. to begin the next attempt. */
    void resetSkillCheck(String widgetId) {
        skillCheckStart.remove(widgetId);
        skillCheckResolved.remove(widgetId);
    }

    /**
     * Handles a key press for one {@code skill_check} widget: if {@code keyCode} matches its
     * configured {@code key} prop and its sweep is still running and hasn't already fired this
     * sweep, dispatches its action/listeners (see {@link ActionHost#dispatchAction}) with value
     * {@code "bonus"} (needle was over the white zone), {@code "success"} (over the gray zone),
     * or {@code "fail"} (anywhere else on the ring), and marks it resolved so a second press this
     * sweep does nothing. A press after the sweep has already finished (needle at rest) does
     * nothing at all — not even a {@code "fail"}, since there's no needle position left to judge.
     * Returns whether this widget handled the key, so a caller trying multiple widgets knows to
     * stop.
     */
    boolean handleSkillCheckKey(WidgetSpec w, int keyCode, ActionHost host) {
        if (!w.type.equals("skill_check")) return false;
        if (resolveKeyCode(w.prop("key", "space")) != keyCode) return false;
        if (skillCheckResolved.getOrDefault(w.id, false)) return false;
        if (!skillCheckStart.containsKey(w.id)) return false;

        double progress = skillCheckProgress(w);
        if (progress >= 1.0) return false;

        double angleDeg = progress * 360.0;
        boolean inBonus = angleInRange(angleDeg, w.propDouble("bonus_start", 300), w.propDouble("bonus_end", 330));
        boolean inNormal = !inBonus && angleInRange(angleDeg, w.propDouble("normal_start", 240), w.propDouble("normal_end", 300));
        String outcome = inBonus ? "bonus" : inNormal ? "success" : "fail";
        skillCheckResolved.put(w.id, true);
        host.dispatchAction(w.id, w, outcome);
        return true;
    }

    /**
     * Draws a {@code player_preview} widget at {@code (x, y, x+w.w, y+w.h)} in screen space: the
     * real local player's live model, eyes following the mouse — the exact same widget vanilla's
     * own survival inventory screen shows in its top-left corner. Delegates entirely to
     * {@link InventoryScreen#extractEntityInInventoryFollowsMouse}, vanilla's own implementation
     * (uninvolved in the {@link DrawContext} abstraction the rest of this class draws through,
     * since it needs the raw {@link GuiGraphicsExtractor} — same escape hatch as {@link
     * #renderCustom}). No-op if no player is loaded yet (e.g. on a title-screen-hosted preview).
     */
    void renderPlayerPreview(GuiGraphicsExtractor graphics, WidgetSpec w, int x, int y, int mouseX, int mouseY) {
        Player player = Minecraft.getInstance().player;
        if (player == null) return;
        int scale = w.propInt("scale", 30);
        InventoryScreen.extractEntityInInventoryFollowsMouse(
                graphics, x, y, x + w.w, y + w.h, scale, 0.0625F, mouseX, mouseY, player);
    }

    private static final int CUSTOM_PLACEHOLDER_BG = 0xFF2B2B2B;
    private static final int CUSTOM_PLACEHOLDER_BORDER = 0xFF8B8B8B;

    /**
     * Draws a {@code custom} widget at {@code (x, y)} in screen space: delegates to whatever
     * {@link CustomWidgetRenderer} is registered under this widget's {@code customType} prop, or
     * falls back to the same labeled placeholder box the designer shows if none is registered yet.
     */
    void renderCustom(GuiGraphicsExtractor graphics, Font font, WidgetSpec w, int x, int y) {
        String customType = w.prop("customType", "");
        CustomWidgetRenderer renderer = CustomWidgetRegistry.get(customType);
        if (renderer != null) {
            renderer.render(graphics, w, x, y);
            return;
        }
        DrawContext ctx = new McDrawContext(graphics);
        ctx.fill(x, y, x + w.w, y + w.h, CUSTOM_PLACEHOLDER_BG);
        ctx.fill(x,             y,             x + w.w, y + 1,   CUSTOM_PLACEHOLDER_BORDER);
        ctx.fill(x,             y + w.h - 1,   x + w.w, y + w.h, CUSTOM_PLACEHOLDER_BORDER);
        ctx.fill(x,             y,             x + 1,   y + w.h, CUSTOM_PLACEHOLDER_BORDER);
        ctx.fill(x + w.w - 1,   y,             x + w.w, y + w.h, CUSTOM_PLACEHOLDER_BORDER);
        String label = customType.isEmpty() ? "custom" : customType;
        int textX = x + (w.w - font.width(label)) / 2;
        int textY = y + (w.h - font.lineHeight) / 2;
        ctx.drawText(font, label, textX, textY, 0xFFFFFFFF, false);
    }

    /** Blits one nine-slice piece: a {@code srcW x srcH} source region (from a {@code texW x texH} texture) stretched to {@code destW x destH}. */
    private void ninePatch(DrawContext ctx, Identifier tex, int x, int y, int u, int v, int srcW, int srcH, int destW, int destH, int texW, int texH) {
        if (destW <= 0 || destH <= 0) return;
        ctx.blitRegion(tex, x, y, u, v, destW, destH, srcW, srcH, texW, texH);
    }
}
