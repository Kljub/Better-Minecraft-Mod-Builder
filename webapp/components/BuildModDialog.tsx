"use client";

import { useState } from "react";
import { Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { modIdProblem, versionProblem, type ModJarMeta } from "@/lib/modJar";
import type { ModJarResult } from "@/lib/exportBundle";
import type { McVersion } from "@/lib/mcVersion";

type Meta = Omit<ModJarMeta, "modId">;

const storageKey = (projectKey: string) => `mc-ui-builder:mod-jar:${projectKey}`;

function loadMeta(projectKey: string, modId: string): Meta {
  const fallback: Meta = { version: "1.0.0", displayName: modId.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "), description: "", authors: "" };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(projectKey)) ?? "null") as Partial<Meta> | null;
    return { ...fallback, ...(saved ?? {}) };
  } catch {
    return fallback;
  }
}

/**
 * "Build mod (.jar)": name/version/authors for the mod, then one jar for the mods folder with
 * every element of the project (see lib/modJar). The fields are remembered per project.
 */
export default function BuildModDialog({ open, onOpenChange, projectKey, modId, mcVersion, onBuild }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string;
  modId: string;
  mcVersion: McVersion;
  onBuild: (meta: Meta) => Promise<ModJarResult>;
}) {
  const [meta, setMeta] = useState<Meta>(() => loadMeta(projectKey, modId));
  const [busy, setBusy] = useState(false);
  const problem = modIdProblem(modId) ?? versionProblem(meta.version.trim());
  const set = (patch: Partial<Meta>) => setMeta((m) => ({ ...m, ...patch }));

  const build = async () => {
    setBusy(true);
    const clean = { ...meta, version: meta.version.trim(), displayName: meta.displayName.trim() || modId };
    try { localStorage.setItem(storageKey(projectKey), JSON.stringify(clean)); } catch { /* storage blocked */ }
    try {
      const result = await onBuild(clean);
      toast.success(`${result.fileName} built — put it in the mods folder.`, {
        description: result.runtimeBundled
          ? "The ScreenSpec runtime is included — nothing else to install besides NeoForge."
          : `No ScreenSpec runtime for Minecraft ${mcVersion} on this server — players also need the ScreenSpec mod.`,
        duration: 10_000,
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(`Could not build the mod: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, input: React.ReactNode) => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {input}
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="build-mod-dialog">
        <DialogHeader>
          <DialogTitle>Build mod (.jar)</DialogTitle>
          <DialogDescription>
            Compiles the whole project — items, blocks, screens, elements, textures — into one NeoForge mod
            for Minecraft {mcVersion}. Drop the jar into the mods folder.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2.5">
          {field("Mod id", <Input className="h-7 font-mono text-xs" value={modId} readOnly title="Set in the project (screens/items mod id)" />)}
          <div className="grid grid-cols-2 gap-2">
            {field("Name", <Input aria-label="Mod name" className="h-7 text-xs" value={meta.displayName} onChange={(e) => set({ displayName: e.target.value })} />)}
            {field("Version", <Input aria-label="Mod version" className="h-7 font-mono text-xs" value={meta.version} onChange={(e) => set({ version: e.target.value })} />)}
          </div>
          {field("Authors", <Input aria-label="Mod authors" className="h-7 text-xs" value={meta.authors ?? ""} onChange={(e) => set({ authors: e.target.value })} />)}
          {field("Description", (
            <textarea aria-label="Mod description" rows={3} value={meta.description ?? ""} onChange={(e) => set({ description: e.target.value })}
              className="w-full resize-y rounded-sm border border-input bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:border-ring" />
          ))}
          {problem && <p className="text-xs text-amber-400" role="alert">{problem}</p>}
          <Button className="mt-1 gap-1.5" disabled={busy || !!problem} onClick={build}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            Build {modId}-{meta.version.trim() || "?"}.jar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
