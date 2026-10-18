"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import GlbPreview3D from "@/components/GlbPreview3D";
import { parseGlb, extractGlbMeshData, type GlbMeshData } from "@/lib/glbMeshData";
import { buildBbmodel } from "@/lib/bbmodel";
import { buildGeckoLibGeometry } from "@/lib/geckolibGeometry";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function baseName(filename: string): string {
  return filename.replace(/\.glb$/i, "");
}

/** Which material has the most triangles — GeckoLib only has room for one shared texture, so
 * that's the one most likely to be "the" model rather than a minor/unused material slot. */
function primaryMaterialIndex(meshes: GlbMeshData["meshes"]): number {
  const counts = new Map<number, number>();
  for (const mesh of meshes) {
    for (const tri of mesh.triangles) counts.set(tri.materialIndex, (counts.get(tri.materialIndex) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = -1;
  for (const [idx, count] of counts) if (count > bestCount) { best = idx; bestCount = count; }
  return best;
}

function materialTexturePngDataUrl(material: GlbMeshData["materials"][number]): string {
  if (material.textureDataUrl) return material.textureDataUrl;
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const color = new THREE.Color(material.color ?? 0xcccccc);
  ctx.fillStyle = `#${color.getHexString()}`;
  ctx.fillRect(0, 0, size, size);
  return canvas.toDataURL("image/png");
}

export default function GlbToBbmodelPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [targetSize, setTargetSize] = useState(16);
  const [converting, setConverting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [meshData, setMeshData] = useState<GlbMeshData | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const convert = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".glb")) {
      toast.error("Nur .glb Dateien werden unterstützt (binäres glTF — Tripo AI's Standard-Export).");
      return;
    }
    setConverting(true);
    setMeshData(null);
    try {
      const buffer = await file.arrayBuffer();
      const gltf = await parseGlb(buffer);
      const data = extractGlbMeshData(gltf);
      if (data.stats.meshCount === 0) {
        toast.error("Keine Meshes in dieser GLB-Datei gefunden.");
        return;
      }
      setFileName(file.name);
      setMeshData(data);
      toast.success(`Konvertiert: ${data.stats.meshCount} Mesh(es), ${data.stats.triangleCount} Dreiecke.`);
      if (data.materials.length > 1) {
        toast.warning(`${data.materials.length} Materialien gefunden — GeckoLib unterstützt nur eine gemeinsame Textur, das .bbmodel bekommt alle, der GeckoLib-Export nur das meistgenutzte Material.`);
      }
    } catch (err) {
      toast.error(`Konvertierung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setConverting(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void convert(file);
  }, [convert]);

  const primaryMaterial = useMemo(() => {
    if (!meshData) return null;
    const idx = primaryMaterialIndex(meshData.meshes);
    return { index: idx, material: meshData.materials[idx] };
  }, [meshData]);

  const handleDownloadBbmodel = useCallback(() => {
    if (!meshData || !fileName) return;
    const bbmodel = buildBbmodel({ modelName: baseName(fileName), meshes: meshData.meshes, materials: meshData.materials, targetSize });
    downloadBlob(new Blob([JSON.stringify(bbmodel, null, 2)], { type: "application/json" }), `${baseName(fileName)}.bbmodel`);
  }, [meshData, fileName, targetSize]);

  const handleDownloadGeckoLib = useCallback(() => {
    if (!meshData || !fileName || !primaryMaterial) return;
    const geo = buildGeckoLibGeometry({
      modelName: baseName(fileName),
      meshes: meshData.meshes,
      materialIndex: primaryMaterial.index,
      textureWidth: primaryMaterial.material.width ?? 16,
      textureHeight: primaryMaterial.material.height ?? 16,
      targetSize,
    });
    downloadBlob(new Blob([JSON.stringify(geo, null, 2)], { type: "application/json" }), `geo_${baseName(fileName)}.geo.json`);
  }, [meshData, fileName, targetSize, primaryMaterial]);

  const handleDownloadTexture = useCallback(() => {
    if (!fileName || !primaryMaterial) return;
    const dataUrl = materialTexturePngDataUrl(primaryMaterial.material);
    fetch(dataUrl).then((r) => r.blob()).then((blob) => downloadBlob(blob, `${baseName(fileName)}.png`));
  }, [fileName, primaryMaterial]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">GLB → bbmodel / GeckoLib Konverter</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Wandelt eine .glb-Datei (z.B. von Tripo AI exportiert) in ein Blockbench-kompatibles
          .bbmodel (zum Weiterbearbeiten in Blockbench) oder eine GeckoLib-Geometrie
          (.geo.json + Textur, direkt fürs Mod nutzbar) um.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. GLB-Datei</CardTitle>
          <CardDescription>Per Drag &amp; Drop oder Dateiauswahl.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex h-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed text-sm transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {converting ? "Konvertiere…" : fileName ?? "Datei hierher ziehen oder klicken"}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void convert(file);
              e.target.value = "";
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Größe</CardTitle>
          <CardDescription>
            Modell wird automatisch zentriert, auf den Boden (Y=0) gesetzt und so skaliert, dass
            seine größte Ausdehnung dieser Zahl entspricht. 16 = ein Minecraft-Block.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 max-w-48">
            <Label htmlFor="target-size">Zielgröße</Label>
            <Input
              id="target-size"
              type="number"
              min={1}
              value={targetSize}
              onChange={(e) => setTargetSize(Number(e.target.value) || 16)}
            />
          </div>
        </CardContent>
      </Card>

      {meshData && (
        <Card>
          <CardHeader>
            <CardTitle>3. Vorschau &amp; Download</CardTitle>
            <CardDescription>
              {meshData.stats.meshCount} Mesh(es) · {meshData.stats.triangleCount} Dreiecke ·{" "}
              {meshData.stats.textureCount} Material(ien). Dreiecke sind nicht verschweißt (jedes
              Dreieck hat eigene Vertices) — bei Bedarf in Blockbench mit den eigenen
              Merge-/Weld-Werkzeugen nachbearbeiten.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-64 rounded-lg border border-border bg-muted/30">
              <GlbPreview3D scene={meshData.scene} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleDownloadBbmodel}>.bbmodel herunterladen</Button>
              <Button variant="outline" onClick={handleDownloadGeckoLib}>GeckoLib .geo.json herunterladen</Button>
              <Button variant="outline" onClick={handleDownloadTexture}>Textur (PNG) herunterladen</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Für GeckoLib: .geo.json nach <code>assets/&lt;modid&gt;/geo/</code> und die PNG nach{" "}
              <code>assets/&lt;modid&gt;/textures/entity/</code> legen.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
