import { AudioLines } from "lucide-react";
import type { ElementKindDef, ElementSpec } from "./types";
import { num, opts, str, bool, titleCase } from "./helpers";

/**
 * Sounds: an uploaded audio/video file, converted by the web UI's server (ffmpeg,
 * app/api/sounds/convert) to Ogg Vorbis — the only format Minecraft plays. Exports
 * assets/<modid>/sounds/<id>.ogg, the merged assets/<modid>/sounds.json entry, a subtitle in the
 * lang file, and a runtime manifest entry so neoforge-runtime registers the SoundEvent (then other
 * elements can use "<modid>:<id>", e.g. a profession's work sound).
 */
export interface SoundValue {
  /** binary-store key (lib/structureStore — the generic element file store) of the converted .ogg */
  file: string;
  /** original upload's file name */
  source: string;
  /** seconds */
  duration: number;
  mono: boolean;
}

export const soundValue = (spec: ElementSpec): SoundValue | null => {
  const v = spec.sound as SoundValue | undefined;
  return v && typeof v === "object" && typeof v.file === "string" && v.file ? v : null;
};

const CATEGORIES = ["master", "music", "record", "weather", "block", "hostile", "neutral", "player", "ambient", "voice", "ui"];

export const SOUND: ElementKindDef = {
  kind: "sound",
  label: "Sound",
  plural: "Sounds",
  icon: AudioLines,
  idPrefix: "sound",
  description: "A custom sound: upload any audio or video file (mp3, wav, flac, ogg, m4a, mkv, mp4 …) — it's converted to Ogg Vorbis for Minecraft automatically.",
  labelField: "name",
  defaults: () => ({ name: "", subtitle: "", category: "neutral", volume: 1, pitch: 1, stream: false, attenuation: 16, sound: null }),
  fields: [
    { key: "name", label: "Name", type: "text", half: true, placeholder: "Robot beep" },
    { key: "subtitle", label: "Subtitle (shown with subtitles on)", type: "text", half: true, placeholder: "Robot beeps" },
    { key: "sound", label: "Sound file", type: "sound" },
    {
      key: "category", label: "Volume slider (category)", type: "select", half: true,
      options: opts(CATEGORIES, Object.fromEntries(CATEGORIES.map((c) => [c, titleCase(c)]))),
      help: "Which volume slider controls it when your mod plays it (e.g. Hostile Creatures for a monster).",
    },
    { key: "attenuation", label: "Hearing distance (blocks)", type: "number", min: 1, max: 256, integer: true, half: true },
    { key: "volume", label: "Volume (0–1)", type: "number", min: 0, max: 1, half: true },
    { key: "pitch", label: "Pitch (0.5–2)", type: "number", min: 0.5, max: 2, half: true },
    { key: "stream", label: "Stream from disk (long sounds / music)", type: "boolean", help: "Recommended above ~4 seconds; streamed sounds aren't loaded into memory up front." },
  ],
  binaryFiles: (spec) => [soundValue(spec)?.file ?? ""].filter(Boolean),
  validate: (spec) => {
    const v = soundValue(spec);
    const problems: string[] = [];
    if (!v) problems.push("Upload a sound file.");
    else if (v.duration > 8 && !bool(spec, "stream")) problems.push(`The sound is ${v.duration.toFixed(1)} s long — turn on "Stream from disk" for long sounds.`);
    return problems;
  },
  files: (spec, { modId, file }) => {
    const v = soundValue(spec);
    const blob = v ? file?.(v.file) : undefined;
    return blob ? [{ path: `assets/${modId}/sounds/${spec.id}.ogg`, content: blob }] : [];
  },
  shared: (spec, { modId }) => {
    const subtitle = str(spec, "subtitle").trim();
    const entry: Record<string, unknown> = { name: `${modId}:${spec.id}` };
    const volume = num(spec, "volume", 1), pitch = num(spec, "pitch", 1), dist = Math.round(num(spec, "attenuation", 16));
    if (volume !== 1) entry.volume = Math.min(1, Math.max(0, volume));
    if (pitch !== 1) entry.pitch = Math.min(2, Math.max(0.5, pitch));
    if (dist !== 16) entry.attenuation_distance = Math.max(1, dist);
    if (bool(spec, "stream")) entry.stream = true;
    return {
      jsonMerge: { [`assets/${modId}/sounds.json`]: { [spec.id]: { sounds: [entry], ...(subtitle ? { subtitle: `subtitles.${modId}.${spec.id}` } : {}) } } },
      lang: subtitle ? { [`subtitles.${modId}.${spec.id}`]: subtitle } : {},
      manifest: { sounds: { id: spec.id, category: str(spec, "category") || "neutral", range: dist } },
    };
  },
};
