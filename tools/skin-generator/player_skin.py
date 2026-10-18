"""Player skins from text via monadical-labs/minecraft-skin-generator-sdxl (OpenRAIL).

The model draws a legacy 64x32 skin layout scaled up to 768x384 in the top half of a 768x768
image; the bottom half is filler. Post-processing (own implementation, following the model card
and the public skin format, https://github.com/minotar/skin-spec):

1. fold the top half into 64x32 (block average, 12px per skin pixel)
2. key the hat overlay back to transparent — the model paints "transparent" as a flat colour,
   which it also uses in the never-rendered corners of the head row, so that's the reference
3. make all unused areas of the layout transparent
4. convert to the modern 64x64 layout the way the game converts legacy skins (left arm/leg are
   mirrored copies of the right ones)

The SDXL pipeline (~7 GB in fp16) is loaded on first use, with CPU offload on CUDA so it fits next
to the item model on a 12 GB card.
"""

import threading

import numpy as np
import torch
from PIL import Image

MODEL = "monadical-labs/minecraft-skin-generator-sdxl"
SIZE = 768  # the model card: larger outputs fill the extra space with garbage

# unused in the legacy 64x32 layout (x0, y0, x1, y1)
UNUSED = [(0, 0, 8, 8), (24, 0, 40, 8), (56, 0, 64, 8),
          (0, 16, 4, 20), (12, 16, 20, 20), (36, 16, 44, 20), (52, 16, 64, 20), (56, 20, 64, 32)]
# reference for the "transparent" colour: unused corners of the hat row
KEY_REFERENCE = [(32, 0, 40, 8), (56, 0, 64, 8)]
HAT = (32, 0, 64, 16)
KEY_DISTANCE = 50.0

# vanilla legacy -> 64x64 conversion: (src x, src y, offset x, offset y, w, h), all mirrored on x
LEGACY_COPIES = [
    (4, 16, 16, 32, 4, 4), (8, 16, 16, 32, 4, 4),
    (0, 20, 24, 32, 4, 12), (4, 20, 16, 32, 4, 12), (8, 20, 8, 32, 4, 12), (12, 20, 16, 32, 4, 12),
    (44, 16, -8, 32, 4, 4), (48, 16, -8, 32, 4, 4),
    (40, 20, 0, 32, 4, 12), (44, 20, -8, 32, 4, 12), (48, 20, -16, 32, 4, 12), (52, 20, -8, 32, 4, 12),
]

_pipe = None
_lock = threading.Lock()


def _load_once(device, dtype):
    from diffusers import StableDiffusionXLPipeline
    print(f"Loading {MODEL} ...", flush=True)
    pipe = StableDiffusionXLPipeline.from_pretrained(MODEL, torch_dtype=dtype)
    pipe.vae.config.force_upcast = True  # fp16 SDXL VAE can decode to NaN (black images)
    pipe.set_progress_bar_config(disable=True)
    if device == "cuda":
        pipe.enable_model_cpu_offload()
    else:
        pipe = pipe.to(device)
    return pipe


def _load(device, dtype):
    global _pipe
    with _lock:
        if _pipe is None:
            try:
                _pipe = _load_once(device, dtype)
            except NotImplementedError as e:
                # Seen once in the server (never standalone): a text encoder came back with weights
                # still on the "meta" device and offloading failed. A fresh load worked.
                print(f"SDXL load failed ({e}); retrying once", flush=True)
                _pipe = _load_once(device, dtype)
    return _pipe


def to_skin(image: Image.Image) -> Image.Image:
    """768x768 model output -> finished 64x64 RGBA skin."""
    a = np.asarray(image.convert("RGB").resize((SIZE, SIZE)), dtype=np.float32)[: SIZE // 2]
    c = SIZE // 64
    rgb = a.reshape(32, c, 64, c, 3).mean(axis=(1, 3)).round().clip(0, 255).astype(np.uint8)
    alpha = np.full((32, 64), 255, dtype=np.uint8)

    ref = np.concatenate([rgb[y0:y1, x0:x1].reshape(-1, 3) for x0, y0, x1, y1 in KEY_REFERENCE]).astype(np.float32)
    key = ref.mean(axis=0)
    x0, y0, x1, y1 = HAT
    hat = rgb[y0:y1, x0:x1].astype(np.float32)
    alpha[y0:y1, x0:x1][np.linalg.norm(hat - key, axis=2) <= KEY_DISTANCE] = 0
    for x0, y0, x1, y1 in UNUSED:
        alpha[y0:y1, x0:x1] = 0

    legacy = np.dstack([rgb, alpha])
    skin = np.zeros((64, 64, 4), dtype=np.uint8)
    skin[:32] = legacy
    for sx, sy, ox, oy, w, h in LEGACY_COPIES:
        skin[sy + oy: sy + oy + h, sx + ox: sx + ox + w] = legacy[sy: sy + h, sx: sx + w][:, ::-1]
    return Image.fromarray(skin, "RGBA")


@torch.inference_mode()
def generate(prompt, count, steps, guidance, seed, device, dtype):
    pipe = _load(device, dtype)
    images = []
    # one at a time: a 768px SDXL batch doesn't fit next to the item model
    for i in range(int(count)):
        gen = None if int(seed) < 0 else torch.Generator(device="cpu").manual_seed(int(seed) + i)
        images.append(pipe(prompt=prompt, num_inference_steps=int(steps), guidance_scale=float(guidance),
                           height=SIZE, width=SIZE, generator=gen).images[0])
    return [to_skin(im) for im in images]
