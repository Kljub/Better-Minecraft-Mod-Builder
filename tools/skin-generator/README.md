# Item Skin Generator — local backend

Gradio API on this machine's GPU behind the webapp's **Item Skin Generator** tab (backend "Local GPU").
The tab starts/stops it; the item endpoints mirror the public demo Space, so the same webapp code
drives either.

| Mode | Model | Output |
|---|---|---|
| Item, From texture, Material set | [yuuki14202028/minecraft-item-16px](https://huggingface.co/yuuki14202028/minecraft-item-16px) (SD 1.5 fine-tune) | 16×16 RGBA |
| Block, engine "item" | same model, circular padding, magenta key filled instead of keyed | 16×16, seamless |
| Block, engine "lora" | SD 1.5 + [Minecraft Block Texture 1.12](https://civitai.com/models/55824) LoRA | 16×16 (from 256px) |
| Player skin | [monadical-labs/minecraft-skin-generator-sdxl](https://huggingface.co/monadical-labs/minecraft-skin-generator-sdxl) | 64×64 skin |

Block and player modes are local only. Extra models load on first use: SD 1.5 (~2 GB) + the LoRA
(36 MB, downloaded to `models/`), and SDXL (~12 GB download, ~7 GB in fp16, run with CPU offload
so it fits next to the others on a 12 GB card; ~20 s per skin on an RTX 3060).

## Install (once)

```bash
cd tools/skin-generator
python3 -m venv .venv
.venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cu128   # pick the index for your CUDA
.venv/bin/pip install -r requirements.txt
```

## Run

From the webapp (`npm run dev`): Item Skin Generator → **Local GPU** → **Start**; the log button
shows the server output. By hand: `.venv/bin/python server.py` (http://127.0.0.1:7860, with a small
test UI) — the webapp then shows it as "started outside the app".

## Config

| env | where | default |
|---|---|---|
| `SKIN_GENERATOR_PORT` | server.py | `7860` |
| `SKIN_GENERATOR_MODEL` | server.py | `yuuki14202028/minecraft-item-16px` (repo id or local path) |
| `SKIN_GENERATOR_BLOCK_LORA` | server.py | `models/mc112blocksV1.1.safetensors` |
| `SKIN_GENERATOR_LOCAL_URL` | webapp | `http://127.0.0.1:7860` (its port is passed to the server it starts) |
| `SKIN_GENERATOR_DIR` | webapp | `../tools/skin-generator` |

## API

Gradio call API (`POST /gradio_api/call/<name>` → `event_id`, then `GET …/<event_id>` as SSE):

- `generate(prompt, count, steps, guidance, seed)`
- `generate_from_sketch(sketch, prompt, count, strength, steps, guidance, seed)`
- `generate_tier_set(sketch, materials, noun, strength, steps, guidance, seed)`
- `generate_block(prompt, count, steps, guidance, seed, engine, tileable)` — engine `item` | `lora`
- `generate_player_skin(prompt, count, steps, guidance, seed)`
- `status()` → `{device, model, dtype}`

Each generator returns `[previews, files]`; `files` are the finished PNGs. The server binds to
127.0.0.1 only and runs one job at a time.

## Notes from testing (RTX 3060)

- The item model draws good full-bleed block textures for material prompts even though its card
  says blocks were excluded; with circular padding they tile without seams.
- Circular padding in the UNet breaks the SD 1.5 + LoRA output, so the LoRA engine only wraps the
  VAE: seams get softer but don't go away. It also needs lower guidance (7).
- Player skins are generated in the legacy 64×32 layout and converted to 64×64 the way the game
  converts legacy skins (left limbs mirrored from the right ones); the hat layer's flat background
  colour is keyed back to transparent.

## Licences

- minecraft-item-16px: CreativeML OpenRAIL-M; trained on mod textures under mixed licences (some
  all-rights-reserved), check outputs for originality before redistributing.
- Minecraft Block Texture 1.12 LoRA by pymess508: generated images may be used commercially,
  **credit is required**.
- minecraft-skin-generator-sdxl: OpenRAIL. Its reference post-processing script is GPL-3.0 and is
  not used here; `player_skin.py` is an independent implementation of the skin format.
