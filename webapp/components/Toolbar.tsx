"use client";

import { FolderDown, FolderUp, BookOpen, Clipboard, Grid3x3, AlignCenterHorizontal, AlignCenterVertical, Box, Undo2, Redo2, Play, Square, MessageSquare } from "lucide-react";
import Link from "next/link";
import type { ScreenSpec, BindingsSchema } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import SettingsDialog from "@/components/SettingsDialog";
import BindingsModal from "@/components/BindingsModal";
import { chatProviderLabel, useChatProvider } from "@/lib/ai/chatStore";
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
  /** opens the Codex Chat / Claude Chat panel (editor header) */
  onOpenChat?: () => void;
  chatOpen?: boolean;
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
  onScreenChange, onExportProject, onOpenChat, chatOpen, onImportProject, onCopyJava, onResetTextures, onViewTextures, onExtractPack,
  scale, onZoomIn, onZoomOut, onZoomReset, onSaveToTestMod,
  bindingsSchema, onUpdateBindingsSchema, actions, onUpdateActions, modId,
}: Props) {
  const chatProvider = useChatProvider();
  const SNAP_STEPS = [1, 2, 4, 8];
  const snapIdx = SNAP_STEPS.indexOf(gridSize);
  return (
    <div className="flex items-center gap-1 border-b bg-sidebar px-2 py-1 flex-wrap shrink-0">
      <div className="flex items-center gap-1.5">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          W:
          <Input
            className="h-7 w-16 text-xs"
            type="number"
            value={screen.width}
            onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v > 0) onScreenChange({ width: v }); }}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          H:
          <Input
            className="h-7 w-16 text-xs"
            type="number"
            value={screen.height}
            onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v > 0) onScreenChange({ height: v }); }}
          />
        </label>
      </div>

      <Separator orientation="vertical" className="mx-1 h-4" />

      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted data-[popup-open]:text-foreground"
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

      <Separator orientation="vertical" className="mx-1 h-4" />

      <Button variant="ghost" size="sm" className="h-7 w-7 px-0" onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)"><Undo2 className="h-4 w-4" /></Button>
      <Button variant="ghost" size="sm" className="h-7 w-7 px-0" onClick={onRedo} disabled={!canRedo} title="Redo (⌘⇧Z)"><Redo2 className="h-4 w-4" /></Button>

      <Separator orientation="vertical" className="mx-1 h-4" />

      <Button variant="ghost" size="sm" className="h-7 w-7 px-0" onClick={onCenterHorizontal} disabled={!hasSelection} title="Center selection horizontally">
        <AlignCenterHorizontal className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" className="h-7 w-7 px-0" onClick={onCenterVertical} disabled={!hasSelection} title="Center selection vertically">
        <AlignCenterVertical className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-4" />

      <div className="flex items-center">
        <Button variant="ghost" size="sm" className="h-7 w-7 px-0" onClick={onZoomOut} disabled={scale <= 1} title="Zoom out (⌘-)">−</Button>
        <Button variant="ghost" size="sm" className="h-7 min-w-10 px-1 text-xs tabular-nums" onClick={onZoomReset} title="Reset zoom (⌘0)">{Math.round(scale)}×</Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 px-0" onClick={onZoomIn} disabled={scale >= 8} title="Zoom in (⌘+)">+</Button>
      </div>

      <Separator orientation="vertical" className="mx-1 h-4" />

      <Button
        size="sm"
        className="h-7 gap-1.5 px-3 font-semibold"
        variant={tryMode ? "destructive" : "default"}
        onClick={onToggleTryMode}
        title="Toggle try mode (T)"
      >
        {tryMode ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
        {tryMode ? "Stop" : "Try"}
      </Button>

      <div className="ml-auto flex items-center gap-1">
        {process.env.NODE_ENV === "development" && onSaveToTestMod && (
          <>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onSaveToTestMod} title="Save to neoforge-runtime test_container_screen.json">
              Save to test mod
            </Button>
            <Separator orientation="vertical" className="mx-1 h-4" />
          </>
        )}
        <Button variant="ghost" size="sm" className="h-7 w-7 px-0" onClick={onCopyJava} title="Copy Java class definition">
          <Clipboard className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="mx-1 h-4" />
        <Button variant="ghost" size="sm" className="h-7 w-7 px-0" onClick={onImportProject} title="Import project (all screens)">
          <FolderUp className="h-4 w-4" />
        </Button>
        {onOpenChat && (
          <Button variant="ghost" size="sm" className={`h-7 gap-1 px-2 text-xs ${chatOpen ? "bg-accent text-primary" : ""}`} onClick={onOpenChat} title={`${chatProviderLabel(chatProvider)} — let the AI use the editor's features`} aria-pressed={!!chatOpen}>
            <MessageSquare className="h-4 w-4" /> {chatProviderLabel(chatProvider)}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 w-7 px-0" onClick={onExportProject} title="Export project (all screens)">
          <FolderDown className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="mx-1 h-4" />
        <BindingsModal
          schema={bindingsSchema}
          onChangeSchema={onUpdateBindingsSchema}
          actions={actions}
          onChangeActions={onUpdateActions}
          modId={modId}
        />
        <Link href="/docs" target="_blank" title="Documentation" className="inline-flex items-center justify-center h-7 w-7 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <BookOpen className="h-4 w-4" />
        </Link>
        <Link href="/glb-to-bbmodel" target="_blank" title="GLB → bbmodel Konverter (für Blockbench)" className="inline-flex items-center justify-center h-7 w-7 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <Box className="h-4 w-4" />
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
