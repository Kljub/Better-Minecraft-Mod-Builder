package sheepfromheaven.screenspec.runtime;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;

/** Adapts {@link GuiGraphicsExtractor} to the version-neutral {@link DrawContext} interface. */
final class McDrawContext implements DrawContext {
    private final GuiGraphicsExtractor g;

    McDrawContext(GuiGraphicsExtractor g) {
        this.g = g;
    }

    @Override
    public void fill(int x1, int y1, int x2, int y2, int color) {
        g.fill(x1, y1, x2, y2, color);
    }

    @Override
    public void blitRegion(Identifier tex, int x, int y, float u, float v, int destW, int destH, int srcW, int srcH, int texW, int texH) {
        g.blit(RenderPipelines.GUI_TEXTURED, tex, x, y, u, v, destW, destH, srcW, srcH, texW, texH, -1);
    }

    @Override
    public void blitIcon(Identifier tex, int x, int y, int w, int h) {
        g.blit(RenderPipelines.GUI_TEXTURED, tex, x, y, 0f, 0f, w, h, w, h);
    }

    @Override
    public void blitSprite(Identifier spriteId, int x, int y, int w, int h) {
        g.blitSprite(RenderPipelines.GUI_TEXTURED, spriteId, x, y, w, h);
    }

    @Override
    public void blitSpritePartial(Identifier spriteId, int spriteW, int spriteH, int x, int y, int destW, int destH) {
        g.blitSprite(RenderPipelines.GUI_TEXTURED, spriteId, spriteW, spriteH, 0, 0, x, y, destW, destH);
    }

    @Override
    public void drawText(Font font, String text, int x, int y, int color, boolean shadow) {
        g.text(font, text, x, y, color, shadow);
    }

    @Override
    public void pushRotation(int centerX, int centerY, int degrees) {
        g.pose().pushMatrix();
        g.pose().translate(centerX, centerY);
        g.pose().rotate((float) Math.toRadians(degrees));
        g.pose().translate(-centerX, -centerY);
    }

    @Override
    public void popRotation() {
        g.pose().popMatrix();
    }
}
