import type { WidgetSpec } from "@/lib/types";
import { tabContentRect } from "@/lib/widgetBounds";

/**
 * A `tab` child's own x/y don't carry real meaning — tabs are laid out purely
 * by the tabs container (see tabLayout.ts); their content starts at the
 * container's content pane, next to the tab strip (below it for top tabs,
 * beside it for side tabs). Used when resolving a descendant's absolute
 * position for export (e.g. inventory_area/inventoryAreaExport.ts).
 */
export function tabChildOrigin(parent: WidgetSpec, parentOrigin: { x: number; y: number }): { x: number; y: number } {
  const pane = tabContentRect(parent);
  return { x: parentOrigin.x + pane.x, y: parentOrigin.y + pane.y };
}
