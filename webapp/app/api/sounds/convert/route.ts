import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { accountsEnabled } from "@/lib/server/db";
import { currentUser, sameOrigin } from "@/lib/server/auth";

/**
 * Sounds tab: converts an uploaded audio or video file (mp3, wav, flac, m4a/aac, ogg/opus, mkv,
 * mp4, webm, avi …) to what Minecraft plays — Ogg Vorbis, 44.1 kHz; mono by default (only mono
 * sounds are positional in the world), stereo on request (music). Video files: the audio track.
 *
 * Body: the raw file. Query: ?mono=0|1. Response: audio/ogg, duration in X-Duration (seconds).
 * Hardening for untrusted media: only known audio/video demuxers, ffmpeg may only open the temp
 * file itself (no playlists/concat lists pulling in other files or URLs), size and time limits.
 */
const MAX_BYTES = 200 * 1024 * 1024;
const MAX_SECONDS = 20 * 60;
const FORMATS = "mp3,wav,ogg,flac,aac,aiff,matroska,webm,mov,mp4,m4a,3gp,asf,avi";

function run(args: string[], timeoutMs: number) {
  return new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stderr.on("data", (d) => { stderr = (stderr + d).slice(-8000); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, stderr }); });
  });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin request refused" }, { status: 403 });
  if (accountsEnabled() && !(await currentUser(request).catch(() => null))) return Response.json({ error: "Not logged in" }, { status: 401 });
  const mono = new URL(request.url).searchParams.get("mono") !== "0";
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BYTES) return Response.json({ error: "File too large (max 200 MB)" }, { status: 413 });
  const input = Buffer.from(await request.arrayBuffer());
  if (!input.length) return Response.json({ error: "Empty file" }, { status: 400 });
  if (input.length > MAX_BYTES) return Response.json({ error: "File too large (max 200 MB)" }, { status: 413 });

  const dir = await mkdtemp(join(tmpdir(), "mmb-sound-"));
  try {
    const src = join(dir, "input");
    const out = join(dir, "out.ogg");
    await writeFile(src, input);
    const { code, stderr } = await run([
      "-hide_banner", "-nostdin", "-loglevel", "error",
      "-protocol_whitelist", "file", "-format_whitelist", FORMATS,
      "-i", src,
      "-vn", "-sn", "-dn", "-map", "0:a:0", "-t", String(MAX_SECONDS),
      "-ac", mono ? "1" : "2", "-ar", "44100", "-c:a", "libvorbis", "-q:a", "5",
      "-map_metadata", "-1", "-f", "ogg", out,
    ], 120_000);
    if (code !== 0) {
      const reason = /matches no streams|does not contain any stream/i.test(stderr) ? "The file has no audio track."
        : /Invalid data|could not find codec|not in whitelist|Unknown input format|Error opening input/i.test(stderr) ? "Not an audio or video file ffmpeg can read."
        : stderr.trim().split("\n").slice(-1)[0] || `ffmpeg exited with ${code}`;
      return Response.json({ error: reason }, { status: 422 });
    }
    const ogg = await readFile(out);
    // Ogg pages carry the granule position (samples) — the last page gives the duration.
    const duration = oggDuration(ogg, 44100);
    return new Response(new Uint8Array(ogg), { headers: { "content-type": "audio/ogg", "x-duration": duration.toFixed(2), "cache-control": "no-store" } });
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
    return Response.json({ error: missing ? "ffmpeg isn't installed on the server — sounds can't be converted." : (e as Error).message }, { status: 500 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Seconds of an Ogg stream: granule position of its last page / sample rate. */
function oggDuration(buf: Buffer, rate: number): number {
  for (let i = buf.length - 4; i >= 0; i--) {
    if (buf[i] === 0x4f && buf[i + 1] === 0x67 && buf[i + 2] === 0x67 && buf[i + 3] === 0x53 && i + 14 <= buf.length) {
      const granule = Number(buf.readBigInt64LE(i + 6));
      return granule > 0 ? granule / rate : 0;
    }
  }
  return 0;
}
