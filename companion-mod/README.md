# Mod Builder Companion (NeoForge 26.2 and 1.21.1)

This mod connects Minecraft to the MC Mod Builder web UI. It lets you design structures in-game with Claude or Codex and sends them, as structure templates (`.nbt`), straight into your project.

## Setup

1. Get the jar for your Minecraft version and put it into `mods/`. Either:
   - download it from the web UI under **Settings → AI → Minecraft mod**, or
   - build it yourself: `./gradlew build` produces `build/26.2/libs/mmb-companion-0.1.0+mc26.2.jar`, and `./gradlew build -Pmc=1.21.1` produces `build/1.21.1/libs/mmb-companion-0.1.0+mc1.21.1.jar`.

   It's a server-side mod: single player, LAN or a dedicated server all work.
2. In the web UI, log in and go to **Settings → AI → Minecraft mod → Create token**.
3. In Minecraft (as an op, or with cheats on), run the command shown there:
   `/mmb connect http://192.168.1.20:3000 mmb_…`
   The address is the web UI's domain or IP as Minecraft sees it. The command saves both values to `config/mmb_companion-common.toml`.
4. Check the connection with `/mmb status`.

Generating needs the web UI's **dev server** (`npm run dev`), because that's where the Claude and Codex CLIs run. It uses your linked accounts from Settings → AI → Accounts, or the host's own CLI login. The `claude` and `codex` binaries must be on that server's `PATH`. Uploading works with any web UI that has accounts enabled.

## Commands

| Command | |
|---|---|
| `/mmb generate <prompt>` | The AI designs the structure (up to `maxSize` per side, at most 128). It's placed 2 blocks in front of you, with its entrance facing you and the floor at your feet. The `.nbt` is uploaded automatically. |
| `/mmb undo` | Puts back what was there before your last generation. |
| `/mmb upload [name]` | Without a selection: uploads your last generated structure **as you edited it**. This is stored as a corrected version of the generation, which makes good training data. |
| `/mmb pos1 [x y z]` / `/mmb pos2 [x y z]` then `/mmb upload <name>` | Uploads any region, such as something you built by hand. |
| `/mmb project [key]` | Sends structures to one project only. Without a key, they go to whichever project is open in the editor. |
| `/mmb status` | Shows the connection, the user, and where structures go. |

Command blocks and the console can use the commands too, for example:
`/execute positioned 0 64 0 rotated 180 0 run mmb generate a well`

## Config (`config/mmb_companion-common.toml`)

`serverUrl`, `token`, `project`, `provider` (`auto` tries Claude, then Codex), `model` (optional) and `maxSize` (4–128, default 48).

## Versions

Both versions share the code in `src/main/java`. The few APIs that changed between 1.21.1 and 26.2 live in a small `Compat` class:
- [`src/v26_2/`](src/v26_2/java/sheepfromheaven/mmb/companion/Compat.java)
- [`src/v1_21_1/`](src/v1_21_1/java/sheepfromheaven/mmb/companion/Compat.java)

These APIs are the permission check, `StructureTemplate.fillFromWorld`, and the setBlock flags. 1.21.1 builds with Java 21, 26.2 with Java 25; Gradle downloads both. To test a version, run `./gradlew runServer -Pmc=1.21.1`.

## What happens

1. The web UI asks the AI for a short build program: boxes, shells, walls and single blocks, made of vanilla block states.
2. The web UI checks the program and expands it to a block list.
3. The mod turns the block list into a `StructureTemplate`, rotates it toward you, clears the area and places it.
4. The mod saves the region with `fillFromWorld` and posts the gzip NBT to `/api/mod/structures/upload`.
5. Prompt, AI answer, blocks and `.nbt` are kept in the `mmb_structures` table for training.
6. The editor polls `/api/mod/inbox` and adds new uploads to the project's Structures tab.
