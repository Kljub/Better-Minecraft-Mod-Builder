"use client";

import { useRef, useState } from "react";
import { Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ScreenSpec } from "@/lib/types";
import AiSettingsTab from "@/components/AiSettingsTab";
import { setNextDevToolsVisible, useNextDevToolsVisible } from "@/lib/devToolsSetting";

export type SettingsTab = "general" | "ai";
const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "ai", label: "AI" },
];

interface Props {
  screen: ScreenSpec;
  onScreenChange: (patch: Partial<ScreenSpec>) => void;
  onResetTextures: () => Promise<void>;
  onViewTextures: () => void;
  onExtractPack: (file: File) => Promise<{ extracted: string[]; missing: string[] }>;
  /** controlled mode (e.g. opened from the sidebar rail's gear) — hides the built-in trigger button */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialTab?: SettingsTab;
}

export default function SettingsDialog({
  screen,
  onScreenChange,
  onResetTextures,
  onViewTextures,
  onExtractPack,
  open: controlledOpen,
  onOpenChange,
  initialTab = "general",
}: Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (v: boolean) => { if (!controlled) setUncontrolledOpen(v); onOpenChange?.(v); };
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const showDevTools = useNextDevToolsVisible();
  const [resetLoading, setResetLoading] = useState(false);
  const [packLoading, setPackLoading] = useState(false);
  const [packResult, setPackResult] = useState<{ extracted: string[]; missing: string[] } | null>(null);
  const packInputRef = useRef<HTMLInputElement>(null);

  const handleReset = async () => {
    setResetLoading(true);
    try { await onResetTextures(); } finally { setResetLoading(false); }
  };

  const handlePackFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPackLoading(true);
    setPackResult(null);
    try {
      const result = await onExtractPack(file);
      setPackResult(result);
    } finally {
      setPackLoading(false);
    }
  };

  const busy = resetLoading || packLoading;

  return (
    <>
      {!controlled && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 px-0"
          onClick={() => setOpen(true)}
          title="Settings"
        >
          <Settings className="h-5 w-5" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>

          <div className="flex gap-1 border-b border-input">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-2.5 py-1 text-sm -mb-px border-b-2 ${tab === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "ai" && <AiSettingsTab />}

          {tab === "general" && (
          <div className="flex flex-col gap-5 py-2">
            {/* Project */}
            <section className="flex flex-col gap-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Project</p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="settings-modid">Mod ID</Label>
                <Input
                  id="settings-modid"
                  placeholder="e.g. my_mod"
                  value={screen.modId ?? ""}
                  onChange={(e) => onScreenChange({ modId: e.target.value || undefined })}
                />
                <p className="text-xs text-muted-foreground">
                  Namespace prepended to action and binding IDs when no colon is present.
                </p>
              </div>
            </section>

            <Separator />

            {process.env.NODE_ENV === "development" && (
              <>
                {/* Developer */}
                <section className="flex flex-col gap-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Developer</p>
                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <div>
                      <p className="text-sm">Show Next.js dev tools</p>
                      <p className="text-xs text-muted-foreground">The floating &quot;N&quot; badge in the bottom corner (dev server only)</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={showDevTools}
                      onChange={(e) => setNextDevToolsVisible(e.target.checked)}
                    />
                  </label>
                </section>

                <Separator />
              </>
            )}

            {/* Textures */}
            <section className="flex flex-col gap-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Textures</p>
              <div className="flex flex-col gap-2">
                <input
                  ref={packInputRef}
                  type="file"
                  accept=".jar,.zip"
                  className="hidden"
                  onChange={handlePackFile}
                />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm">Load from JAR / Resource Pack</p>
                    <p className="text-xs text-muted-foreground">
                      Upload your own <code className="font-mono">1.21.x.jar</code> or a <code className="font-mono">.zip</code> resource pack — textures are extracted client-side and never sent to a server.
                    </p>
                    {packResult && (
                      <p className="text-xs mt-1">
                        <span className="text-green-600 dark:text-green-400">
                          {packResult.extracted.length} extracted
                        </span>
                        {packResult.missing.filter(n => n !== "mc_scrollbar_handle.png").length > 0 && (
                          <span className="text-muted-foreground">
                            {" · "}not found: {packResult.missing.filter(n => n !== "mc_scrollbar_handle.png").join(", ")}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => packInputRef.current?.click()}
                    disabled={busy}
                    className="shrink-0"
                  >
                    {packLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Browse"}
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">View Textures</p>
                    <p className="text-xs text-muted-foreground">Browse loaded texture atlas</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setOpen(false); onViewTextures(); }} className="shrink-0">
                    Open
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Reset Textures</p>
                    <p className="text-xs text-muted-foreground">Remove all custom textures</p>
                  </div>
                  <Button size="sm" variant="destructive" onClick={handleReset} disabled={busy} className="shrink-0">
                    {resetLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reset"}
                  </Button>
                </div>
              </div>
            </section>
          </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
