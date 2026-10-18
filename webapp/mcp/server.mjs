#!/usr/bin/env node
/**
 * MC Screen Designer MCP server — lets an AI client (Claude Code, Claude Desktop, Cursor, …) work
 * in the designer that's open in your browser: build entity models, paint textures, animate,
 * set mob stats, create other mod elements, and look at screenshots of its own work.
 *
 *   AI client ──stdio (MCP)──▶ this process ──HTTP 127.0.0.1:8790──▶ editor tab in the browser
 *
 * The editor tab long-polls GET /poll for commands and POSTs results to /result — enable it with
 * the "AI bridge" switch in the editor's status bar. Every command is one undoable edit there.
 *
 * Setup (Claude Code):  claude mcp add mc-designer -- node /absolute/path/to/webapp/mcp/server.mjs
 * Port: MC_DESIGNER_MCP_PORT (default 8790) — must match the editor's bridge setting.
 */
import http from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const PORT = Number(process.env.MC_DESIGNER_MCP_PORT || 8790);
const POLL_HOLD_MS = 25_000;
const CALL_TIMEOUT_MS = 60_000;
const log = (...a) => process.stderr.write(`[mc-designer-mcp] ${a.join(" ")}\n`);

// ── bridge ──────────────────────────────────────────────────────────────────────

/** commands waiting for the editor */
const queue = [];
/** id -> {resolve, reject, timer} */
const pending = new Map();
/** parked long-poll responses */
const waiters = [];
let lastSeen = 0;
let editorInfo = null;

const connected = () => Date.now() - lastSeen < POLL_HOLD_MS + 10_000;

function deliver() {
  while (queue.length && waiters.length) {
    const res = waiters.shift();
    if (res.writableEnded) continue;
    send(res, 200, queue.shift());
  }
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", ...cors(res.req) });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

/** Only browser pages on this machine / LAN dev servers may talk to the bridge. */
function cors(req) {
  const origin = req?.headers?.origin;
  const ok = origin && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin);
  return ok ? { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, OPTIONS", vary: "origin" } : {};
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 32 * 1024 * 1024) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "OPTIONS") return send(res, 204);
  // Refuse cross-site pages that aren't local (no CORS header = browser blocks the response,
  // and we also refuse to act on their requests).
  if (req.headers.origin && !cors(req)["access-control-allow-origin"]) return send(res, 403, { error: "origin not allowed" });
  try {
    if (req.method === "GET" && url.pathname === "/ping") return send(res, 200, { ok: true, name: "mc-designer-mcp", connected: connected() });
    if (req.method === "GET" && url.pathname === "/poll") {
      lastSeen = Date.now();
      if (url.searchParams.get("info")) {
        try { editorInfo = JSON.parse(url.searchParams.get("info")); } catch { /* ignore */ }
      }
      if (queue.length) return send(res, 200, queue.shift());
      waiters.push(res);
      const t = setTimeout(() => {
        const i = waiters.indexOf(res);
        if (i >= 0) waiters.splice(i, 1);
        if (!res.writableEnded) send(res, 204);
      }, POLL_HOLD_MS);
      res.on("close", () => { clearTimeout(t); const i = waiters.indexOf(res); if (i >= 0) waiters.splice(i, 1); });
      return;
    }
    if (req.method === "POST" && url.pathname === "/result") {
      lastSeen = Date.now();
      const msg = JSON.parse(await readBody(req));
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.ok) p.resolve(msg.result);
        else p.reject(new Error(msg.error || "editor reported an error"));
      }
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, 500, { error: String(err?.message || err) });
  }
});

httpServer.on("error", (err) => log(`bridge failed on 127.0.0.1:${PORT}: ${err.message}`));
httpServer.listen(PORT, "127.0.0.1", () => log(`bridge listening on http://127.0.0.1:${PORT}`));

/** Runs a tool in the editor tab and resolves with its result. */
function callEditor(tool, args) {
  if (!connected()) {
    return Promise.reject(new Error(
      "The MC Screen Designer editor isn't connected. Open the project in the browser and switch on \"AI bridge\" in the editor's status bar (bottom right).",
    ));
  }
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Editor didn't answer "${tool}" within ${CALL_TIMEOUT_MS / 1000}s.`)); }, CALL_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    queue.push({ id, tool, args: args ?? {} });
    deliver();
  });
}

// ── MCP tools ───────────────────────────────────────────────────────────────────

const server = new McpServer({ name: "mc-designer", version: "1.0.0" }, {
  instructions: [
    "You control MC Screen Designer, a Minecraft mod editor (NeoForge 1.21.1 / 26.x + Bedrock add-ons) open in the user's browser.",
    "Entity models use Blockbench conventions: 1 unit = 1 pixel = 1/16 block, +Y up, absolute coordinates, the mob faces north (-Z); bones pivot at `pivot`, cubes span from..from+size.",
    "Workflow for a mob: create_model → add_bones/add_cubes (bulk) → pack_uv → paint_cubes → screenshot (check it!) → add animations (create_animation + add_keyframes, or generate_animation) → set_entity_settings.",
    "Always look at a screenshot after building or changing geometry, and fix what looks wrong. Call get_guide for detailed playbooks.",
    "Held weapons/tools/staffs/shields: build them as their own bone, then ALWAYS call hold_item to put them in the hand (it computes hand + grip and parents the item to the arm) — never place them by hand.",
  ].join("\n"),
});

// Fixed-length arrays, not z.tuple: tuple schemas (array-form "items") are rejected by OpenAI's
// function-schema format, so Codex silently drops every tool that uses one.
const vec3 = z.array(z.number()).length(3);
const text = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const fail = (err) => ({ content: [{ type: "text", text: `Error: ${err?.message || err}` }], isError: true });

/** Registers a tool that simply forwards its arguments to the editor. */
function forward(name, description, inputSchema, annotations = {}) {
  server.registerTool(name, { description, inputSchema, annotations }, async (args) => {
    try { return text(await callEditor(name, args)); } catch (err) { return fail(err); }
  });
}

server.registerTool("get_guide", {
  description: "Playbooks for modeling, texturing, animating and configuring Minecraft mobs in this editor. Read before a bigger task.",
  inputSchema: { topic: z.enum(["modeling", "texturing", "animation", "mob_settings", "elements"]).optional() },
  annotations: { readOnlyHint: true },
}, async ({ topic }) => text(GUIDES[topic ?? "modeling"]));

forward("get_status", "Editor connection, project, Minecraft version, what is open, and how many elements each category has.", {}, { readOnlyHint: true });

forward("list_elements", "List the project's elements of one kind (or all). Kinds: entityModel, damageType, enchantment, bannerPattern, painting, function, feature, and any other kind get_status lists.", {
  kind: z.string().optional(),
}, { readOnlyHint: true });

forward("list_element_kinds", "All element kinds with their editable fields (key, type, options) — use with create_element / update_element.", {}, { readOnlyHint: true });

forward("create_element", "Create a generic element (enchantment, damage type, painting, …) with initial field values. Returns its id. For mobs use create_model.", {
  kind: z.string(), id: z.string().regex(/^[a-z0-9_./-]+$/).describe("registry path, lowercase"), fields: z.record(z.string(), z.unknown()).optional(),
});

forward("update_element", "Change fields of a generic element (see list_element_kinds for the keys).", {
  kind: z.string(), id: z.string(), fields: z.record(z.string(), z.unknown()),
});

forward("open_element", "Open an element in the editor so the user sees it.", { kind: z.string(), id: z.string() });

// Entity models
forward("create_model", "Create a new entity model (mob) and open it. Starts empty unless template is given.", {
  id: z.string().regex(/^[a-z0-9_]+$/).describe("registry path, e.g. rail_gnawer"),
  texture_width: z.number().int().positive().optional(), texture_height: z.number().int().positive().optional(),
  template: z.enum(["empty", "humanoid", "quadruped"]).optional().describe("start from a vanilla-like rig"),
});

forward("get_model", "Full model: bones (name, parent, pivot, rotation), cubes (name, bone, from, size, pivot, rotation, uv, inflate, mirror), texture size, animations.", {
  model: z.string(),
}, { readOnlyHint: true });

forward("add_bones", "Add several bones at once. Parents must exist or come earlier in the list.", {
  model: z.string(),
  bones: z.array(z.object({ name: z.string(), parent: z.string().optional(), pivot: vec3.optional(), rotation: vec3.optional() })).min(1),
});

forward("add_cubes", "Add several cubes at once (preferred over one-by-one). Coordinates in pixels: from = min corner, size = [x,y,z].", {
  model: z.string(),
  cubes: z.array(z.object({
    name: z.string().optional(), bone: z.string().describe("bone name"),
    from: vec3, size: vec3,
    pivot: vec3.optional().describe("rotation pivot, defaults to the cube centre"), rotation: vec3.optional(),
    uv: z.array(z.number()).length(2).optional().describe("box-UV offset; omit and call pack_uv"),
    inflate: z.number().optional(), mirror: z.boolean().optional(),
  })).min(1),
});

forward("edit_element", "Change a bone or cube (by name or id; prefix bone:/cube: when a bone and a cube share a name — plain names pick the cube here). Cube fields: name, bone, from, size, pivot, rotation, uv, inflate, mirror. Bone fields: name, parent, pivot, rotation (moving a bone's pivot does not move its cubes; use move_bone for that).", {
  model: z.string(), target: z.string(), changes: z.record(z.string(), z.unknown()),
});

forward("move_bone", "Move a bone with all its child bones and cubes by an offset in pixels.", { model: z.string(), bone: z.string(), offset: vec3 });
forward("hold_item", "Put a held item (weapon, tool, staff, shield…) into a hand: computes the hand from the arm's cube and the grip from the item's handle (its longest thin cube), turns the item in 90° steps so its head points `direction`, moves it so the hand closes around the grip, sets the item bone's pivot to the hand and parents it to the arm. ALWAYS use this for held items instead of placing them by hand.", {
  model: z.string(), item: z.string().describe("the item's bone (all its cubes and child bones move with it)"),
  hand: z.string().describe("the arm / forearm / hand bone that holds it"),
  direction: z.enum(["keep", "forward", "up", "down"]).optional().describe("where the head/blade points with the arm hanging: forward (-Z) for swords/axes/maces, up for staffs/spears/halberds; default keep"),
  grip: z.number().min(0).max(1).optional().describe("where along the handle the hand holds it, 0 = pommel end, 1 = head end; default 0.2 (short) / 0.35 (long)"),
});

forward("delete_elements", "Delete bones (with everything inside) and/or cubes by name or id (a bone wins over a same-named cube; prefix cube: to delete just the cube).", { model: z.string(), targets: z.array(z.string()).min(1) });

forward("mirror_element", "Duplicate a bone (with children) or cube (prefix cube:) mirrored across X=0 — e.g. build the left leg, mirror to get the right one. Names: left↔right swapped, else suffix _mirror.", {
  model: z.string(), target: z.string(),
});

forward("pack_uv", "Lay out every cube's box UV without overlaps and set a fitting texture size (power of two). Call after building geometry, before painting.", { model: z.string() });

forward("paint_cubes", "Create/repaint the model texture: fills each cube's UV faces with a colour and Minecraft-like shading (lighter top, darker bottom/sides) plus optional pixel noise. Colours per cube or bone name; others use default_color.", {
  model: z.string(),
  default_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  colors: z.record(z.string(), z.string().regex(/^#[0-9a-fA-F]{6}$/)).optional().describe("cube or bone name -> #rrggbb"),
  noise: z.number().min(0).max(1).optional().describe("0 = flat, 0.15 = subtle texture"),
});

forward("paint_texture", "Draw on the model texture in texture pixels: rectangles and single pixels (applied in order).", {
  model: z.string(),
  ops: z.array(z.object({ x: z.number().int(), y: z.number().int(), w: z.number().int().positive().optional(), h: z.number().int().positive().optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/) })).min(1),
});

forward("paint_face", "Fill one face of a cube (north/east/south/west/up/down) on the texture, e.g. eyes on the head's north face via ops relative to the face's top-left.", {
  model: z.string(), cube: z.string(), face: z.enum(["north", "east", "south", "west", "up", "down"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("fill the whole face"),
  ops: z.array(z.object({ x: z.number().int(), y: z.number().int(), w: z.number().int().positive().optional(), h: z.number().int().positive().optional(), color: z.string() })).optional().describe("pixels relative to the face"),
});

forward("create_animation", "Create (or replace) an animation on the model.", {
  model: z.string(), name: z.string().regex(/^[a-z0-9_]+$/), length: z.number().positive(), loop: z.enum(["loop", "once", "hold"]).optional(),
});

forward("add_keyframes", "Add keyframes to an animation. value: rotation in degrees (added to rest pose), position offset in pixels, or scale factor.", {
  model: z.string(), animation: z.string(),
  keyframes: z.array(z.object({
    bone: z.string(), channel: z.enum(["rotation", "position", "scale"]), time: z.number().min(0), value: vec3,
    interpolation: z.enum(["linear", "catmullrom", "step"]).optional(),
  })).min(1),
});

forward("generate_animation", "Generate a base animation from bone names (legs/arms/head/tail/wings/body): walk, idle, attack or fly. Review and refine with add_keyframes.", {
  model: z.string(), kind: z.enum(["walk", "idle", "attack", "fly"]), name: z.string().optional(), speed: z.number().positive().optional(), intensity: z.number().positive().optional(),
});

forward("set_entity_settings", "Mob settings: displayName, behavior (passive|neutral|hostile_melee|stationary), mobCategory, maxHealth, movementSpeed, attackDamage, damageType, armor, knockbackResistance, followRange, hitboxWidth, hitboxHeight, xpReward, fireImmune, spawnEgg, eggPrimary, eggSecondary, naturalSpawn, spawnBiomes, spawnWeight, spawnMin, spawnMax, idleAnimation, walkAnimation, attackAnimation, drops (death loot: [{item, min, max, chance 0–1, lootingBonus, playerKillOnly, smeltWhenOnFire}]), hurtDrops (rolled on every hit: [{item, min, max, chance 0–1, playerOnly}]).", {
  model: z.string(), settings: z.record(z.string(), z.unknown()),
});

forward("set_view", "Point the 3D view: perspective, front, back, left, right, top. Also switches the model editor to the given tab.", {
  view: z.enum(["perspective", "front", "back", "left", "right", "top"]).optional(), tab: z.enum(["design", "animation", "skin", "settings"]).optional(),
  animation: z.string().optional(), time: z.number().min(0).optional().describe("pose the model at this time of `animation`"),
});

server.registerTool("screenshot", {
  description: "Screenshot of the open model's 3D view (optionally from several angles, optionally posed at an animation time). Use it to check your work.",
  inputSchema: {
    views: z.array(z.enum(["perspective", "front", "back", "left", "right", "top"])).optional(),
    animation: z.string().optional(), time: z.number().min(0).optional(),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  try {
    const result = await callEditor("screenshot", args);
    const content = [];
    for (const shot of result.images ?? []) {
      content.push({ type: "text", text: shot.label });
      content.push({ type: "image", data: shot.data.replace(/^data:image\/png;base64,/, ""), mimeType: "image/png" });
    }
    if (!content.length) content.push({ type: "text", text: "No image (is an entity model open?)" });
    return { content };
  } catch (err) { return fail(err); }
});

forward("export_model", "Model as Blockbench .bbmodel, Bedrock/GeckoLib geo.json / animation.json, or Java class source — returned as text.", {
  model: z.string(), format: z.enum(["bbmodel", "geo", "animations", "java", "java_animations"]),
}, { readOnlyHint: true });

const GUIDES = {
  modeling: `MODELING (Blockbench conventions)
- Units: pixels; 16 px = 1 block. Ground at Y=0, model faces north (-Z), so a head's face is its north side.
- Bones: give every movable part a bone with its pivot at the joint (hip, shoulder, neck). Cubes belong to a bone.
- Typical humanoid (64x64): body bone pivot [0,24,0], body cube from [-4,12,-2] size [8,12,4]; head bone pivot [0,24,0] cube from [-4,24,-4] size [8,8,8]; legs pivot [±2,12,0] cubes from [-4,0,-2]/[0,0,-2] size [4,12,4]; arms pivot [±5,22,0].
- Quadruped (cow-like): body bone pivot [0,19,2], body cube rotated 90° X; legs pivot at hip height.
- Build symmetric parts once, then mirror_element. Use add_cubes in bulk.
- After geometry: pack_uv, then paint_cubes, then screenshot from front + perspective and fix issues (gaps, floating parts, z-fighting = overlapping identical faces: offset by 0.01 or inflate).
- Keep cube counts reasonable (Java entity models: dozens, not hundreds).

HELD ITEMS (weapons, tools, staffs, shields, torches…) — ALWAYS gripped in a hand, never floating or stuck to the body:
- Give the item its OWN bone, parented to the arm (or forearm/hand bone) that holds it — so it follows every arm animation. Never parent it to body/root.
- Build the item (own bone + cubes, anywhere), then ALWAYS call hold_item(model, item_bone, arm_bone, direction) — it computes the hand and grip and attaches it exactly. Don't place held items by hand.
- (What hold_item does:) the item bone's pivot is the hand: the centre of the arm cube's lower end, ~1–2 px above the arm's bottom face. Humanoid right arm (the mob's right is +X): arm pivot [5,22,0], arm cube from [4,12,-2] size [4,12,4] → hand ≈ [6,13,0]; left arm mirrored → hand ≈ [-6,13,0].
- The handle/grip cube passes THROUGH the hand: it overlaps the arm cube by at least 2 px and its centre line runs through the hand point. Handle 1–2 px thick.
- Orientation like vanilla held items: with the arm hanging down, one-handed weapons (sword, axe, mace) point FORWARD (-Z) out of the fist — handle along Z, head/blade at the far end; long staffs/spears run vertically through the hand (top above the shoulder, bottom near the ground); a shield sits on the outside of the forearm facing -Z/sideways.
- Two-handed items: parent to the main (right) arm and angle both arms so both hands touch the handle.
- Check: screenshot front AND side (left/right). The hand must visibly close around the grip — any gap between hand and handle, or the item hanging next to/in front of the body, is a bug: move the item bone to the hand.`,
  texturing: `TEXTURING
- pack_uv first (box UV, no overlaps). Then paint_cubes with a palette: default_color + colors per bone/cube name. noise 0.1–0.2 gives a Minecraft-like grain.
- Details: paint_face on a cube face (pixels relative to the face, x→right, y→down as seen from outside), e.g. eyes on the head's north face.
- paint_texture for arbitrary texture pixels. Texture size comes from pack_uv; don't change it afterwards without re-packing.`,
  animation: `ANIMATION
- Values are offsets on the rest pose: rotation degrees (X = pitch forward/back, Y = yaw, Z = roll), position px, scale factor.
- SIGN WARNING: in this editor rotation +X swings a hanging arm FORWARD. That is the OPPOSITE of vanilla Java code (zombie arms: xRot = -90°)
  and of Bedrock/GeckoLib animation files — do NOT carry those signs over. Zombie arms straight forward here = [90, 0, 0]; an attack swing peaks at +X.
- add_keyframes / generate_animation answer with "motion": where each limb's tip actually moves. Read it — if an attack arm says "backward", flip the sign.
- Direction (the mob faces north, -Z): rotation +X swings a hanging arm/leg FORWARD (towards the face), -X swings it back; a head pitches DOWN with -X and up with +X; position -Z moves forward. Check the front view after keying an attack.
- walk: legs swing ±30–45° on X in opposite phase, arms opposite to legs, ~1 s loop. idle: subtle breathing (body scale 1→1.02) or head sway, 2–4 s loop. attack: arms swing forward (+X, e.g. 90–110°) and the head dips (-X), body lunges to -Z, 0.3–0.6 s, loop "once".
- generate_animation gives a starting point from bone names; refine with add_keyframes; check with screenshot(animation, time).
- Assign them in set_entity_settings: idleAnimation, walkAnimation, attackAnimation.`,
  mob_settings: `MOB SETTINGS (set_entity_settings)
- behavior: passive (wanders, flees), neutral (fights back), hostile_melee (hunts players), stationary.
- Typical: zombie maxHealth 20, movementSpeed 0.23, attackDamage 3; cow maxHealth 10, speed 0.2; spider speed 0.3.
- hitboxWidth/Height in blocks (zombie 0.6 x 1.95). mobCategory monster spawns in darkness and despawns in peaceful.
- damageType: a project Damage Type (list_elements damageType) or vanilla id like minecraft:mob_attack.
- naturalSpawn + spawnBiomes (#minecraft:is_overworld / is_nether / is_end / any biome tag), spawnWeight, spawnMin/Max.`,
  elements: `OTHER ELEMENTS
- list_element_kinds shows every kind and its fields. create_element(kind, id, fields) then update_element.
- Exports are datapack/runtime files generated by the editor; the user exports the project from the UI.`,
};

await server.connect(new StdioServerTransport());
log("MCP server ready (stdio)");
