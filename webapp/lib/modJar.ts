import type JSZip from "jszip";
import type { McVersion } from "./mcVersion";

/**
 * "Build mod (.jar)": turns the project into a mod file that goes straight into a mods folder.
 * No Java is compiled — the jar is a NeoForge mod without an entrypoint class: its
 * neoforge.mods.toml declares the mod id, and neoforge-runtime (ScreenSpecMod) registers the
 * exported items/blocks/elements for every loaded mod id it finds specs for. The runtime is nested
 * inside (Jar-in-Jar, META-INF/jarjar) when its jar for the project's Minecraft version is
 * available, so players install one file.
 */

export interface ModJarMeta {
  modId: string;
  version: string;
  displayName: string;
  description?: string;
  authors?: string;
}

/** The neoforge-runtime jar to nest, with the version its neoforge.mods.toml reports. */
export interface RuntimeJar {
  bytes: Uint8Array;
  version: string;
  /** Minecraft version it was built for */
  minecraft: string;
}

export const RUNTIME_GROUP = "sheepfromheaven.screenspec";
export const RUNTIME_ARTIFACT = "screenspec-neoforge";
const RUNTIME_MOD_ID = "screenspec";

/** NeoForge mod ids: lowercase letter first, then a–z, 0–9, _ (2–64 chars). */
export function modIdProblem(modId: string): string | null {
  if (!modId) return "The project has no mod id.";
  if (modId === "minecraft" || modId === "neoforge" || modId === RUNTIME_MOD_ID) return `"${modId}" is taken — set your own mod id.`;
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(modId)) return `"${modId}" is not a valid mod id — use 2–64 characters: a–z, 0–9 and _, starting with a letter.`;
  return null;
}

/** Version numbers NeoForge accepts (Maven style): digits and dots, optional -suffix. */
export function versionProblem(version: string): string | null {
  return /^\d+(\.\d+){0,3}(-[A-Za-z0-9.]+)?$/.test(version) ? null : `"${version}" is not a valid version — use e.g. 1.0.0.`;
}

/** Version ranges for the jar's dependencies. */
function ranges(mcVersion: McVersion): { minecraft: string; neoforge: string } {
  return mcVersion === "1.21.1"
    ? { minecraft: "[1.21.1,1.21.2)", neoforge: "[21.1,21.2)" }
    : { minecraft: "[26.2,26.3)", neoforge: "[26.2,26.3)" };
}

const tomlString = (s: string) => JSON.stringify(s); // TOML basic strings use JSON's escapes

export function modsToml(meta: ModJarMeta, mcVersion: McVersion, runtimeVersion = "0.1.0"): string {
  const r = ranges(mcVersion);
  const dep = (modId: string, range: string) => [
    `[[dependencies.${meta.modId}]]`,
    `    modId = ${tomlString(modId)}`,
    `    type = "required"`,
    `    versionRange = ${tomlString(range)}`,
    `    ordering = "${modId === RUNTIME_MOD_ID ? "AFTER" : "NONE"}"`,
    `    side = "BOTH"`,
  ].join("\n");
  return [
    `modLoader = "javafml"`,
    `loaderVersion = "[1,)"`,
    `license = "All Rights Reserved"`,
    "",
    `[[mods]]`,
    `modId = ${tomlString(meta.modId)}`,
    `version = ${tomlString(meta.version)}`,
    `displayName = ${tomlString(meta.displayName || meta.modId)}`,
    ...(meta.authors?.trim() ? [`authors = ${tomlString(meta.authors.trim())}`] : []),
    `description = '''`,
    (meta.description?.trim() || `Made with MC Screen Designer.`).replace(/'''/g, "''"),
    `'''`,
    "",
    dep("neoforge", r.neoforge),
    "",
    dep("minecraft", r.minecraft),
    "",
    dep(RUNTIME_MOD_ID, `[${runtimeVersion},)`),
    "",
  ].join("\n");
}

/** Mod metadata (and the nested runtime) — the content itself is written by writeGeneratedFiles. */
export function writeModJarMeta(zip: JSZip, meta: ModJarMeta, mcVersion: McVersion, runtime?: RuntimeJar): void {
  zip.file("META-INF/MANIFEST.MF", [
    "Manifest-Version: 1.0",
    `Implementation-Title: ${meta.modId}`,
    `Implementation-Version: ${meta.version}`,
    "Created-By: MC Screen Designer",
    "", "",
  ].join("\r\n"));
  zip.file("META-INF/neoforge.mods.toml", modsToml(meta, mcVersion, runtime?.version));
  if (!runtime) return;
  const path = `META-INF/jarjar/${RUNTIME_ARTIFACT}-${runtime.version}.jar`;
  zip.file(path, runtime.bytes);
  zip.file("META-INF/jarjar/metadata.json", JSON.stringify({
    jars: [{
      identifier: { group: RUNTIME_GROUP, artifact: RUNTIME_ARTIFACT },
      version: { range: `[${runtime.version},)`, artifactVersion: runtime.version },
      path,
      isObfuscated: false,
    }],
  }, null, 2));
}

/** The runtime jar this server has for `mcVersion` (neoforge-runtime's own build), if any. */
export async function fetchRuntimeJar(mcVersion: McVersion): Promise<RuntimeJar | undefined> {
  try {
    const res = await fetch(`/api/runtime-jar?mc=${encodeURIComponent(mcVersion)}`);
    if (!res.ok) return undefined;
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      version: res.headers.get("x-runtime-version") || "0.1.0",
      minecraft: res.headers.get("x-minecraft-version") || mcVersion,
    };
  } catch {
    return undefined;
  }
}
