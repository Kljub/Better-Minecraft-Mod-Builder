"use client";

import { FolderDown, FolderUp, BookOpen, Clipboard, Grid3x3, AlignCenterHorizontal, AlignCenterVertical } from "lucide-react";
import Link from "next/link";
import type { ScreenSpec, BindingsSchema } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import SettingsDialog from "@/components/SettingsDialog";
import BindingsModal from "@/components/BindingsModal";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

interface Props {
  screen: ScreenSpec;
  gridSize: number;
  showGrid: boolean;
  snapToParent: boolean;
  snapToSiblings: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  onCenterHorizontal: () => void;
  onCenterVertical: () => void;
  tryMode: boolean;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onGridSizeChange: (v: number) => void;
  onToggleGrid: () => void;
  onToggleSnapToParent: () => void;
  onToggleSnapToSiblings: () => void;
  onToggleTryMode: () => void;
  onScreenChange: (patch: Partial<ScreenSpec>) => void;
  onExportProject: () => void;
  onImportProject: () => void;
  onCopyJava: () => void;
  onResetTextures: () => Promise<void>;
  onViewTextures: () => void;
  onExtractPack: (file: File) => Promise<{ extracted: string[]; missing: string[] }>;
  onSaveToTestMod?: () => Promise<void>;
  bindingsSchema: BindingsSchema;
  onUpdateBindingsSchema: (schema: BindingsSchema) => void;
  actions: string[];
  onUpdateActions: (actions: string[]) => void;
  modId?: string;
}

export default function Toolbar({
  screen, gridSize, showGrid, snapToParent, snapToSiblings, canUndo, canRedo, hasSelection, onCenterHorizontal, onCenterVertical, tryMode,
  onUndo, onRedo, onGridSizeChange, onToggleGrid, onToggleSnapToParent, onToggleSnapToSiblings, onToggleTryMode,
  onScreenChange, onExportProject, onImportProject, onCopyJava, onResetTextures, onViewTextures, onExtractPack,
  scale, onZoomIn, onZoomOut, onZoomReset, onSaveToTestMod,
  bindingsSchema, onUpdateBindingsSchema, actions, onUpdateActions, modId,
}: Props) {
  const SNAP_STEPS = [1, 2, 4, 8];
  const snapIdx = SNAP_STEPS.indexOf(gridSize);
  return (
    <div className="flex items-center gap-2 border-b bg-background px-3 py-2 flex-wrap shrink-0">
      <SidebarTrigger className="h-8 w-8" />

      <Separator orientation="vertical" className="h-5" />

      <div className="flex items-center gap-1.5">
        <label className="flex items-center gap-1.5 text-muted-foreground">
          W:
          <Input
            className="h-8 w-16"
            type="number"
            value={screen.width}
            onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v > 0) onScreenChange({ width: v }); }}
          />
        </label>
        <label className="flex items-center gap-1.5 text-muted-foreground">
          H:
          <Input
            className="h-8 w-16"
            type="number"
            value={screen.height}
            onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v > 0) onScreenChange({ height: v }); }}
          />
        </label>
      </div>

      <Separator orientation="vertical" className="h-5" />

      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted data-[popup-open]:text-foreground"
          title="Snapping settings"
        >
          <Grid3x3 className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start" className="min-w-56 p-2">
          <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Snapping</div>
          <label className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm cursor-pointer hover:bg-accent">
            <input type="checkbox" checked={showGrid} onChange={onToggleGrid} className="h-4 w-4" />
            Grid
          </label>
          <div className="flex items-center gap-1.5 px-1.5 py-1 text-sm text-muted-foreground">
            Snap size
            <div className="ml-auto flex items-center">
              <Button variant="outline" size="sm" className="h-7 w-7 rounded-r-none border-r-0" onClick={() => onGridSizeChange(SNAP_STEPS[snapIdx - 1])} disabled={snapIdx <= 0}>−</Button>
              <Button variant="outline" size="sm" className="h-7 min-w-12 rounded-none" onClick={() => onGridSizeChange(1)} title="Reset snap">{gridSize}px</Button>
              <Button variant="outline" size="sm" className="h-7 w-7 rounded-l-none border-l-0" onClick={() => onGridSizeChange(SNAP_STEPS[snapIdx + 1])} disabled={snapIdx >= SNAP_STEPS.length - 1}>+</Button>
            </div>
          </div>
          <DropdownMenuSeparator />
          <label className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm cursor-pointer hover:bg-accent">
            <input type="checkbox" checked={snapToParent} onChange={onToggleSnapToParent} className="h-4 w-4" />
            Snap to parent center
          </label>
          <label className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm cursor-pointer hover:bg-accent">
            <input type="checkbox" checked={snapToSiblings} onChange={onToggleSnapToSiblings} className="h-4 w-4" />
            Snap to siblings
          </label>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="h-5" />

      <Button variant="outline" size="sm" className="h-8" onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)">↩ Undo</Button>
      <Button variant="outline" size="sm" className="h-8" onClick={onRedo} disabled={!canRedo} title="Redo (⌘⇧Z)">↪ Redo</Button>

      <Separator orientation="vertical" className="h-5" />

      <Button variant="outline" size="sm" className="h-8 w-8 px-0" onClick={onCenterHorizontal} disabled={!hasSelection} title="Center selection horizontally">
        <AlignCenterHorizontal className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" className="h-8 w-8 px-0" onClick={onCenterVertical} disabled={!hasSelection} title="Center selection vertically">
        <AlignCenterVertical className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-5" />

      <div className="flex items-center">
        <Button variant="outline" size="sm" className="h-8 w-8 rounded-r-none border-r-0" onClick={onZoomOut} disabled={scale <= 1} title="Zoom out (⌘-)">−</Button>
        <Button variant="outline" size="sm" className="h-8 min-w-12 rounded-none" onClick={onZoomReset} title="Reset zoom (⌘0)">{Math.round(scale)}×</Button>
        <Button variant="outline" size="sm" className="h-8 w-8 rounded-l-none border-l-0" onClick={onZoomIn} disabled={scale >= 8} title="Zoom in (⌘+)">+</Button>
      </div>

      <Separator orientation="vertical" className="h-5" />

      <Button
        size="sm"
        className="h-8"
        variant={tryMode ? "destructive" : "default"}
        onClick={onToggleTryMode}
        title="Toggle try mode (T)"
      >
        {tryMode ? "⏹ Stop" : "▶ Try"}
      </Button>

      <div className="ml-auto flex items-center gap-1">
        {process.env.NODE_ENV === "development" && onSaveToTestMod && (
          <>
            <Button variant="outline" size="sm" className="h-8" onClick={onSaveToTestMod} title="Save to neoforge-runtime test_container_screen.json">
              Save to test mod
            </Button>
            <Separator orientation="vertical" className="h-5" />
          </>
        )}
        <Button variant="ghost" size="sm" className="h-8 w-8 px-0" onClick={onCopyJava} title="Copy Java class definition">
          <Clipboard className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <Button variant="ghost" size="sm" className="h-8 w-8 px-0" onClick={onImportProject} title="Import project (all screens)">
          <FolderUp className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 px-0" onClick={onExportProject} title="Export project (all screens)">
          <FolderDown className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <BindingsModal
          schema={bindingsSchema}
          onChangeSchema={onUpdateBindingsSchema}
          actions={actions}
          onChangeActions={onUpdateActions}
          modId={modId}
        />
        <Link href="/docs" target="_blank" title="Documentation" className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <BookOpen className="h-4 w-4" />
        </Link>
        <SettingsDialog
          screen={screen}
          onScreenChange={onScreenChange}
          onResetTextures={onResetTextures}
          onViewTextures={onViewTextures}
          onExtractPack={onExtractPack}
        />
      </div>
    </div>
  );
}
