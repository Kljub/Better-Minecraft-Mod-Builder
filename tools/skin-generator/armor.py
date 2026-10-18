"""Armor sets: worn armor layers + inventory icons.

Vanilla's worn armor uses the legacy 64x32 humanoid layout — the same one player_skin.py draws
legacy skins in. So the body layers come from the skin model, prompted for a character in full
armor, and are split the way the game uses them:

- layer 1 ("humanoid", inflated by 1px): helmet = head + hat, chestplate = body + arms,
  boots = the bottom BOOT_ROWS of the legs (the rest of the legs is the leggings' job)
- layer 2 ("humanoid_leggings", inflated by 0.5px): the bottom BELT_ROWS of the body + the legs

The four inventory icons come from the item model (prompts "<material> helmet" etc.), sharing a
seed so they read as one set.
"""

import numpy as np
from PIL import Image

import player_skin

PIECES = ("helmet", "chestplate", "leggings", "boots")
BOOT_ROWS = 4  # of the 12px legs
BELT_ROWS = 3  # of the 12px body

# legacy 64x32 box-UV nets as (x0, y0, x1, y1): head, hat, body, right arm, right leg
HEAD, HAT = (0, 0, 32, 16), (32, 0, 64, 16)
BODY, ARM, LEG = (16, 16, 40, 32), (40, 16, 56, 32), (0, 16, 16, 32)
# the side faces of a 12px-tall part start 4px (its depth) below the net's top
SIDES_TOP = 20


def _keep(dst, src, box):
    x0, y0, x1, y1 = box
    dst[y0:y1, x0:x1] = src[y0:y1, x0:x1]


def _keep_bottom_rows(dst, src, box, rows):
    """Copies only the lowest `rows` texel rows of a 12px-tall part's side faces (plus its bottom
    face, which sits in the net's top strip next to the top face)."""
    x0, y0, x1, y1 = box
    dst[y1 - rows:y1, x0:x1] = src[y1 - rows:y1, x0:x1]
    w = (x1 - x0) // 2  # top + bottom faces share the 4px strip above the sides; bottom is the right half
    dst[y0:SIDES_TOP, x0 + w:x1] = src[y0:SIDES_TOP, x0 + w:x1]


def split_layers(skin64: Image.Image) -> tuple[Image.Image, Image.Image]:
    """64x64 skin (player_skin.to_skin output) -> (layer 1, layer 2), both 64x32 RGBA."""
    legacy = np.asarray(skin64.convert("RGBA"))[:32]
    layer1 = np.zeros_like(legacy)
    layer2 = np.zeros_like(legacy)
    for box in (HEAD, HAT, BODY, ARM):
        _keep(layer1, legacy, box)
    _keep_bottom_rows(layer1, legacy, LEG, BOOT_ROWS)
    _keep(layer2, legacy, LEG)
    _keep_bottom_rows(layer2, legacy, BODY, BELT_ROWS)
    return Image.fromarray(layer1, "RGBA"), Image.fromarray(layer2, "RGBA")


def generate(item_icons, material, count, steps, guidance, seed, device, dtype):
    """Returns one dict per set: {"layer1", "layer2", "skin", "helmet", "chestplate", "leggings", "boots"}.
    `item_icons(prompts, seed)` renders 16x16 icons with the item model."""
    prompt = f"a knight in full {material} armor, {material} plate helmet covering the face, {material} chestplate, leggings and boots"
    skins = player_skin.generate(prompt, count, steps, guidance, seed, device, dtype)
    sets = []
    for i, skin in enumerate(skins):
        layer1, layer2 = split_layers(skin)
        icons = item_icons([f"{material} {p}" for p in PIECES], -1 if int(seed) < 0 else int(seed) + i)
        sets.append({"layer1": layer1, "layer2": layer2, "skin": skin, **dict(zip(PIECES, icons))})
    return sets
