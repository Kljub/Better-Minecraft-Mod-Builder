"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

export interface MenuItem {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** renders a divider instead of an item */
  separator?: boolean;
  children?: MenuItem[];
}

/** Right-click menu at a screen position; closes on outside click, Escape, scroll or resize. */
export default function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [open, setOpen] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.min(x, window.innerWidth - r.width - 4), top: Math.min(y, window.innerHeight - r.height - 4) });
  }, [x, y]);

  useEffect(() => {
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", down, true);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", onClose);
    window.addEventListener("wheel", onClose, { passive: true });
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("wheel", onClose);
    };
  }, [onClose]);

  return (
    <div ref={ref} role="menu" data-testid="context-menu" onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[100] min-w-48 rounded-sm border border-input bg-popover py-1 text-xs text-popover-foreground shadow-xl"
      style={pos}>
      {items.map((item, i) => item.separator ? (
        <div key={i} className="my-1 border-t border-input/70" />
      ) : (
        <div key={i} className="relative" onMouseEnter={() => setOpen(item.children ? i : null)}>
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => { if (item.children) { setOpen(i); return; } item.onClick?.(); onClose(); }}
            className={`flex h-7 w-full items-center gap-2 px-3 text-left disabled:opacity-40 ${item.danger ? "text-red-300 enabled:hover:bg-destructive enabled:hover:text-white" : "enabled:hover:bg-accent"}`}
          >
            <span className="flex-1">{item.label}</span>
            {item.shortcut && <span className="text-[10px] text-muted-foreground">{item.shortcut}</span>}
            {item.children && <ChevronRight className="h-3 w-3" />}
          </button>
          {item.children && open === i && (
            <div className="absolute left-full top-0 max-h-72 min-w-40 overflow-y-auto rounded-sm border border-input bg-popover py-1 shadow-xl">
              {item.children.map((c, j) => (
                <button key={j} type="button" role="menuitem" disabled={c.disabled}
                  onClick={() => { c.onClick?.(); onClose(); }}
                  className="flex h-7 w-full items-center px-3 text-left enabled:hover:bg-accent disabled:opacity-40">
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
