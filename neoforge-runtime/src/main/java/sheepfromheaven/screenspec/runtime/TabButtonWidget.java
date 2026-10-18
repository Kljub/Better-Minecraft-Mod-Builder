package sheepfromheaven.screenspec.runtime;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;

/**
 * A {@code tabs} selector {@link Button} rendered with vanilla's own nine-slice tab sprite (see
 * {@link SpecWidgetRenderer#renderTab}) instead of the default flat button background, so a
 * resource pack that reskins vanilla's tab widget reskins these too.
 */
final class TabButtonWidget extends Button {
    private final SpecWidgetRenderer renderer;
    /** LEFT, MIDDLE, or RIGHT — drives which selected-tab texture variant is used for top-level tabs. */
    enum Position { LEFT, MIDDLE, RIGHT }
    /** Which edge of the {@code tabs} widget the strip sits on ({@code tab_position} prop). */
    enum Side { TOP, LEFT, RIGHT }
    private final Position position;
    private final Side side;
    private final boolean nested;
    private boolean selected;

    TabButtonWidget(Button.Builder builder, SpecWidgetRenderer renderer, Position position, Side side, boolean nested) {
        super(builder);
        this.renderer = renderer;
        this.position = position;
        this.side     = side;
        this.nested   = nested;
    }

    void setSelected(boolean selected) {
        this.selected = selected;
    }

    @Override
    protected void extractContents(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        // Only the selected tab draws its sprite here, on top of the body panel (its bottom bevel
        // overlaps and hides the panel's top edge). Unselected tabs' sprites are drawn by the host
        // screen's background pass so the panel renders OVER their bottom edge — vanilla's
        // creative-inventory layering. Labels always render here, above everything.
        if (selected) {
            renderer.renderTab(new McDrawContext(graphics), true, position, side, nested, getX(), getY(), getWidth(), getHeight());
        }
        extractDefaultLabel(graphics.textRendererForWidget(this, GuiGraphicsExtractor.HoveredTextEffects.NONE));
    }
}
