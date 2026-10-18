"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import StructureViewer3D from "@/components/StructureViewer3D";
import { readStructure, type StructureInfo } from "@/lib/nbt";
import { loadStructureFile, saveStructureFile } from "@/lib/structureStore";
import { useTextures } from "@/lib/TextureContext";

/**
 * Structures element: pick a structure template (.nbt — saved with a structure block in
 * .minecraft/saves/<world>/generated/<ns>/structures/), stored in IndexedDB; shows its size, a
 * block list and an interactive 3D view. `value` is the structure-store key.
 */
export default function StructureField({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const { packTextures } = useTextures();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<{ key: string; info?: StructureInfo; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    loadStructureFile(value)
      .then(async (blob) => {
        if (!blob) throw new Error("The file isn't stored in this browser any more — upload it again.");
        return readStructure(await blob.arrayBuffer());
      })
      .then((info) => { if (!cancelled) setLoaded({ key: value, info }); })
      .catch((e) => { if (!cancelled) setLoaded({ key: value, error: e instanceof Error ? e.message : String(e) }); });
    return () => { cancelled = true; };
  }, [value]);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const bytes = await file.arrayBuffer();
      const info = await readStructure(bytes); // reject non-structure files before storing them
      const key = await saveStructureFile(new Blob([bytes]), file.name);
      setLoaded({ key, info });
      onChange(key);
    } catch (e) {
      setLoaded({ key: value, error: `Not a readable structure file: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const current = loaded && loaded.key === value ? loaded : null;
  const info = current?.info;
  const fileName = value ? value.split("/").slice(1).join("/") : "";
  const counts = info ? Object.entries(info.counts).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".nbt"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }}
      />
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" className="h-7 gap-1.5 text-xs" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {value ? "Replace .nbt" : "Upload .nbt"}
        </Button>
        {fileName && <span className="truncate font-mono text-muted-foreground">{fileName}</span>}
      </div>
      {current?.error && <p className="text-destructive">{current.error}</p>}
      {value && !current && <p className="text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Reading structure…</p>}
      {info && (
        <>
          <StructureViewer3D key={value} info={info} packTextures={packTextures} className="h-[380px]" />
          <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
            <div className="rounded-sm border border-input p-1.5"><div className="text-muted-foreground">Width (X)</div>{info.size[0]}</div>
            <div className="rounded-sm border border-input p-1.5"><div className="text-muted-foreground">Height (Y)</div>{info.size[1]}</div>
            <div className="rounded-sm border border-input p-1.5"><div className="text-muted-foreground">Depth (Z)</div>{info.size[2]}</div>
          </div>
          <details>
            <summary className="cursor-pointer text-muted-foreground">
              {info.solidCount.toLocaleString()} blocks · {counts.length} block types{info.entityCount ? ` · ${info.entityCount} entities` : ""}
              {info.dataVersion ? ` · DataVersion ${info.dataVersion}` : ""}
            </summary>
            <div className="mt-1 grid max-h-48 grid-cols-2 gap-x-3 overflow-y-auto font-mono text-[11px]">
              {counts.map(([name, n]) => (
                <div key={name} className="flex justify-between gap-2">
                  <span className="truncate">{name.replace(/^minecraft:/, "")}</span>
                  <span className="text-muted-foreground">{n}</span>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
