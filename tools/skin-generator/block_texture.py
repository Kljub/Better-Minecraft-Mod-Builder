"""Seamless 16x16 block textures, with two engines:

- "item": the item model (yuuki14202028/minecraft-item-16px). It isn't trained on blocks, but
  material prompts ("stone bricks", "oak planks") come out full-bleed and exactly on the 16px grid.
  The magenta transparency key isn't wanted here, so keyed pixels are filled from their neighbours.
- "lora": SD 1.5 + the "Minecraft Block Texture 1.12" LoRA by its Civitai author
  (https://civitai.com/models/55824, trigger word "mc112block", trained at 256px with clip skip 2).
  Licence: generated images may be used commercially, crediting the LoRA is required.
  Output is downscaled 256 -> 16 with a box filter.

"Seamless" puts circular padding on the convolutions so the texture wraps around its edges. For the
item engine that's every UNet + VAE conv and the result tiles without seams. On SD 1.5 + the LoRA a
circular UNet wrecks the output (noise / stripes at 256px), so there only the VAE wraps — that
softens edge seams but doesn't remove them.
"""

import os
from contextlib import contextmanager
from pathlib import Path

import numpy as np
import torch
from PIL import Image

BASE_MODEL = "stable-diffusion-v1-5/stable-diffusion-v1-5"
LORA_PATH = Path(os.environ.get("SKIN_GENERATOR_BLOCK_LORA", Path(__file__).parent / "models" / "mc112blocksV1.1.safetensors"))
LORA_URL = "https://civitai.com/api/download/models/79878?type=Model&format=SafeTensor"
TRIGGER = "mc112block"
MAGENTA = np.array([255, 0, 255], dtype=np.float32)

_lora_pipe = None


@contextmanager
def tiling(pipe, on=True, unet=True):
    """Circular padding for the duration of one generation (the item pipe is shared)."""
    parts = (pipe.unet, pipe.vae) if unet else (pipe.vae,)
    convs = [m for part in parts for m in part.modules() if isinstance(m, torch.nn.Conv2d)]
    before = [m.padding_mode for m in convs]
    if on:
        for m in convs:
            m.padding_mode = "circular"
    try:
        yield
    finally:
        for m, mode in zip(convs, before):
            m.padding_mode = mode


def _lora(device, dtype):
    global _lora_pipe
    if _lora_pipe is None:
        from diffusers import DPMSolverMultistepScheduler, StableDiffusionPipeline
        if not LORA_PATH.exists():
            import urllib.request
            print(f"Downloading block LoRA to {LORA_PATH} ...", flush=True)
            LORA_PATH.parent.mkdir(parents=True, exist_ok=True)
            urllib.request.urlretrieve(LORA_URL, LORA_PATH)
        print(f"Loading {BASE_MODEL} + {LORA_PATH.name} ...", flush=True)
        pipe = StableDiffusionPipeline.from_pretrained(
            BASE_MODEL, torch_dtype=dtype, variant="fp16" if dtype == torch.float16 else None,
            safety_checker=None, requires_safety_checker=False)
        pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
        pipe.load_lora_weights(str(LORA_PATH.parent), weight_name=LORA_PATH.name)
        pipe.fuse_lora()
        pipe.set_progress_bar_config(disable=True)
        _lora_pipe = pipe.to(device)
    return _lora_pipe


def _embed_clip_skip_2(pipe, prompts):
    """Prompt embeddings from the penultimate CLIP layer (the LoRA was trained with clip skip 2).
    Done by hand: diffusers' clip_skip path expects the transformers-4 CLIPTextModel layout."""
    tok = pipe.tokenizer(prompts, padding="max_length", max_length=pipe.tokenizer.model_max_length,
                         truncation=True, return_tensors="pt")
    out = pipe.text_encoder(tok.input_ids.to(pipe.device), output_hidden_states=True)
    return pipe.text_encoder.final_layer_norm(out.hidden_states[-2])


def fold(image: Image.Image) -> np.ndarray:
    """256px on the 16px grid -> 16x16 by block average."""
    a = np.asarray(image.convert("RGB"), dtype=np.float32)
    c = a.shape[0] // 16
    return a.reshape(16, c, 16, c, 3).mean(axis=(1, 3))


def fill_keyed(rgb: np.ndarray, tol: float = 100) -> np.ndarray:
    """Replaces near-magenta texels (the item model's transparency colour) with the mean of their
    non-magenta neighbours, wrapping around so the fill stays seamless."""
    rgb = rgb.copy()
    bad = np.abs(rgb - MAGENTA).sum(axis=2) <= tol
    for _ in range(16):
        if not bad.any() or bad.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(bad.shape, dtype=np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            ok = ~np.roll(bad, (dy, dx), axis=(0, 1))
            acc += np.roll(rgb, (dy, dx), axis=(0, 1)) * ok[..., None]
            cnt += ok
        fix = bad & (cnt > 0)
        rgb[fix] = acc[fix] / cnt[fix][:, None]
        bad &= ~fix
    return rgb


def to_image(rgb: np.ndarray) -> Image.Image:
    return Image.fromarray(rgb.round().clip(0, 255).astype(np.uint8), "RGB").convert("RGBA")


@torch.inference_mode()
def generate(item_pipe, engine, prompt, count, steps, guidance, seed, tileable, device, dtype):
    n = int(count)
    gen = None if int(seed) < 0 else torch.Generator(device="cpu").manual_seed(int(seed))
    if engine == "lora":
        pipe = _lora(device, dtype)
        with tiling(pipe, tileable, unet=False):
            images = pipe(prompt_embeds=_embed_clip_skip_2(pipe, [f"{TRIGGER}, {prompt}"] * n),
                          negative_prompt_embeds=_embed_clip_skip_2(pipe, [""] * n), num_inference_steps=int(steps),
                          guidance_scale=float(guidance), height=256, width=256, generator=gen).images
        return [to_image(np.asarray(im.convert("RGB").resize((16, 16), Image.Resampling.BOX), dtype=np.float32)) for im in images]
    with tiling(item_pipe, tileable):
        images = item_pipe([prompt] * n, negative_prompt=[""] * n, num_inference_steps=int(steps),
                           guidance_scale=float(guidance), height=256, width=256, generator=gen).images
    return [to_image(fill_keyed(fold(im))) for im in images]
