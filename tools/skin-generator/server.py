"""Local backend for the webapp's Item Skin Generator.

Serves yuuki14202028/minecraft-item-16px (SD 1.5 fine-tune that draws real 16x16 item textures)
as a Gradio API on this machine's GPU. The endpoints and their parameters mirror the public demo
Space (yuuki14202028/minecraft-item-16px-demo), so webapp/app/api/skin/generate talks to both
the same way:

  /generate              (prompt, count, steps, guidance, seed)
  /generate_from_sketch  (sketch, prompt, count, strength, steps, guidance, seed)
  /generate_tier_set     (sketch, materials, noun, strength, steps, guidance, seed)
  /generate_block        (prompt, count, steps, guidance, seed, engine, tileable, size)  -- see block_texture.py
  /generate_player_skin  (prompt, count, steps, guidance, seed)   -- see player_skin.py
  /generate_armor        (material, count, steps, guidance, seed)  -- see armor.py
  /generate_gui          (sketch, prompt, count, strength, steps, guidance, seed, width, height, pixelate)  -- see gui_texture.py
(the last four exist only locally, not on the Space)
  /status                () -> {"device", "model", "dtype"}

Each returns (previews, files); the files are the finished 16x16 RGBA PNGs (64x64 skins for
/generate_player_skin). Usually started and
stopped from the webapp (Item Skin Generator -> Local), or by hand:

  .venv/bin/python server.py            # http://127.0.0.1:7860, small test UI included

Env: SKIN_GENERATOR_PORT (default 7860), SKIN_GENERATOR_MODEL (HF repo id or local path).
"""

import os
import tempfile
from pathlib import Path

import gradio as gr
import numpy as np
import torch
from PIL import Image
from diffusers import DPMSolverMultistepScheduler, StableDiffusionImg2ImgPipeline, StableDiffusionPipeline

import armor
import block_texture
import gui_texture
import player_skin

MODEL = os.environ.get("SKIN_GENERATOR_MODEL", "yuuki14202028/minecraft-item-16px")
PORT = int(os.environ.get("SKIN_GENERATOR_PORT", "7860"))
BG = np.array([255, 0, 255], dtype=np.int16)  # chroma key the model was trained with for transparency

if torch.cuda.is_available():
    DEVICE, DTYPE = "cuda", torch.float16
elif torch.backends.mps.is_available():
    DEVICE, DTYPE = "mps", torch.float16
else:
    DEVICE, DTYPE = "cpu", torch.float32  # works, but expect ~a minute per image

print(f"Loading {MODEL} on {DEVICE} ({DTYPE}) ...", flush=True)
pipe = StableDiffusionPipeline.from_pretrained(
    MODEL, torch_dtype=DTYPE, safety_checker=None, requires_safety_checker=False)
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
pipe = pipe.to(DEVICE)
pipe.set_progress_bar_config(disable=True)
# shares the weights — a second from_pretrained would load them into VRAM twice
i2i = StableDiffusionImg2ImgPipeline(**pipe.components)
i2i.set_progress_bar_config(disable=True)


def to_tile(image: Image.Image, size: int = 16, tol: int = 100) -> Image.Image:
    """Folds the 256px output into size x size (block average) and keys the magenta background out."""
    a = np.asarray(image.convert("RGB"), dtype=np.float32)
    c = a.shape[0] // size
    rgb = a.reshape(size, c, size, c, 3).mean(axis=(1, 3)).round().clip(0, 255).astype(np.int16)
    alpha = np.where(np.abs(rgb - BG).sum(axis=2) <= tol, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb.astype(np.uint8), alpha]))


def to_init(image: Image.Image, size: int = 16, up: int = 16) -> Image.Image:
    """Brings a base image into the training format: 16x16, transparency as magenta, upscaled x16.

    A cell keeps its colour if any pixel in it is opaque (averaged over the opaque pixels only) —
    plain downscaling would let thin strokes drown in the background.
    """
    im = image.convert("RGBA")
    w, h = im.size
    if w % size or h % size:
        im = im.resize((max(w // size, 1) * size, max(h // size, 1) * size), Image.Resampling.NEAREST)
    a = np.asarray(im, dtype=np.float32)
    bh, bw = a.shape[0] // size, a.shape[1] // size
    a = a.reshape(size, bh, size, bw, 4)
    solid = a[..., 3] >= 128
    cnt = solid.sum(axis=(1, 3))
    rgb = (a[..., :3] * solid[..., None]).sum(axis=(1, 3)) / np.maximum(cnt, 1)[..., None]
    tile = np.where((cnt > 0)[..., None], rgb, BG.astype(np.float32))
    tile = tile.round().clip(0, 255).astype(np.uint8)
    return Image.fromarray(tile).resize((size * up, size * up), Image.Resampling.NEAREST)


def editor_image(value):
    if value is None:
        return None
    if isinstance(value, dict):
        return value.get("composite") or value.get("background")
    return value


def generator(seed, n=None):
    seed = int(seed)
    if seed < 0:
        return None
    return [torch.Generator(device="cpu").manual_seed(seed) for _ in range(n)] if n else \
        torch.Generator(device="cpu").manual_seed(seed)


def pack(images, prompts):
    previews, files = [], []
    tmp = Path(tempfile.mkdtemp())
    for i, (im, prompt) in enumerate(zip(images, prompts)):
        stem = "".join(ch if ch.isalnum() else "_" for ch in prompt)[:40] or "texture"
        tile = to_tile(im)
        path = tmp / f"{stem}_{i}.png"
        tile.save(path)
        files.append(str(path))
        previews.append(tile.resize((256, 256), Image.Resampling.NEAREST))
    return previews, files


@torch.inference_mode()
def generate(prompt, count, steps, guidance, seed):
    if not prompt.strip():
        raise gr.Error("Enter a prompt. For example: copper sword")
    n = int(count)
    images = pipe([prompt] * n, negative_prompt=[""] * n, num_inference_steps=int(steps),
                  guidance_scale=float(guidance), height=256, width=256, generator=generator(seed)).images
    return pack(images, [prompt] * n)


@torch.inference_mode()
def generate_from_sketch(sketch, prompt, count, strength, steps, guidance, seed):
    src = editor_image(sketch)
    if src is None:
        raise gr.Error("Draw something, or load an image.")
    if not prompt.strip():
        raise gr.Error("Enter a prompt. For example: steel wrench")
    images = i2i(prompt=prompt, image=to_init(src), strength=float(strength), negative_prompt="",
                 num_inference_steps=int(steps), guidance_scale=float(guidance),
                 num_images_per_prompt=int(count), generator=generator(seed)).images
    return pack(images, [prompt] * len(images))


@torch.inference_mode()
def generate_tier_set(sketch, materials, noun, strength, steps, guidance, seed):
    """One base design, one prompt per material, all sharing the seed so the silhouettes line up."""
    src = editor_image(sketch)
    if src is None:
        raise gr.Error("Draw a design, or load an image.")
    mats = [t.strip() for t in materials.replace("\n", ",").split(",") if t.strip()][:12]
    if not mats:
        raise gr.Error("Enter at least one material. For example: iron, golden, diamond")
    prompts = [f"{m} {noun}".strip() for m in mats]
    images = i2i(prompt=prompts, image=[to_init(src)] * len(prompts), strength=float(strength),
                 negative_prompt=[""] * len(prompts), num_inference_steps=int(steps),
                 guidance_scale=float(guidance), generator=generator(seed, len(prompts))).images
    return pack(images, prompts)


def save_files(images, prompt, fallback):
    stem = "".join(ch if ch.isalnum() else "_" for ch in prompt)[:40] or fallback
    tmp = Path(tempfile.mkdtemp())
    files = []
    for i, im in enumerate(images):
        path = tmp / f"{stem}_{i}.png"
        im.save(path)
        files.append(str(path))
    return [im.resize((256, 256), Image.Resampling.NEAREST) for im in images], files


def generate_block(prompt, count, steps, guidance, seed, engine, tileable, size=16):
    if not prompt.strip():
        raise gr.Error("Enter a prompt. For example: mossy stone bricks")
    if engine not in ("item", "lora", "lora119", "sd15"):
        raise gr.Error("Unknown engine")
    try:
        tiles = block_texture.generate(pipe, engine, prompt, count, steps, guidance, seed, bool(tileable), DEVICE, DTYPE, int(size))
    except ValueError as e:
        raise gr.Error(str(e))
    return save_files(tiles, prompt, "block")


def generate_player_skin(prompt, count, steps, guidance, seed):
    if not prompt.strip():
        raise gr.Error("Describe the character. For example: a knight in golden armor")
    return save_files(player_skin.generate(prompt, count, steps, guidance, seed, DEVICE, DTYPE), prompt, "skin")


@torch.inference_mode()
def item_icons(prompts, seed):
    """16x16 icons from the item model, one per prompt, all from the same starting noise."""
    gens = None if int(seed) < 0 else [torch.Generator(device="cpu").manual_seed(int(seed)) for _ in prompts]
    images = pipe(prompts, negative_prompt=[""] * len(prompts), num_inference_steps=30, guidance_scale=9.0,
                  height=256, width=256, generator=gens).images
    return [to_tile(im) for im in images]


def generate_armor(material, count, steps, guidance, seed):
    """Per set: layer1, layer2 (64x32 worn armor) + helmet/chestplate/leggings/boots icons, in that
    order, named <material>_<set>_<part>.png."""
    if not material.strip():
        raise gr.Error("Enter a material. For example: ruby")
    sets = armor.generate(item_icons, material.strip(), count, steps, guidance, seed, DEVICE, DTYPE)
    stem = "".join(ch if ch.isalnum() else "_" for ch in material.strip())[:40] or "armor"
    tmp = Path(tempfile.mkdtemp())
    previews, files = [], []
    for i, parts in enumerate(sets):
        for part in ("layer1", "layer2", *armor.PIECES):
            path = tmp / f"{stem}_{i}_{part}.png"
            parts[part].save(path)
            files.append(str(path))
        previews.append(parts["skin"].resize((256, 256), Image.Resampling.NEAREST))
    return previews, files


def generate_gui(sketch, prompt, count, strength, steps, guidance, seed, width, height, pixelate):
    """GUI textures: from text at width x height, or restyling `sketch` (an existing GUI texture,
    kept at its own size and transparency)."""
    if not prompt.strip():
        raise gr.Error("Describe the style. For example: dark oak wood with iron rivets")
    src = editor_image(sketch)
    if src is None and not (16 <= int(width) <= 512 and 16 <= int(height) <= 512):
        raise gr.Error("Size must be between 16 and 512")
    images = gui_texture.generate(prompt, count, steps, guidance, seed, width, height, src, strength,
                                  bool(pixelate), DEVICE, DTYPE)
    return save_files(images, prompt, "gui")


def status() -> dict:
    name = torch.cuda.get_device_name(0) if DEVICE == "cuda" else DEVICE
    return {"device": name, "model": MODEL, "dtype": str(DTYPE).replace("torch.", "")}


with gr.Blocks(title="Item Skin Generator (local)") as demo:
    gr.Markdown(f"# Item Skin Generator — local backend\n`{MODEL}` on **{status()['device']}**. "
                "Driven from the webapp; this page is only for testing.")
    with gr.Tab("From text"):
        prompt = gr.Textbox(label="Prompt", value="copper sword")
        count = gr.Slider(1, 8, value=4, step=1, label="Images")
        steps = gr.Slider(10, 50, value=30, step=1, label="Steps")
        guidance = gr.Slider(1.0, 15.0, value=9.0, step=0.5, label="Guidance")
        seed = gr.Number(value=0, precision=0, label="Seed (-1 for random)")
        run = gr.Button("Generate", variant="primary")
        gallery = gr.Gallery(columns=4, height=300)
        files = gr.Files(label="16x16 PNG")
        run.click(generate, [prompt, count, steps, guidance, seed], [gallery, files], api_name="generate")
    with gr.Tab("From a drawing"):
        sketch = gr.ImageEditor(type="pil", image_mode="RGBA", canvas_size=(256, 256), fixed_canvas=True,
                                layers=False, transforms=[], sources=("upload", "clipboard"))
        s_prompt = gr.Textbox(label="Prompt", value="steel wrench")
        s_count = gr.Slider(1, 8, value=4, step=1, label="Images")
        s_strength = gr.Slider(0.3, 0.95, value=0.6, step=0.05, label="Strength")
        s_steps = gr.Slider(10, 50, value=40, step=1, label="Steps")
        s_guidance = gr.Slider(1.0, 15.0, value=9.0, step=0.5, label="Guidance")
        s_seed = gr.Number(value=0, precision=0, label="Seed")
        s_run = gr.Button("Generate", variant="primary")
        s_gallery = gr.Gallery(columns=4, height=300)
        s_files = gr.Files(label="16x16 PNG")
        s_run.click(generate_from_sketch, [sketch, s_prompt, s_count, s_strength, s_steps, s_guidance, s_seed],
                    [s_gallery, s_files], api_name="generate_from_sketch")
    with gr.Tab("A whole set"):
        t_sketch = gr.ImageEditor(type="pil", image_mode="RGBA", canvas_size=(256, 256), fixed_canvas=True,
                                  layers=False, transforms=[], sources=("upload", "clipboard"))
        t_materials = gr.Textbox(label="Materials", value="wooden, stone, iron, golden, diamond")
        t_noun = gr.Textbox(label="Item name", value="sword")
        t_strength = gr.Slider(0.3, 0.95, value=0.5, step=0.05, label="Strength")
        t_steps = gr.Slider(10, 50, value=40, step=1, label="Steps")
        t_guidance = gr.Slider(1.0, 15.0, value=9.0, step=0.5, label="Guidance")
        t_seed = gr.Number(value=77, precision=0, label="Seed")
        t_run = gr.Button("Generate", variant="primary")
        t_gallery = gr.Gallery(columns=4, height=300)
        t_files = gr.Files(label="16x16 PNG")
        t_run.click(generate_tier_set, [t_sketch, t_materials, t_noun, t_strength, t_steps, t_guidance, t_seed],
                    [t_gallery, t_files], api_name="generate_tier_set")
    with gr.Tab("Block"):
        b_prompt = gr.Textbox(label="Prompt", value="mossy stone bricks")
        b_engine = gr.Radio(["item", "lora", "lora119", "sd15"], value="item", label="Engine")
        b_tile = gr.Checkbox(value=True, label="Seamless")
        b_size = gr.Dropdown([16, 32, 64, 128, 256], value=16, label="Size (item engine: 16 only)")
        b_count = gr.Slider(1, 8, value=4, step=1, label="Images")
        b_steps = gr.Slider(10, 50, value=30, step=1, label="Steps")
        b_guidance = gr.Slider(1.0, 15.0, value=9.0, step=0.5, label="Guidance")
        b_seed = gr.Number(value=0, precision=0, label="Seed")
        b_run = gr.Button("Generate", variant="primary")
        b_gallery = gr.Gallery(columns=4, height=300)
        b_files = gr.Files(label="PNG")
        b_run.click(generate_block, [b_prompt, b_count, b_steps, b_guidance, b_seed, b_engine, b_tile, b_size],
                    [b_gallery, b_files], api_name="generate_block")
    with gr.Tab("Armor"):
        a_material = gr.Textbox(label="Material", value="ruby")
        a_count = gr.Slider(1, 4, value=1, step=1, label="Sets")
        a_steps = gr.Slider(10, 60, value=40, step=1, label="Steps")
        a_guidance = gr.Slider(1.0, 15.0, value=7.5, step=0.5, label="Guidance")
        a_seed = gr.Number(value=0, precision=0, label="Seed")
        a_run = gr.Button("Generate", variant="primary")
        a_gallery = gr.Gallery(columns=4, height=300)
        a_files = gr.Files(label="layers + icons")
        a_run.click(generate_armor, [a_material, a_count, a_steps, a_guidance, a_seed], [a_gallery, a_files],
                    api_name="generate_armor")
    with gr.Tab("Screen GUI"):
        g_sketch = gr.Image(type="pil", image_mode="RGBA", label="Restyle this GUI texture (optional)")
        g_prompt = gr.Textbox(label="Style", value="dark oak wood with iron rivets")
        g_count = gr.Slider(1, 4, value=2, step=1, label="Images")
        g_strength = gr.Slider(0.0, 1.0, value=0.85, step=0.05, label="Strength (restyle only: 0 = original, 1 = new material)")
        g_steps = gr.Slider(10, 50, value=30, step=1, label="Steps")
        g_guidance = gr.Slider(1.0, 15.0, value=7.0, step=0.5, label="Guidance")
        g_seed = gr.Number(value=0, precision=0, label="Seed")
        g_w = gr.Number(value=176, precision=0, label="Width (text only)")
        g_h = gr.Number(value=166, precision=0, label="Height (text only)")
        g_pix = gr.Checkbox(value=True, label="Pixel art palette")
        g_run = gr.Button("Generate", variant="primary")
        g_gallery = gr.Gallery(columns=4, height=300)
        g_files = gr.Files(label="PNG")
        g_run.click(generate_gui, [g_sketch, g_prompt, g_count, g_strength, g_steps, g_guidance, g_seed, g_w, g_h, g_pix],
                    [g_gallery, g_files], api_name="generate_gui")
    with gr.Tab("Player skin"):
        p_prompt = gr.Textbox(label="Prompt", value="a knight in golden armor")
        p_count = gr.Slider(1, 4, value=2, step=1, label="Images")
        p_steps = gr.Slider(10, 60, value=40, step=1, label="Steps")
        p_guidance = gr.Slider(1.0, 15.0, value=7.5, step=0.5, label="Guidance")
        p_seed = gr.Number(value=0, precision=0, label="Seed")
        p_run = gr.Button("Generate", variant="primary")
        p_gallery = gr.Gallery(columns=4, height=300)
        p_files = gr.Files(label="64x64 skin PNG")
        p_run.click(generate_player_skin, [p_prompt, p_count, p_steps, p_guidance, p_seed], [p_gallery, p_files],
                    api_name="generate_player_skin")
    gr.api(status, api_name="status")

# One GPU job at a time; the queue holds the rest.
demo.queue(default_concurrency_limit=1, max_size=20)
demo.launch(server_name="127.0.0.1", server_port=PORT, ssr_mode=False, show_error=True)
