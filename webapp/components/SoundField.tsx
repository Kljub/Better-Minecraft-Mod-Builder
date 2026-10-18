"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadStructureFile, saveStructureFile } from "@/lib/structureStore";
import type { SoundValue } from "@/lib/elements/soundKind";

/**
 * Sounds element: upload any audio or video file; the web UI's server converts it to Ogg Vorbis
 * (app/api/sounds/convert), the result is stored with the element's other binary files and can be
 * played back right here.
 */
const ACCEPT = "audio/*,video/*,.mp3,.wav,.ogg,.oga,.opus,.flac,.m4a,.aac,.aiff,.mkv,.mka,.mp4,.mov,.webm,.avi,.wma";

export default function SoundField({ value, onChange }: { value: SoundValue | undefined | null; onChange: (v: SoundValue | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mono, setMono] = useState(value?.mono ?? true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  // Playback URL for the stored .ogg.
  useEffect(() => {
    if (!value?.file) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    loadStructureFile(value.file).then((blob) => {
      if (cancelled) return;
      if (!blob) { setError("The converted file isn't stored in this browser any more — upload it again."); return; }
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [value?.file]);

  const upload = async (file: File) => {
    setBusy(`Converting ${file.name}…`);
    setError(null);
    try {
      const res = await fetch(`/api/sounds/convert?mono=${mono ? 1 : 0}`, { method: "POST", body: file });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const ogg = await res.blob();
      const stem = file.name.replace(/\.[^.]+$/, "") || "sound";
      const key = await saveStructureFile(new Blob([ogg], { type: "audio/ogg" }), `${stem}.ogg`);
      onChange({ file: key, source: file.name, duration: Number(res.headers.get("x-duration")) || 0, mono });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid="sound-field">
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" aria-label="Sound file"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" className="h-7 gap-1.5 text-xs" disabled={!!busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {value ? "Replace…" : "Upload audio or video…"}
        </Button>
        <label className="flex items-center gap-1.5 text-xs" title="Only mono sounds come from a place in the world (they get quieter with distance). Stereo is for music and UI sounds.">
          <input type="checkbox" checked={mono} disabled={!!busy} onChange={(e) => setMono(e.target.checked)} className="accent-primary" />
          Mono (positional in the world)
        </label>
        {busy && <span className="text-[11px] text-muted-foreground">{busy}</span>}
      </div>
      {value && (
        <div className="flex flex-col gap-1 rounded-sm border border-input p-2 text-[11px]">
          <div className="flex flex-wrap gap-x-3 text-muted-foreground">
            <span className="text-foreground">{value.source}</span>
            <span>→ Ogg Vorbis, {value.mono ? "mono" : "stereo"}, 44.1 kHz</span>
            {value.duration > 0 && <span>{value.duration.toFixed(1)} s</span>}
          </div>
          {url && <audio controls src={url} className="h-8 w-full" data-testid="sound-preview" />}
          {value.mono !== mono && <span className="text-amber-300">Upload again to apply the {mono ? "mono" : "stereo"} setting.</span>}
        </div>
      )}
      {error && <p className="text-[11px] text-destructive" role="alert">{error}</p>}
      <p className="text-[10px] text-muted-foreground">mp3, wav, flac, ogg/opus, m4a/aac, aiff — or a video (mkv, mp4, webm, mov, avi): its sound track is used. Converted by the web UI to Ogg Vorbis, the format Minecraft needs.</p>
    </div>
  );
}
