import JSZip from "jszip";
import { downloadBlob } from "./exportBundle";

export interface TextureFile {
  key: string;
  url: string;
}

/** "custom/foo.png" -> "foo.png" */
export function textureFileName(key: string): string {
  return key.slice(key.lastIndexOf("/") + 1);
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read texture (HTTP ${res.status}).`);
  return res.blob();
}

export async function downloadTexture({ key, url }: TextureFile): Promise<void> {
  downloadBlob(await fetchBlob(url), textureFileName(key));
}

/** Same `assets/<modid>/textures/<key>` layout as the export zips, so it extracts straight into a mod's resources. */
export async function buildTexturesZip(files: { key: string; blob: Blob }[], modId: string): Promise<Blob> {
  const zip = new JSZip();
  for (const { key, blob } of files) zip.file(`assets/${modId}/textures/${key}`, await blob.arrayBuffer());
  return zip.generateAsync({ type: "blob" });
}

export async function downloadTexturesZip(files: TextureFile[], modId: string): Promise<void> {
  const blobs = await Promise.all(files.map(async (f) => ({ key: f.key, blob: await fetchBlob(f.url) })));
  downloadBlob(await buildTexturesZip(blobs, modId), `${modId}-textures.zip`);
}
