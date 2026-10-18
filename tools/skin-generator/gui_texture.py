"""Screen GUI textures (container backgrounds, panels) with SD 1.5.

SD 1.5 can't draw a usable GUI layout itself (asked for one it paints game screenshots, and
img2img over a flat grey GUI barely changes it), but it draws good seamless material textures. So
SD only makes the material, and the GUI is built around it:

- new panel: the material at the requested size, framed like vanilla GUIs — a dark 1px outline,
  a lit top/left bevel and a shaded bottom/right bevel, all derived from the material's own colours
- restyle: the material, shaded by the original GUI's brightness — every slot, edge and shadow of
  the original stays exactly where it was, only the material changes; `strength` blends from the
  original (0) to fully restyled (1), and the original's transparency is kept

"Pixel art" quantizes to a small palette, which turns SD's soft gradients into the flat shading
GUI textures use. Shares the SD 1.5 pipeline of block_texture.py (LoRA adapters off).
"""

import numpy as np
import torch
from PIL import Image, ImageFilter

import block_texture

# restyle: how much of the material's own texture shows over its blurred colour — full detail
# competes with the slots and edges the original's shading draws
RESTYLE_DETAIL = 0.4

NEGATIVE = "perspective, frame, border, text, letters, watermark, blurry, person, screenshot"


def _material(prompt, n, steps, guidance, seed, device, dtype):
    """n seamless 512px material textures for `prompt`."""
    pipe = block_texture._lora(device, dtype)
    pipe.disable_lora()
    gen = None if int(seed) < 0 else torch.Generator(device="cpu").manual_seed(int(seed))
    with block_texture.tiling(pipe, True):
        return pipe([f"{prompt}, seamless texture, flat top-down game texture, pixel art"] * n, negative_prompt=[NEGATIVE] * n,
                    num_inference_steps=int(steps), guidance_scale=float(guidance), width=512, height=512, generator=gen).images


def _fill(material: Image.Image, w: int, h: int) -> np.ndarray:
    """The material covering w x h: scaled so its long side matches (keeps texel density sane), tiled."""
    side = max(w, h)
    tile = np.asarray(material.convert("RGB").resize((side, side), Image.Resampling.BOX), dtype=np.float32)
    return np.tile(tile, (2, 2, 1))[:h, :w]


def _frame(rgb: np.ndarray) -> np.ndarray:
    """Vanilla-style bevel: 1px dark outline, 2px lit top/left, 2px shaded bottom/right."""
    out = rgb.copy()
    out[:2, :] *= 1.45
    out[:, :2] *= 1.45
    out[-3:-1, :] *= 0.55
    out[:, -3:-1] *= 0.55
    out[0, :] = out[-1, :] = out[:, 0] = out[:, -1] = rgb[0, 0] * 0.15
    return out


def _quantize(img: Image.Image, colors=24) -> Image.Image:
    alpha = img.getchannel("A")
    q = img.convert("RGB").quantize(colors=colors, method=Image.Quantize.MEDIANCUT).convert("RGBA")
    q.putalpha(alpha)
    return q


@torch.inference_mode()
def generate(prompt, count, steps, guidance, seed, width, height, sketch, strength, pixelate, device, dtype):
    materials = _material(prompt, int(count), steps, guidance, seed, device, dtype)
    out = []
    for mat in materials:
        if sketch is not None:
            src = sketch.convert("RGBA")
            w, h = src.size
            base = np.asarray(src, dtype=np.float32)
            lum = base[..., :3] @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
            opaque = base[..., 3] > 0
            mean = lum[opaque].mean() if opaque.any() else 128.0
            fill = _fill(mat, w, h)
            blurred = np.asarray(Image.fromarray(fill.astype(np.uint8)).filter(ImageFilter.GaussianBlur(max(w, h) / 12)), dtype=np.float32)
            calm = blurred + (fill - blurred) * RESTYLE_DETAIL
            styled = calm * (lum / max(mean, 1.0))[..., None]
            rgb = base[..., :3] * (1 - float(strength)) + styled * float(strength)
            img = Image.fromarray(np.dstack([rgb.clip(0, 255), base[..., 3]]).astype(np.uint8), "RGBA")
        else:
            w, h = int(width), int(height)
            rgb = _frame(_fill(mat, w, h))
            img = Image.fromarray(rgb.clip(0, 255).astype(np.uint8), "RGB").convert("RGBA")
        out.append(_quantize(img) if pixelate else img)
    return out
