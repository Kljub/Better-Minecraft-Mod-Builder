import { spawn, type ChildProcess } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { createServer } from "net";
import { tmpdir } from "os";
import { join } from "path";
import { childEnv, guardRequest } from "../cli";
import { registerAgentPort, unregisterAgentPort } from "@/lib/ai/bridgePorts";
import { currentUser } from "@/lib/server/auth";
import { finishAiRun, startAiRun } from "@/lib/server/modelDataset";
import { recordChatTurn } from "@/lib/server/chatDataset";
import { accountQueue, claudeQuota, isLimitError, markLimited, openAccount, recordQuota, type Quota, type RunAccount } from "@/lib/server/aiAccounts";

/**
 * Entity Model Generator backend: runs Claude Code or Codex headless as an agent that builds in
 * the open editor through the project's own MCP server (mcp/server.mjs). That server gets a free
 * port of its own (never 8790, which a user's interactive AI client may hold); the page connects
 * a second bridge to it for the run. Progress streams back as NDJSON lines:
 *   {type:"start",port} {type:"tool",name,detail} {type:"text",text} {type:"done",ok,text}
 * The agent can only use the mc-designer tools: claude gets `--tools ""` (no built-in tools),
 * codex runs in its read-only sandbox in an empty temp dir. The prompt goes in on stdin, never
 * through a shell.
 */
const MCP_SERVER = join(process.cwd(), "mcp", "server.mjs");
const TIMEOUT_MS = 15 * 60_000;
let running: ChildProcess | null = null;

const MAX_IMAGE_B64 = Math.ceil((5 * 1024 * 1024 * 4) / 3);
const MAX_TOTAL_B64 = Math.ceil((24 * 1024 * 1024 * 4) / 3);
const MAX_IMAGES = 16;

const SYSTEM = [
  "You are building Minecraft mod content inside the MC Screen Designer web editor, which is open in the user's browser.",
  "Work ONLY through the mc-designer MCP tools. Call get_guide first and follow its conventions.",
  "For a creature/mob request: create a new entity model element (create_model with a fitting template), shape it from bones and cubes,",
  "pack the UVs, paint a texture that matches the description, add idle/walk/attack animations as appropriate, set its entity settings",
  "(health, speed, damage, hostile or not, spawning), then take a screenshot to check your work and fix what looks wrong.",
  "Animation sign: in this editor rotation +X swings a hanging arm FORWARD (opposite of vanilla Java's xRot and of Bedrock files) —",
  "attacks and raised arms use POSITIVE X. Read the \"motion\" field add_keyframes returns and fix any limb that moves the wrong way.",
  "Held items (weapons, tools, staffs, shields): build the item as its own bone, then ALWAYS call hold_item(model, item, hand, direction) —",
  "it puts the grip exactly into the hand and parents the item to the arm. Never position held items yourself; check the result in a side screenshot.",
  "Every tool call is one undo step for the user. Finish with a short summary of what you built, in the user's language.",
].join(" ");

/** Codex Chat (editor header): a general assistant for the whole editor, not just mobs. */
const CHAT_SYSTEM = [
  "You are the built-in assistant of MC Screen Designer, a web editor for Minecraft mods, open in the user's browser.",
  "You can use every feature of the editor through the mc-designer MCP tools — and ONLY those: get_status / list_element_kinds / list_elements to look",
  "at the project; list_collections / describe_collection / create_record / update_record for the BUILT-IN categories (items, blocks, armor,",
  "creative tabs, custom attributes, effects, potions, achievements, recipes, trades, loot, biomes, dimensions); create_element / update_element /",
  "open_element for the generic element kinds (enchantments, damage types, commands, fluids, structures, … — see list_element_kinds), and the entity model tools (create_model, add_bones, add_cubes, hold_item, paint_*, animations,",
  "set_entity_settings, screenshot), and generate_image to draw pictures (textures, icons, concept art …) — those are shown to the user,",
  "who decides whether to add them to the Resources (folder \"KI\"); never say an image was added yourself.",
  "Items and blocks need a texture: draw one with generate_item_skin(prompt, assign_to {collection, id}) — the editor's Item Skin Generator,",
  "made for 16×16 Minecraft textures (mode block for blocks) — or pick a fitting existing one (list_textures, then update_record texture).",
  "A drawn texture becomes the record's texture once the user adds it. Never leave a new item/block without a texture.",
  "For GUI/menu backgrounds use generate_gui_texture (the Screen GUI Generator).",
  "You have no access to the editor's source code or to files — never try to read or change code.",
  "Answer questions about the project and how to do things in the editor; when the user asks for changes, make them with the tools (call",
  "list_element_kinds first to learn a kind's fields, get_guide before modelling mobs). Every tool call is one undo step for the user.",
  "Reply in the user's language, short and concrete. The conversation so far is included above the latest message.",
].join(" ");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

const short = (v: unknown, n = 120) => {
  const s = typeof v === "string" ? v : JSON.stringify(v ?? "");
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

export async function POST(request: Request) {
  const refused = guardRequest(request);
  if (refused) return refused;
  let body: { provider?: unknown; model?: unknown; prompt?: unknown; context?: unknown; image?: unknown; images?: unknown; mode?: unknown; history?: unknown; conversationId?: unknown; projectKey?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const provider = body.provider;
  if (provider !== "claude" && provider !== "codex") {
    return Response.json({ error: "Only Claude Code and Codex can drive the editor (they support MCP tools)." }, { status: 400 });
  }
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (model && !/^[\w.:/[\]][\w.:/\-[\]]{0,127}$/.test(model)) return Response.json({ error: "Invalid model name" }, { status: 400 });
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
  const chat = body.mode === "chat";
  const system = chat ? CHAT_SYSTEM : SYSTEM;
  // Chat: earlier turns (user + assistant text) go in front of the new message — each run is fresh.
  const turns = chat && Array.isArray(body.history)
    ? body.history.slice(-20).flatMap((h) => {
        const r = (h ?? {}) as { role?: unknown; text?: unknown };
        return (r.role === "user" || r.role === "assistant") && typeof r.text === "string" && r.text.trim()
          ? [{ role: r.role as "user" | "assistant", content: r.text.trim().slice(0, 4000) }] : [];
      })
    : [];
  const history = turns.map((t) => `${t.role === "user" ? "User" : "You"}: ${t.content}`);
  // Chat turns are kept as training data (lib/server/chatDataset) under this conversation id.
  const conversationId = chat && typeof body.conversationId === "string" && /^[\w-]{1,64}$/.test(body.conversationId) ? body.conversationId : null;
  const projectKey = typeof body.projectKey === "string" ? body.projectKey.slice(0, 128) : null;
  const transcript = history.length ? `Conversation so far:\n${history.join("\n\n")}\n\n---\nLatest message from the user:\n` : "";
  if (!prompt) return Response.json({ error: "Empty prompt" }, { status: 400 });
  if (running) return Response.json({ error: "A generator run is already in progress." }, { status: 409 });

  // Optional reference images (drawings, photos, concept art, renders of an uploaded mesh), each
  // labelled with the view it shows (front, side, back…). `image` is the older single-image form.
  const rawImages: unknown[] = Array.isArray(body.images) ? body.images : body.image != null ? [{ data: body.image, view: "" }] : [];
  if (rawImages.length > MAX_IMAGES) return Response.json({ error: `At most ${MAX_IMAGES} reference images` }, { status: 400 });
  const images: { mediaType: string; data: string; ext: string; view: string }[] = [];
  for (const raw of rawImages) {
    const r = (raw ?? {}) as { data?: unknown; view?: unknown };
    const m = typeof r.data === "string" ? /^data:(image\/(png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(r.data) : null;
    if (!m) return Response.json({ error: "Reference images must be PNG, JPEG, WebP or GIF" }, { status: 400 });
    if (m[3].length > MAX_IMAGE_B64) return Response.json({ error: "A reference image is too large (max 5 MB)" }, { status: 400 });
    const view = typeof r.view === "string" ? r.view.replace(/[^\w ()/+.,-]/g, "").trim().slice(0, 80) : "";
    images.push({ mediaType: m[1], data: m[3], ext: m[2] === "jpeg" ? "jpg" : m[2], view });
  }
  if (images.reduce((n, i) => n + i.data.length, 0) > MAX_TOTAL_B64) return Response.json({ error: "Reference images are too large together (max 24 MB)" }, { status: 400 });
  const imageLabel = (i: number) => `Image ${i + 1}${images[i].view ? ` — ${images[i].view}` : ""}`;
  const imageList = images.length === 1 && !images[0].view
    ? "A reference image is attached."
    : `${images.length} reference images are attached, in this order:\n${images.map((_, i) => `- ${imageLabel(i)}`).join("\n")}\n` +
      "They show the same subject from different views (front = what faces north/-Z in the editor; in a front view the subject's right side is on the image's left).";
  // The images are the main spec when given — make the agent study them first and check against them.
  const imageNote = images.length === 0 ? "" : `\n\n${imageList}\n` + [
    "The reference is the main specification — the result must clearly look like it. Before calling any build tool:",
    "1. Study the image(s) and write a short inventory: every distinct part (head, horns, wings, each leg, tail, weapon, armour pieces…),",
    "   its rough size relative to the body (e.g. wings ≈ 1.5× body height), where it attaches, and the main colours with hex values.",
    "2. Turn that into a bone/cube plan in pixels (the overall height from the request or a sensible mob size) and build it.",
    "3. Then take screenshots from the same view(s) as the reference images and compare side by side: silhouette, proportions,",
    "   part count and colours. Fix every clear difference and compare again (at least one correction round).",
    "Translate the look into Minecraft's blocky cube style, but keep every recognisable feature.",
  ].join("\n");

  const ctx = (body.context ?? {}) as { activeElement?: { kind?: string; id?: string } | null; referenceModel?: { name?: unknown; summary?: unknown; kind?: unknown } };
  const reference = ctx.referenceModel && typeof ctx.referenceModel.summary === "string" && ctx.referenceModel.kind === "mesh"
    ? `\n\nReference 3D mesh "${String(ctx.referenceModel.name ?? "reference").slice(0, 80)}" (an STL/OBJ/GLB/3MF file the user uploaded), converted into a voxel approximation in the mc-designer coordinates — boxes with from/size in pixels, scaled so the longest side is 32 px, standing on Y=0 and facing north (-Z):\n${ctx.referenceModel.summary.slice(0, 60_000)}\n` +
      "Rebuild its shape as a clean Minecraft-style entity model: group it into sensible bones (body, head, legs, arms, tail…) with pivots at the joints, and merge the voxel boxes into far fewer, larger cubes — the voxels are a measurement, not cubes to copy one by one. Rescale if the request asks for a different size. Renders of the mesh are among the attached images."
    : ctx.referenceModel && typeof ctx.referenceModel.summary === "string"
    ? `\n\nReference model "${String(ctx.referenceModel.name ?? "reference").slice(0, 80)}" (an existing .bbmodel / GeckoLib model, in the same coordinates as the mc-designer tools — pivots and cube from/size in pixels):\n${ctx.referenceModel.summary.slice(0, 60_000)}\n` +
      "Use it as orientation or starting point: keep its proportions and bone layout where the request doesn't say otherwise; you may rebuild it closely with add_bones/add_cubes and then adapt it."
    : "";
  const active = (ctx.activeElement?.kind && ctx.activeElement.id
    ? `\n(Currently open in the editor: ${ctx.activeElement.kind} "${ctx.activeElement.id}" — edit it only if the request refers to it.)`
    : "") + reference;
  const port = await freePort();
  const dir = await mkdtemp(join(tmpdir(), "mc-ui-agent-"));
  const mcpEnv = { MC_DESIGNER_MCP_PORT: String(port) };

  let args: string[];
  let stdin: string;
  if (provider === "claude") {
    const mcpConfig = JSON.stringify({ mcpServers: { "mc-designer": { command: "node", args: [MCP_SERVER], env: mcpEnv } } });
    args = [
      // No user/project settings: the user's own hooks, plugins and style instructions (e.g. a
      // terse "caveman" mode) must not leak into the product's agent. Login is unaffected.
      "-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence", "--setting-sources", "",
      "--mcp-config", mcpConfig, "--strict-mcp-config", "--allowedTools", "mcp__mc-designer", "--tools", "",
      "--append-system-prompt", system,
    ];
    if (model) args.push("--model", model);
    stdin = transcript + prompt + active + imageNote;
    if (images.length) {
      // Images go in as user message content blocks (stream-json input), each after its label.
      args.push("--input-format", "stream-json");
      stdin = JSON.stringify({ type: "user", message: { role: "user", content: [
        ...images.flatMap((img, i) => [
          ...(images.length > 1 || img.view ? [{ type: "text", text: `${imageLabel(i)}:` }] : []),
          { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } },
        ]),
        { type: "text", text: stdin },
      ] } }) + "\n";
    }
  } else {
    args = [
      // --ignore-user-config: same isolation for codex (its login still comes from CODEX_HOME).
      "exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "--color", "never", "--ignore-user-config",
      "-c", 'mcp_servers.mc-designer.command="node"',
      "-c", `mcp_servers.mc-designer.args=[${JSON.stringify(MCP_SERVER)}]`,
      "-c", `mcp_servers.mc-designer.env={MC_DESIGNER_MCP_PORT="${port}"}`,
      // Only this server's tools are pre-approved (nobody can click "approve" in a headless run);
      // shell/file approvals and the read-only sandbox are unchanged.
      "-c", 'mcp_servers.mc-designer.default_tools_approval_mode="approve"',
      // generate_image runs ~40 s per picture — above codex's 60 s default per MCP call.
      "-c", "mcp_servers.mc-designer.tool_timeout_sec=300",
      "-c", 'approval_policy="never"',
    ];
    if (model) args.push("-m", model);
    for (const [i, img] of images.entries()) {
      const file = join(dir, `reference-${i + 1}.${img.ext}`);
      await writeFile(file, Buffer.from(img.data, "base64"));
      args.push("-i", file);
    }
    args.push("-");
    stdin = `${system}\n\n---\n\n${transcript}${prompt}${active}${imageNote}`;
  }

  // Linked accounts (Settings → AI): queue order, free quota first; empty = the host's own login.
  const user = await currentUser(request).catch(() => null);
  const queue = user ? await accountQueue(user.id, provider) : [];
  // Training data: prompt → the models this run builds (lib/server/modelDataset.ts).
  const runId = user ? await startAiRun(user.id, provider, prompt, queue[0]?.label ?? null).catch(() => null) : null;
  const toolLog: { name: string; input: unknown }[] = [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let aborted = false;
      let lastText = "";
      const emit = (ev: Record<string, unknown>) => {
        if (ev.type === "text" && typeof ev.text === "string") lastText = ev.text;
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      };
      const timer = setTimeout(() => { emit({ type: "text", text: "Time limit reached — stopping." }); running?.kill("SIGTERM"); }, TIMEOUT_MS);
      registerAgentPort(port);
      emit({ type: "start", port });

      const end = (ok: boolean, text: string) => {
        if (runId != null && user) void finishAiRun(runId, user.id, { ok, resultText: text, tools: toolLog }).catch(() => {});
        if (conversationId) {
          void recordChatTurn(user?.id ?? null, {
            conversationId, provider, projectKey, runId,
            messages: [...turns, { role: "user", content: prompt }, { role: "assistant", content: text.trim() || lastText }],
            tools: toolLog, ok,
          }).catch((e) => console.error("recording chat turn failed", e));
        }
        clearTimeout(timer);
        running = null;
        unregisterAgentPort(port);
        emit({ type: "done", ok, text });
        if (!closed) { closed = true; controller.close(); }
        rm(dir, { recursive: true, force: true }).catch(() => {});
      };

      /** One run with queue[index] (or the host login). Retries with the next account when this one
       * is out of quota before it did anything. */
      const attempt = async (index: number) => {
        const row = queue[index];
        let account: RunAccount | undefined;
        try {
          account = row && user ? await openAccount(user.id, row) : undefined;
        } catch (e) {
          end(false, `Couldn't open account "${row?.label}": ${(e as Error).message}`);
          return;
        }
        if (account) emit({ type: "info", text: `Using ${provider} account "${account.label}"` });
        const runArgs = account && provider === "codex" ? args.filter((a) => a !== "--ephemeral") : args;
        const child = spawn(provider, runArgs, { cwd: dir, env: { ...childEnv(), MCP_TOOL_TIMEOUT: "300000", ...account?.env }, stdio: ["pipe", "pipe", "pipe"] });
        running = child;
        let finalText = "";
        let ok = false;
        let stderr = "";
        let buf = "";
        let toolCalls = 0;
        let quota: Quota | null = null;

        const onLine = (line: string) => {
          let d: Record<string, unknown>;
          try { d = JSON.parse(line); } catch { return; }
          if (provider === "claude") {
            const msg = d.message as { content?: { type: string; name?: string; input?: unknown; text?: string }[] } | undefined;
            if (d.type === "assistant") {
              for (const c of msg?.content ?? []) {
                if (c.type === "tool_use") { toolCalls++; toolLog.push({ name: String(c.name).replace(/^mcp__mc-designer__/, ""), input: c.input }); emit({ type: "tool", name: String(c.name).replace(/^mcp__mc-designer__/, ""), detail: short(c.input) }); }
                else if (c.type === "text" && c.text?.trim()) emit({ type: "text", text: c.text.trim() });
              }
            } else if (d.type === "result") {
              ok = d.subtype === "success" && !d.is_error;
              finalText = typeof d.result === "string" ? d.result : "";
            } else if (d.type === "rate_limit_event" && d.rate_limit_info) {
              quota = claudeQuota(d.rate_limit_info as Parameters<typeof claudeQuota>[0]);
            }
          } else {
            const item = d.item as { type?: string; tool?: string; arguments?: unknown; text?: string } | undefined;
            if (d.type === "item.started" && item?.type === "mcp_tool_call") { toolCalls++; toolLog.push({ name: String(item.tool), input: item.arguments }); emit({ type: "tool", name: item.tool, detail: short(item.arguments) }); }
            else if (d.type === "item.completed" && item?.type === "agent_message" && item.text) { finalText = item.text; emit({ type: "text", text: item.text }); }
            else if (d.type === "turn.completed") ok = true;
            else if (d.type === "turn.failed" || d.type === "error") { finalText = short(d.error ?? d.message ?? d, 300); emit({ type: "text", text: finalText }); }
          }
        };
        child.stdout!.on("data", (chunk) => {
          buf += chunk;
          let i;
          while ((i = buf.indexOf("\n")) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
        });
        child.stderr!.on("data", (c) => { stderr = (stderr + c).slice(-4000); });
        let settled = false;
        const settle = async (extra?: string) => {
          if (settled) return;
          settled = true;
          const text = finalText || extra || (ok ? "" : stderr.trim().split("\n").slice(-3).join("\n"));
          const q = quota as Quota | null;
          if (account) {
            if (q) await recordQuota(account.id, q).catch(() => {});
            const limited = !ok && ((q && q.status === "limited") || isLimitError(text));
            if (limited && !q) await markLimited(account.id).catch(() => {});
            await account.finish().catch(() => {});
            if (limited && !aborted && toolCalls === 0 && index + 1 < queue.length) {
              emit({ type: "info", text: `"${account.label}" is at its usage limit — switching to the next account.` });
              void attempt(index + 1);
              return;
            }
          }
          end(ok, text);
        };
        child.on("error", (e) => void settle(`Could not start ${provider}: ${e.message}`));
        child.on("close", () => void settle());
        child.stdin!.end(stdin);
      };

      // Browser pressed Stop or closed the tab → end the agent (and with it its MCP server).
      request.signal.addEventListener("abort", () => { aborted = true; closed = true; running?.kill("SIGTERM"); });
      void attempt(0);
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
