"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Play, Square, Wrench, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aiClientLabel, enabledAiClients, setAiPreferred, useAiSettings, type AiClientId } from "@/lib/aiSettings";
import { clearAgentRun, startAgentRun, stopAgentRun, useAgentRun } from "@/lib/ai/modelAgent";

const EXAMPLES = [
  "Ein Höllenhund: vierbeinig, dunkelrot mit glühenden Augen und Lava-Rissen, feindlich, 30 Leben, schnell",
  "A friendly mushroom creature, small and round, red cap with white dots, wanders in forests",
  "Stone golem with a humanoid rig, grey with moss, slow but hits hard, 40 health, hostile",
];

/** Tool names the agent calls (mcp/server.mjs) → what the user sees in the log. */
const TOOL_LABELS: Record<string, string> = {
  get_guide: "Reading the modeling guide", get_status: "Checking the editor", create_model: "Creating the model",
  add_bones: "Adding bones", add_cubes: "Adding cubes", edit_element: "Adjusting parts", move_bone: "Moving a bone",
  mirror_element: "Mirroring parts", delete_elements: "Removing parts", pack_uv: "Packing the texture layout",
  paint_cubes: "Painting", paint_texture: "Painting the texture", paint_face: "Painting details",
  create_animation: "Creating an animation", add_keyframes: "Animating", generate_animation: "Generating an animation",
  set_entity_settings: "Setting mob stats", screenshot: "Looking at the result", set_view: "Turning the camera",
  open_element: "Opening the model", get_model: "Inspecting the model", update_element: "Updating", create_element: "Creating an element",
};

/**
 * Entity Model Generator tab: describe a mob in words; Claude Code or Codex (Settings → AI) then
 * builds it live in the editor through the project's MCP tools — model, texture, animations and
 * mob settings, every step undoable. The run lives in lib/ai/modelAgent, so it keeps going while
 * the editor shows the model being built.
 */
export default function EntityModelGeneratorPanel({ activeElement, onOpenModels }: {
  activeElement: { kind: string; id: string } | null;
  onOpenModels: () => void;
}) {
  const settings = useAiSettings();
  const run = useAgentRun();
  const [prompt, setPrompt] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const clients = enabledAiClients(settings).filter((c): c is "claude" | "codex" => c === "claude" || c === "codex");
  const preferred = settings.preferred;
  const provider: AiClientId | undefined = clients.includes(preferred as "claude") ? preferred as AiClientId : clients[0];

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [run.log.length]);

  const start = () => {
    if (!provider || provider === "ollama" || !prompt.trim()) return;
    startAgentRun({ provider, model: settings.clients[provider].model, prompt: prompt.trim(), context: { activeElement } });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--workspace)]" data-testid="model-generator">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 overflow-hidden p-4 text-sm">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold"><Bot className="h-5 w-5 text-primary" />Entity Model Generator</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Describe a mob — the AI builds it live in the editor: 3D model, texture, animations and stats. Every step can be undone
            (Ctrl+Z), and you can watch it work. Uses the Claude Code / Codex login on the machine running the dev server.
          </p>
        </div>

        {clients.length === 0 ? (
          <div className="flex items-start gap-2 rounded-sm border border-input bg-card p-3 text-xs">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Enable <b>Claude Code</b> or <b>Codex</b> under <b>Settings → AI</b> (gear at the bottom of the sidebar). Ollama can&apos;t drive the editor — it has no tool support here.</span>
          </div>
        ) : (
          <>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) start(); }}
              disabled={run.running}
              rows={4}
              placeholder="z.B. Ein Höllenhund mit glühenden Augen und Lava-Rissen, feindlich, 30 Leben…"
              className="w-full resize-y rounded-sm border border-input bg-card px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={run.running}
                  onClick={() => setPrompt(ex)}
                  className="max-w-full truncate rounded-sm border border-input px-2 py-0.5 text-[11px] text-muted-foreground hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
                  title={ex}
                >
                  {ex.length > 60 ? `${ex.slice(0, 60)}…` : ex}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {clients.length > 1 && (
                <select
                  aria-label="AI client"
                  value={provider}
                  disabled={run.running}
                  onChange={(e) => setAiPreferred(e.target.value as AiClientId)}
                  className="h-8 rounded-sm border border-input bg-background px-2 text-xs"
                >
                  {clients.map((c) => <option key={c} value={c}>{aiClientLabel(c)}</option>)}
                </select>
              )}
              {run.running ? (
                <Button size="sm" variant="destructive" className="h-8 gap-1.5" onClick={stopAgentRun}>
                  <Square className="h-3.5 w-3.5" /> Stop
                </Button>
              ) : (
                <Button size="sm" className="h-8 gap-1.5" disabled={!prompt.trim()} onClick={start}>
                  <Play className="h-3.5 w-3.5" /> Generate with {provider ? aiClientLabel(provider) : "AI"}
                </Button>
              )}
              <span className="text-[11px] text-muted-foreground">Ctrl+Enter</span>
              {!run.running && run.log.length > 0 && (
                <button type="button" onClick={clearAgentRun} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">Clear log</button>
              )}
            </div>
          </>
        )}

        {(run.running || run.log.length > 0) && (
          <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-input bg-card p-2 font-mono text-[11px]" data-testid="model-generator-log">
            {run.log.map((l, i) => (
              <div key={i} className="flex items-start gap-1.5 py-0.5">
                {l.kind === "tool" ? <Wrench className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  : l.kind === "error" ? <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                  : <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />}
                <span className={`min-w-0 whitespace-pre-wrap break-words ${l.kind === "error" ? "text-destructive" : l.kind === "text" ? "text-foreground" : "text-muted-foreground"}`}>
                  {l.kind === "tool" ? (TOOL_LABELS[l.text] ?? l.text) : l.text}
                  {l.kind === "tool" && l.detail && l.detail !== "{}" && <span className="opacity-60"> {l.detail}</span>}
                </span>
              </div>
            ))}
            {run.running && (
              <div className="flex items-center gap-1.5 py-0.5 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {run.port ? "Working… (the editor switches to the model while it's being built)" : "Starting…"}
              </div>
            )}
            {run.result && (
              <div className={`mt-1 flex items-start gap-1.5 border-t border-input pt-1.5 ${run.result.ok ? "text-foreground" : "text-destructive"}`}>
                {run.result.ok ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-600 dark:text-green-400" /> : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
                <span className="whitespace-pre-wrap break-words">{run.result.text || (run.result.ok ? "Done." : "Failed.")}</span>
              </div>
            )}
          </div>
        )}
        {run.result?.ok && (
          <Button variant="secondary" size="sm" className="h-8 w-fit" onClick={onOpenModels}>Show Entity Models</Button>
        )}
      </div>
    </div>
  );
}
