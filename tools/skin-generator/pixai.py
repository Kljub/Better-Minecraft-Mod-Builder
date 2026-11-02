"""The "Pixel AI" style: the pixel-art illustration LoRA "pixel ai style LORA" by busy_men
(https://civitai.com/models/84382, version 89709, trigger word "pixai") on the SD 1.5 pipeline of
block_texture.py. Licence: no commercial use of the images; credit not required.

It paints pixel-art-looking illustrations (not on a real texel grid), so every result is drawn at
512 px and scaled to a power-of-two size: 16 … 256 box-downscaled (the smaller, the more it reads
as real pixel art), 1024 … 4096 upscaled nearest-neighbour (crisp pixel blocks, no new detail):

- blocks: a flat (optionally seamless) material texture, see block_texture.generate(engine="pixai")
- items: one object on a plain background; the background is flood-filled away from the borders,
  the object cropped, centred on a square and downscaled with a hard (on/off) alpha like vanilla
- GUI materials: see gui_texture
"""

import os
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw

import block_texture

PATH = Path(os.environ.get("SKIN_GENERATOR_PIXAI_LORA", Path(__file__).parent / "models" / "pixai_style.safetensors"))
URL = "https://civitai.com/api/download/models/89709?type=Model&format=SafeTensor"
TRIGGER = "pixai"
ADAPTER = "pixai"
SIZES = (16, 32, 64, 128, 256, 512, 1024, 2048, 4096)
RES = 512

ITEM_NEGATIVE = ("checkerboard, checkered background, transparent background, grid, tiles, pattern background, multiple objects, "
                 "character, person, hands, text, letters, watermark, frame, border, scenery, landscape, shadow, gradient background")


def pipe(device, dtype):
    """The shared SD 1.5 pipe with only the Pixel AI adapter active (loaded on first use, 144 MB)."""
    p = block_texture._lora(device, dtype)
    if ADAPTER not in p.get_list_adapters().get("unet", []):
        block_texture._download(PATH, URL)
        p.load_lora_weights(str(PATH.parent), weight_name=PATH.name, adapter_name=ADAPTER)
    p.enable_lora()
    p.set_adapters([ADAPTER])
    return p


def check_size(size) -> int:
    size = int(size)
    if size not in SIZES:
        raise ValueError(f"size must be one of {SIZES}")
    return size


def scale(image: Image.Image, size: int) -> Image.Image:
    """Square image to size x size: box filter going down, nearest-neighbour going up."""
    if image.width == size:
        return image
    return image.resize((size, size), Image.Resampling.BOX if size < image.width else Image.Resampling.NEAREST)


def _generator(seed):
    return None if int(seed) < 0 else torch.Generator(device="cpu").manual_seed(int(seed))


@torch.inference_mode()
def textures(prompt, n, steps, guidance, seed, tileable, device, dtype, suffix="flat texture, front view, game texture"):
    """n 512px pixel-art textures (blocks, GUI materials)."""
    p = pipe(device, dtype)
    with block_texture.tiling(p, tileable):
        return p([f"{TRIGGER}, {prompt}, {suffix}"] * int(n),
                 negative_prompt=["perspective, frame, border, text, watermark, blurry"] * int(n),
                 num_inference_steps=int(steps), guidance_scale=float(guidance), width=RES, height=RES,
                 generator=_generator(seed)).images


def _cutout(image: Image.Image, tol: int = 40) -> Image.Image:
    """RGBA with the background (whatever touches the border, within `tol` of it) made transparent."""
    rgb = image.convert("RGB")
    marked = rgb.copy()
    key = (255, 0, 254)  # a colour SD practically never paints exactly
    w, h = rgb.size
    step = max(1, w // 32)
    seeds = [(x, 0) for x in range(0, w, step)] + [(x, h - 1) for x in range(0, w, step)] \
        + [(0, y) for y in range(0, h, step)] + [(w - 1, y) for y in range(0, h, step)]
    for xy in seeds:
        if marked.getpixel(xy) != key:
            ImageDraw.floodfill(marked, xy, key, thresh=tol)
    m = np.asarray(marked)
    bg = (m[..., 0] == key[0]) & (m[..., 1] == key[1]) & (m[..., 2] == key[2])
    out = np.dstack([np.asarray(rgb), np.where(bg, 0, 255).astype(np.uint8)])
    return Image.fromarray(out, "RGBA")


def _to_icon(cut: Image.Image, size: int) -> Image.Image:
    """Crop to the object, centre it on a square with a small margin, downscale with hard alpha."""
    box = cut.getchannel("A").getbbox()
    if box is None:
        return Image.new("RGBA", (size, size))
    obj = cut.crop(box)
    side = int(max(obj.size) * 1.08)
    square = Image.new("RGBA", (side, side))
    square.paste(obj, ((side - obj.width) // 2, (side - obj.height) // 2))
    if size >= side:
        return square.resize((size, size), Image.Resampling.NEAREST)
    a = np.asarray(square, dtype=np.float32) / 255.0
    # premultiplied box downscale, so the transparent background doesn't bleed dark into the edges
    pre = np.dstack([a[..., :3] * a[..., 3:4], a[..., 3:4]])
    pre_img = [Image.fromarray((pre[..., c] * 255).astype(np.uint8), "L").resize((size, size), Image.Resampling.BOX) for c in range(4)]
    s = np.stack([np.asarray(im, dtype=np.float32) / 255.0 for im in pre_img], axis=-1)
    alpha = s[..., 3:4]
    rgb = np.where(alpha > 0, s[..., :3] / np.maximum(alpha, 1e-6), 0)
    hard = (alpha[..., 0] >= 0.5).astype(np.float32)
    return Image.fromarray(np.dstack([rgb * 255, hard * 255]).clip(0, 255).astype(np.uint8), "RGBA")


@torch.inference_mode()
def items(prompt, n, steps, guidance, seed, size, device, dtype):
    """n item icons at size x size with a transparent background."""
    size = check_size(size)
    p = pipe(device, dtype)
    images = p([f"{TRIGGER}, {prompt}, one single object, centered, on a solid flat white background, simple background"] * int(n),
               negative_prompt=[ITEM_NEGATIVE] * int(n), num_inference_steps=int(steps), guidance_scale=float(guidance),
               width=RES, height=RES, generator=_generator(seed)).images
    # cut and shrink at most to the 512px render; bigger sizes are nearest upscales of that
    return [scale(_to_icon(_cutout(im), min(size, RES)), size) for im in images]
