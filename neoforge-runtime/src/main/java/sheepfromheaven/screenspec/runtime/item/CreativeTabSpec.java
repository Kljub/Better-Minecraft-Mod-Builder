package sheepfromheaven.screenspec.runtime.item;

/**
 * Mirrors the webapp's {@code CreativeTabSpec} ({@code webapp/lib/types.ts}) as exported to
 * {@code assets/<modid>/screenspec/creative_tabs.json}: a project-defined creative tab's title,
 * and whether the export ships an icon image as the hidden item {@code <id>_tab_icon}.
 */
public final class CreativeTabSpec {
    public String id;
    public String displayName;
    public boolean icon;
}
