"""Seamless block textures from 16x16 up to 256x256, with three engines:

- "item": the item model (yuuki14202028/minecraft-item-16px). It isn't trained on blocks, but
  material prompts ("stone bricks", "oak planks") come out full-bleed and exactly on the 16px grid —
  so 16x16 only. The magenta transparency key isn't wanted here, so keyed pixels are filled from
  their neighbours.
- "lora": SD 1.5 + the "Minecraft Block Texture 1.12" LoRA by its Civitai author
  (https://civitai.com/models/55824, trigger word "mc112block", trained with clip skip 2).
  Licence: generated images may be used commercially, crediting the LoRA is required.
  Vanilla-style pixel art; it draws a ~16-texel grid, so larger sizes look like upscaled pixel art.
- "sd15": plain SD 1.5 (same pipeline, LoRA switched off) for detailed "HD pack" textures.

The SD 1.5 engines render at 512px and are box-downscaled to the requested size.

"Seamless" puts circular padding on every UNet + VAE convolution so the texture wraps around its
edges and tiles without seams — for the item and sd15 engines. The LoRA engine ignores it: with the
LoRA active, circular padding turned the output into stripes, grey noise or blank white in every
variant tried (fused or not, clip skip 1 or 2, 256 or 512px, padding only for the last steps).
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
# Second LoRA on the same SD 1.5 pipe: "Minecraft 1.19 Block+Item" by the same author
# (https://civitai.com/models/60379, version 64847) — newer 1.19-style block textures and item
# icons, no trigger word. Licence: commercial use of images allowed; credit the LoRA.
LORA119_PATH = Path(os.environ.get("SKIN_GENERATOR_BLOCK_LORA_119", Path(__file__).parent / "models" / "mc119allV1.0.safetensors"))
LORA119_URL = "https://civitai.com/api/download/models/64847?type=Model&format=SafeTensor"
MAGENTA = np.array([255, 0, 255], dtype=np.float32)

_lora_pipe = None


SIZES = (16, 32, 64, 128, 256)
SD_RES = 512


@contextmanager
def tiling(pipe, on=True):
    """Circular padding for the duration of one generation (the pipes are shared)."""
    convs = [m for part in (pipe.unet, pipe.vae) for m in part.modules() if isinstance(m, torch.nn.Conv2d)]
    before = [m.padding_mode for m in convs]
    if on:
        for m in convs:
            m.padding_mode = "circular"
    try:
        yield
    finally:
        for m, mode in zip(convs, before):
            m.padding_mode = mode


def _download(path: Path, url: str):
    if path.exists():
        return
    import urllib.request
    print(f"Downloading {path.name} ...", flush=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".part")
    # Civitai answers Python's default User-Agent with 403.
    req = urllib.request.Request(url, headers={"User-Agent": "mc-screen-designer-skin-generator/1.0"})
    with urllib.request.urlopen(req, timeout=120) as res, open(tmp, "wb") as f:
        while chunk := res.read(1 << 20):
            f.write(chunk)
    tmp.rename(path)


def _lora(device, dtype):
    global _lora_pipe
    if _lora_pipe is None:
        from diffusers import DPMSolverMultistepScheduler, StableDiffusionPipeline
        _download(LORA_PATH, LORA_URL)
        _download(LORA119_PATH, LORA119_URL)
        print(f"Loading {BASE_MODEL} + {LORA_PATH.name} ...", flush=True)
        pipe = StableDiffusionPipeline.from_pretrained(
            BASE_MODEL, torch_dtype=dtype, variant="fp16" if dtype == torch.float16 else None,
            safety_checker=None, requires_safety_checker=False)
        pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
        pipe.load_lora_weights(str(LORA_PATH.parent), weight_name=LORA_PATH.name, adapter_name="mc112")
        pipe.load_lora_weights(str(LORA119_PATH.parent), weight_name=LORA119_PATH.name, adapter_name="mc119")
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


def downscale(image: Image.Image, size: int) -> Image.Image:
    return image.convert("RGB").resize((size, size), Image.Resampling.BOX).convert("RGBA")


@torch.inference_mode()
def generate(item_pipe, engine, prompt, count, steps, guidance, seed, tileable, device, dtype, size=16):
    n = int(count)
    size = int(size)
    if size not in SIZES:
        raise ValueError(f"size must be one of {SIZES}")
    gen = None if int(seed) < 0 else torch.Generator(device="cpu").manual_seed(int(seed))
    if engine in ("lora", "lora119", "sd15"):
        pipe = _lora(device, dtype)
        common = dict(num_inference_steps=int(steps), guidance_scale=float(guidance), height=SD_RES, width=SD_RES, generator=gen)
        with tiling(pipe, tileable and engine == "sd15"):
            if engine == "lora":
                pipe.enable_lora()
                pipe.set_adapters(["mc112"])
                images = pipe(prompt_embeds=_embed_clip_skip_2(pipe, [f"{TRIGGER}, {prompt}"] * n),
                              negative_prompt_embeds=_embed_clip_skip_2(pipe, [""] * n), **common).images
            elif engine == "lora119":
                pipe.enable_lora()
                pipe.set_adapters(["mc119"])
                # No trigger word; plain prompt + clip skip 2 gave the most vanilla-like results in an
                # A/B (a "minecraft block texture" prefix or clip skip 1 washed out ores/details).
                images = pipe(prompt_embeds=_embed_clip_skip_2(pipe, [prompt] * n),
                              negative_prompt_embeds=_embed_clip_skip_2(pipe, [""] * n), **common).images
            else:
                pipe.disable_lora()
                images = pipe([f"{prompt}, seamless texture, flat top-down game texture"] * n,
                              negative_prompt=["perspective, frame, border, text, watermark, blurry"] * n, **common).images
        return [downscale(im, size) for im in images]
    if size != 16:
        raise ValueError("The item engine only makes 16x16 textures")
    with tiling(item_pipe, tileable):
        images = item_pipe([prompt] * n, negative_prompt=[""] * n, num_inference_steps=int(steps),
                           guidance_scale=float(guidance), height=256, width=256, generator=gen).images
    return [to_image(fill_keyed(fold(im))) for im in images]
