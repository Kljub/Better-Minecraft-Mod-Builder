# screenspec-neoforge

Runtime library for NeoForge (Minecraft 1.21.5) that turns the `ScreenSpec`
JSON exported by the [MC Screen Designer](https://minecraft-mod-ui-builder.vercel.app/)
into a real, working `Screen` — no codegen, no hand-laid-out widgets.

**Targets:** Minecraft 1.21.5 / NeoForge 21.5.98 / Java 21

---

## Table of contents

1. [Installation](#installation)
2. [Quick start](#quick-start)
3. [Handling widget events](#handling-widget-events)
   - [Listener API (recommended)](#listener-api-recommended)
   - [Declarative actions in JSON](#declarative-actions-in-json)
   - [Subclass hook](#subclass-hook)
4. [Data bindings — game state into widgets](#data-bindings--game-state-into-widgets)
5. [Widget reference](#widget-reference)
6. [Widget props reference](#widget-props-reference)
7. [Extending and customising](#extending-and-customising)
8. [Tabs (creative-menu-style)](#tabs-creative-menu-style)
9. [Items and Blocks](#items-and-blocks)
10. [Known limitations](#known-limitations)
11. [Building locally](#building-locally)

---

## Installation

Grab the jar from [GitHub Releases](https://github.com/SheepFromHeaven/minecraft-mod-ui-builder/releases)
and add it to your mod's `build.gradle`:

```gradle
repositories {
    mavenLocal() // or wherever you published / vendored the jar
}

dependencies {
    implementation "sheepfromheaven.screenspec:screenspec-neoforge:<version>"
}
```

---

## Quick start

**1. Export** your screen from the designer — click "Export JSON" — and drop
the file into your mod's resources:

```
src/main/resources/assets/<your_modid>/screenspec/<name>.json
```

**2. Load** the spec at runtime:

```java
ScreenSpec spec = ScreenSpecLoader.fromResource(
    Minecraft.getInstance().getResourceManager(),
    "your_modid",        // your mod's namespace
    "settings_screen");  // filename without .json
```

**3. Open** the screen:

```java
SpecScreen screen = new SpecScreen(Component.literal("Settings"), spec);
Minecraft.getInstance().setScreen(screen);
```

That's it — widgets are positioned and sized exactly as they appear in the
designer. Wire up behavior using listeners (see below).

---

## Handling widget events

Every interactive widget fires an event when the player uses it. There are
three ways to handle those events; they can be combined freely.

### Listener API (recommended)

Register lambdas on the `SpecScreen` instance. No subclassing required.

```java
SpecScreen screen = new SpecScreen(Component.literal("Settings"), spec);

screen
    .on("save_btn",    (id, s, v) -> save())
    .on("cancel_btn",  (id, s, v) -> onClose())
    .on("volume",      (id, s, v) -> setVolume((Double) v))
    .on("name_input",  (id, s, v) -> setName((String) v))
    .on("hardcore",    (id, s, v) -> setHardcore((Boolean) v));

Minecraft.getInstance().setScreen(screen);
```

The key passed to `on()` matches either the **widget id** (assigned in the
designer) or the widget's **action id** (set via the `action` field — see
below). Both are checked on every event, so either key works.

Use `onAny` to observe all events (useful for logging or analytics):

```java
screen.onAny((id, spec, value) -> LOGGER.debug("action: {} = {}", id, value));
```

**Value types by widget:**

| Widget | Value type | Notes |
|--------|-----------|-------|
| `button` | `null` | fires on click |
| `toggle_button` | `Boolean` | `true` = selected |
| `input` | `String` | fires on every keystroke |
| `slider` | `Double` | current value within min–max range |

### Declarative actions in JSON

Set an `action` field on any widget in the designer's property panel.
The value is any string you choose; it is dispatched in addition to the widget
id, so a single listener can react to many widgets sharing the same action.

Built-in action ids handled automatically (no listener needed):

| Action id | Effect |
|-----------|--------|
| `close` | Closes the screen (`onClose()`) |

Example JSON fragment:
```json
{ "id": "quit_btn", "type": "button", "text": "Quit", "action": "close" }
```

Custom action ids — register a listener on the action id and reuse it across
any screen that declares the same action:

```json
{ "id": "btn1", "type": "button", "text": "Save", "action": "my_mod:save_config" }
```

```java
screen.on("my_mod:save_config", (id, s, v) -> saveConfig());
```

**Dispatch order** for each event:
1. Built-in action handler (if `action` matches a built-in id)
2. Listeners registered for the `action` id
3. Listeners registered for the widget id
4. Global `onAny` listeners
5. `onAction` subclass hook

### Subclass hook

If you prefer a class-per-screen style, extend `SpecScreen` and override
`onAction`:

```java
public class SettingsScreen extends SpecScreen {
    public SettingsScreen(ScreenSpec spec) {
        super(Component.literal("Settings"), spec);
    }

    @Override
    protected void onAction(String widgetId, WidgetSpec spec, Object value) {
        switch (widgetId) {
            case "save_btn"   -> save();
            case "volume"     -> setVolume((Double) value);
            case "name_input" -> setName((String) value);
            case "hardcore"   -> setHardcore((Boolean) value);
        }
    }
}
```

`onAction` fires after all listeners, so both approaches work side-by-side.

---

## Data bindings — game state into widgets

Bindings push live values from your mod into widget properties every render
frame — no polling, no manual widget updates.

### 1. Register a provider at mod init

```java
DataRegistry.register("my_mod:player_health",
    () -> String.valueOf((int) Minecraft.getInstance().player.getHealth()));

DataRegistry.register("my_mod:difficulty",
    () -> Minecraft.getInstance().level.getDifficulty().getKey());
```

Providers are plain lambdas — they have closure access to anything in scope.

### 2. Declare bindings in the designer

Open the property panel for any widget and use the **Bindings** section to
map a binding target to a provider id. The binding is stored in the exported
JSON under `bindings`:

```json
{ "id": "health_label", "type": "label", "text": "HP",
  "bindings": { "text": "my_mod:player_health" } }

{ "id": "save_btn", "type": "button", "text": "Save",
  "bindings": { "enabled": "my_mod:has_changes" } }
```

### Supported binding targets

| Target | Applies to | Effect |
|--------|-----------|--------|
| `text` | `label`, `button`, `toggle_button`, `input` | Replaces displayed text each frame |
| `enabled` | `button`, `toggle_button`, `input`, `slider` | Enables/disables widget (`"true"` / `"false"`) |
| `visible` | all types | Shows/hides widget (`"true"` / `"false"`) |

---

## Widget reference

| Designer type | Minecraft class | Event value |
|---------------|-----------------|-------------|
| `button` | `Button` | `null` |
| `toggle_button` | `Button` subclass | `Boolean` (selected state) |
| `input` | `EditBox` | `String` (current text) |
| `slider` | `AbstractSliderButton` subclass | `Double` (current value) |
| `panel` | Drawn directly | — |
| `label` | Drawn directly | — |
| `icon` | Drawn directly | — |
| `tabs` | `Button` per `tab` child (selector row) | — |
| `tab` | Not rendered itself — a content grouping | — |

`panel`, `label`, and `icon` are not interactive widgets — they are drawn
directly by `SpecScreen` and never fire events. `tabs`/`tab` are described in
[Tabs (creative-menu-style)](#tabs-creative-menu-style).

---

## Widget props reference

Props are set in the designer's property panel and serialised under `props` in
the JSON. All values are strings; the library parses them to the right type.

### `button`
_(no props beyond the common fields)_

### `toggle_button`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `group` | string | `""` | Widgets sharing the same non-empty group are mutually exclusive (radio group). Empty = independent on/off toggle. |

### `input`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `max_length` | int | `32` | Maximum character count. |
| `hint_text` | string | `""` | Placeholder shown when empty. |

### `slider`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `min` | double | `0` | Minimum value. |
| `max` | double | `100` | Maximum value. |
| `step` | double | `1` | Snap increment. |
| `value` | double | `min` | Initial value. |
| `text` | string | `"%s"` | Display template — `%s` is replaced with the formatted value. |

### `panel`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `style` | `default` \| `dark` \| `transparent` | `default` | Background fill style. Override `renderPanel` to use your mod's texture. |

### `label`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `color` | int (hex) | `0x404040` | Text colour. |
| `shadow` | boolean | `false` | Drop shadow. |
| `align` | `left` \| `center` \| `right` | `left` | Horizontal alignment within the widget bounds. |

### `icon`

_(no props — see [Extending and customising](#extending-and-customising) for how to render icons)_

---

## Extending and customising

### Rendering custom panel textures

```java
public class MyScreen extends SpecScreen {
    private static final ResourceLocation PANEL =
        ResourceLocation.fromNamespaceAndPath("my_mod", "textures/gui/panel.png");

    public MyScreen(ScreenSpec spec) {
        super(Component.literal("My Screen"), spec);
    }

    @Override
    protected void renderPanel(GuiGraphics g, WidgetSpec w) {
        g.blit(RenderType::guiTextured, PANEL, w.x, w.y, 0f, 0f, w.w, w.h, w.w, w.h);
    }
}
```

### Rendering icons

`resolveIcon` maps the `icon` id set in the designer to a `ResourceLocation`.
Return `null` to skip rendering.

```java
@Override
protected ResourceLocation resolveIcon(WidgetSpec w) {
    return switch (w.icon) {
        case "sword" -> ResourceLocation.fromNamespaceAndPath("my_mod", "textures/gui/icons/sword.png");
        default      -> null;
    };
}
```

### Custom widget types

Register a factory once at mod initialisation; it is available to every screen.

```java
WidgetFactories.register("my_custom_type", (spec, screen) -> {
    // build and return any AbstractWidget
    return new MyCustomWidget(spec.x, spec.y, spec.w, spec.h);
});
```

### Looking up a widget by id

```java
EditBox nameBox = screen.getWidget("name_input");
nameBox.setValue("default name");
```

---

## Inventory slot areas (containers)

Screens that need player-placeable item slots — a crafting table, a chest, a
custom storage UI — opt in with a `container` key alongside `widgets`:

```json
{
  "id": "storage_ui",
  "width": 176, "height": 166,
  "container": {
    "slots": [
      { "id": "input",         "x": 20, "y": 20, "cols": 3, "viewport_rows": 3, "slot_size": 18 },
      { "id": "output",        "x": 116, "y": 35, "cols": 1, "viewport_rows": 1, "slot_size": 18 },
      { "id": "player_inv",    "x": 8,  "y": 84,  "cols": 9, "viewport_rows": 3, "slot_size": 18, "source": "player" },
      { "id": "player_hotbar", "x": 8,  "y": 142, "cols": 9, "viewport_rows": 1, "slot_size": 18, "source": "player_hotbar" }
    ]
  },
  "widgets": [...]
}
```

`cols` sizes each slot area's grid width; `viewport_rows` is how many rows of
it are visible at once — *not* necessarily the true row count. The designer
can't know that: it depends on whatever `Container` you actually bind at
runtime (your own block's inventory, sized however you like), which is only
known once your mod hooks the spec up in Java. There are two ways to bind an
area, matching that distinction:

- **Fixed-size areas** (`SpecSlots#forArea`) — a crafting grid, an output
  slot, the player's own inventory — where `viewport_rows` is trusted as the
  literal row count because you already know it exactly. These never scroll.
- **Runtime-sized areas** (`SpecSlots#forScrollableViewport`) — bound to a
  `Container` whose size isn't fixed at design time. The true row count is
  derived from `container.getContainerSize() / cols`; if that's more rows
  than `viewport_rows`, the area scrolls to reveal the rest (see below).

`source: "player"` / `"player_hotbar"` are reserved ids resolved against the
player's own inventory; every other id is a mod-provided `Container` you
supply when building the menu.

This library only handles *rendering* and slot layout — the server-side
`AbstractContainerMenu` (slot syncing, shift-click behavior, recipe/game
logic) is still yours to write, exactly like vanilla. Use `SpecSlots` so the
same `SlotAreaSpec` layout drives both:

```java
public class MyMenu extends AbstractContainerMenu {
    public MyMenu(MenuType<?> type, int containerId, ScreenSpec spec,
                  Inventory playerInventory, Container input, Container output) {
        super(type, containerId);
        SpecSlots.forArea(spec.container.area("input"), input).forEach(this::addSlot);
        SpecSlots.forArea(spec.container.area("output"), output).forEach(this::addSlot);
        SpecSlots.forPlayerInventory(spec.container.area("player_inv"), playerInventory).forEach(this::addSlot);
        SpecSlots.forPlayerHotbar(spec.container.area("player_hotbar"), playerInventory).forEach(this::addSlot);
    }
    // quickMoveStack, stillValid, etc. — same as any vanilla AbstractContainerMenu
}
```

Then render it with `SpecContainerScreen`, the slotted counterpart to
`SpecScreen`:

```java
public class MyScreen extends SpecContainerScreen<MyMenu> {
    public MyScreen(MyMenu menu, Inventory playerInventory, Component title, ScreenSpec spec) {
        super(menu, playerInventory, title, spec);
    }
}
```

`SpecContainerScreen` draws each slot area's background by cropping the
vanilla chest texture's own slot grid, so borders between adjacent cells line
up exactly like a real container screen's — no custom art required. `panel`
and `label` widgets from the spec are drawn the same way `SpecScreen` draws
them; interactive widgets other than `scrollbar` (buttons, sliders, etc.)
alongside slots aren't supported yet — see Known limitations.

### Scrolling a slot area

Bind a runtime-sized `Container` with `SpecSlots#forScrollableViewport`
instead of `forArea`, and wrap the result in a `ScrollableSlotArea` so its
true size — and therefore whether it needs to scroll at all — is known:

```json
{ "id": "storage", "x": 8, "y": 8, "cols": 9, "slot_size": 18, "viewport_rows": 4 }
```

Because `Slot.x`/`Slot.y` are `final` in vanilla, scrolling can't reposition
existing `Slot`s — instead `ScrollableSlotArea` replaces the area's entries
in the menu's slot list with fresh `Slot`s pointing at whichever container
indices are now in view, at the same list index (so the slot's network id
never changes, only what it displays). Build one alongside the area's
initial slots and expose it via `ScrollableAreaHost`:

```java
public class MyMenu extends AbstractContainerMenu implements ScrollableAreaHost {
    private final Map<String, ScrollableSlotArea> scrollableAreas = new HashMap<>();

    public MyMenu(MenuType<?> type, int containerId, ScreenSpec spec, Container storage) {
        super(type, containerId);
        SlotAreaSpec area = spec.container.area("storage");
        int firstIndex = this.slots.size();
        SpecSlots.forScrollableViewport(area, storage).forEach(this::addSlot);
        scrollableAreas.put(area.id, new ScrollableSlotArea(area, storage, this.slots, firstIndex));
    }

    @Override
    public Map<String, ScrollableSlotArea> scrollableAreas() {
        return scrollableAreas;
    }

    @Override
    public boolean clickMenuButton(Player player, int id) {
        // resolves ids produced by SpecScroll.encode, sent by SpecContainerScreen
        return SpecScroll.handleClickMenuButton(spec.container, scrollableAreas, id);
    }
}
```

`storage` can be any size — a 6-slot furnace-like inventory, a 200-slot
mega-chest — the exact same JSON and menu code handles it, since the row
count comes from `storage.getContainerSize()` at construction time, not from
the spec. If it turns out to fit within `viewport_rows`,
`ScrollableSlotArea#scrollable()` is `false` and nothing scrolls.

A `scrollbar` widget in the spec, whose `target` prop names the area's id,
places and styles the scrollbar yourself; `SpecContainerScreen` skips
building it if the target isn't actually scrollable, so an explicitly-placed
scrollbar still only appears when there's something to scroll. If you don't
place one at all, `SpecContainerScreen` auto-attaches a default-styled
scrollbar along the area's right edge whenever it's scrollable, so binding
any inventory gets working scroll for free with zero layout effort — you
only need to place a `scrollbar` widget yourself for custom positioning.

Scrolling rides vanilla's container-button packet
(`AbstractContainerMenu#clickMenuButton`) rather than a custom payload — both
sides load the same `ScreenSpec`, so encoding "which area, which row" as a
single int is enough for the server to independently reproduce the client's
scroll and stay in sync for item interactions. `SpecContainerScreen` drives
the scrollbar from mouse drag and mouse wheel (both over the widget and over
the slot area itself), and clips the rendered slot grid to the viewport
automatically — no rendering code needed in `MyScreen`.

---

## Tabs (creative-menu-style)

Tabs are a widget, like `group` or `scroll` — a `tabs` widget in the designer
holds one or more `tab` children (drop widgets into a `tab` the same way you'd
drop them into a `group`). `SpecScreen` renders the `tab` children as a
selector row along the top of the `tabs` widget's box, and only builds/renders
the active tab's own content, swapped on click. A `tab` widget's `x`/`w` control its selector button's left position and width
within the selector row. When both are `0` (the default before the designer
lays them out), `SpecScreen` falls back to equal distribution. A `tab`'s
`y`/`h` are ignored — its content always fills the space directly below the
selector row.

```json
{
  "id": "tabs_1",
  "type": "tabs",
  "x": 8, "y": 8, "w": 176, "h": 150,
  "props": { "tab_height": "20" }
},
{
  "id": "general_tab",
  "type": "tab",
  "text": "General",
  "icon": null,
  "parentId": "tabs_1"
},
{
  "id": "some_button",
  "type": "button",
  "x": 8, "y": 4, "w": 60, "h": 20,
  "parentId": "general_tab"
}
```

The `tab_height` prop (default `20`) sets the selector row's thickness. A
`tab`'s `text`/`icon` fields are its selector label/icon. No new API is needed
for the common case — `onAction`/`on(...)` fire normally for widgets nested
inside any tab. Override `onTabSwitch` to react to a tab change:

```java
public class SettingsScreen extends SpecScreen {
    @Override
    protected void onTabSwitch(String tabsWidgetId, String tabId) {
        // e.g. refresh bindings specific to the newly active tab
    }
}
```

`SpecContainerScreen` does not support tabs.

---

## Items and Blocks

Beyond screens, the [MC Screen Designer](https://minecraft-mod-ui-builder.vercel.app/) web tool
can also export **Items** and **Blocks** — declarative properties only (name, texture, stack size,
rarity, durability, attribute modifiers, hardness, sound, ...), not a scripted power/ability
system. Exporting a project produces `assets/<modid>/screenspec/items.json` and `.../blocks.json`
manifests (each a JSON array) alongside generated model/blockstate JSON and the referenced
textures — extract the zip straight into your mod's `src/main/resources/`.

**No Java code required.** `ScreenSpecMod` (this library's own `@Mod` entry point) auto-discovers,
at mod-construction time, every loaded mod that ships an `items.json`/`blocks.json` manifest and
registers the items/blocks for you via `ModContent`. A mod using the web tool only needs to depend
on this library and drop the exported files into its resources — same workflow as a screen, just
without a keybind to trigger it.

### ItemSpec fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | registry name |
| `displayName` | string | shown literally (no lang file) |
| `texture` | string | pack texture key the web tool used |
| `category` | `"simple"` \| `"food"` \| `"armor"` | |
| `stackSize` | number | forced to 1 if `durability > 0` |
| `rarity` | `"common"` \| `"uncommon"` \| `"rare"` \| `"epic"` | |
| `fireResistant` | boolean | |
| `durability` | number | `0` = not damageable |
| `nutrition`, `saturation`, `alwaysEdible` | — | only when `category == "food"` |
| `armorSlot` | `"helmet"` \| `"chestplate"` \| `"leggings"` \| `"boots"` | only when `category == "armor"` — sets the `Equippable` component |
| `attributes` | `AttributeModifierSpec[]` | declarative stat modifiers — vanilla's data-driven `AttributeModifiers` item component, not scripted behavior |
| `creativeTab` | vanilla tab key, `"custom"`, or a project-defined tab id | see below |

`AttributeModifierSpec` is `{ attribute, amount, operation, slot }`:
- `attribute`: `generic.max_health`, `generic.attack_damage`, `generic.attack_speed`,
  `generic.armor`, `generic.armor_toughness`, `generic.movement_speed`,
  `generic.knockback_resistance`, or `generic.luck`.
- `operation`: `add_value` | `add_multiplied_base` | `add_multiplied_total` (vanilla's
  `AttributeModifier.Operation`).
- `slot`: a vanilla `EquipmentSlotGroup` key — `any`, `hand`, `mainhand`, `offhand`, `armor`,
  `head`, `chest`, `legs`, `feet`, or `body`.

Switching an item to `category: "armor"` in the web tool seeds one default `generic.armor`
modifier for the chosen slot; armor's actual defense/toughness/knockback-resistance are just
`attributes` entries like any other, not a separate stat system.

### BlockSpec fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | registry name |
| `displayName` | string | shown literally |
| `texture` | string | single texture applied to all 6 faces (`cube_all`) |
| `hardness`, `resistance` | number | `BlockBehaviour.Properties.strength(...)` |
| `requiresTool` | boolean | |
| `luminance` | number | 0-15 |
| `soundType` | `"stone"` \| `"wood"` \| `"metal"` \| `"gravel"` \| `"grass"` \| `"glass"` \| `"wool"` \| `"sand"` | |
| `hasItem` | boolean | also registers a plain `BlockItem` |
| `creativeTab` | vanilla tab key, `"custom"`, or a project-defined tab id | applies to the `BlockItem` |

### Custom Attributes

Beyond the curated vanilla attributes an item's `attributes` list already offers, a project can
define its own global attributes (the web tool's "Custom Attributes" sidebar section) —
`CustomAttributeSpec`:

| Field | Type | Notes |
|---|---|---|
| `id` | string | registry name, e.g. `"mana"` — referenceable from any item's `AttributeModifierSpec.attribute` |
| `displayName` | string | |
| `defaultBase`, `min`, `max` | number | `RangedAttribute(descriptionId, defaultBase, min, max)` |
| `sentiment` | `"positive"` \| `"neutral"` \| `"negative"` | tooltip color — vanilla's `Attribute.Sentiment` |
| `addToAllLiving` | boolean | adds the attribute (at `defaultBase`) to every living entity type via `EntityAttributeModificationEvent` |
| `addToPlayers` | boolean | same, but only `EntityTypes.PLAYER` — independent of `addToAllLiving` |

Registered via `assets/<modid>/screenspec/attributes.json` (same auto-discovery as items/blocks —
see `CustomAttributeSpec.java`/`CustomAttributeSpecLoader`/`CustomAttributeSpecs` in the
`sheepfromheaven.screenspec.runtime.attribute` package). Custom attributes are registered *before*
items, so an `ItemSpec.attributes` entry can reference either a vanilla key or a project-defined
custom attribute id interchangeably.

### Creative tabs

`creativeTab` is one of:
- a vanilla tab key (`BUILDING_BLOCKS`, `COLORED_BLOCKS`, `NATURAL_BLOCKS`, `FUNCTIONAL_BLOCKS`,
  `REDSTONE_BLOCKS`, `TOOLS_AND_UTILITIES`, `COMBAT`, `FOOD_AND_DRINKS`, `INGREDIENTS`,
  `SPAWN_EGGS`) — the item/block is added to that existing vanilla tab via
  `BuildCreativeModeTabContentsEvent`;
- `"custom"` (the default) — one tab shared by every item/block in the project that uses it,
  titled after `modId`;
- any other string — a project-defined named tab (the web tool's "Creative Tabs" sidebar section)
  gets its own `DeferredRegister<CreativeModeTab>` entry, titled after that id, icon = its first
  item/block.

### Effects and Potions

`EffectSpec` (a `MobEffect`) has `id`, `displayName`, `category` (`"beneficial"` | `"harmful"` |
`"neutral"`, vanilla's `MobEffectCategory`), `color` (hex, particle/swirl color), and `attributes`
— the *same* `AttributeModifierSpec[]` mechanism as `ItemSpec.attributes`, applied while the effect
is active and scaled per amplifier level by vanilla automatically (not a scripted power system).
Registered as an anonymous `MobEffect` subclass (its constructor is `protected` in this MC version
— no public `Builder`).

`PotionSpec` is a named bundle of effect instances — `effects: { effectId, durationSeconds,
amplifier }[]`, where `effectId` is a fully-qualified vanilla id (`"minecraft:speed"`) or a
project `EffectSpec`'s bare id. Registers the `Potion` definition itself (so it exists and can be
referenced, e.g. via commands); wiring an actual brewing-stand recipe to produce it is out of
scope for now — part of the separate, later Crafting Recipes phase.

### Scope

No power/condition/trigger system (right-click abilities, cooldowns, skills) — attributes are the
only "behavior," and they're vanilla's own declarative component, shared by items and effects. No
custom block shapes yet (stairs/slabs/fences are a planned follow-up) — every block is a full
`cube_all`. No lang-file generation — display names are literal `Component`s. No brewing recipes
yet (see Potions above) — part of the later Crafting Recipes phase. No biomes or dimensions yet
either — both are a much larger, separate datapack/worldgen system, planned as their own follow-up
phase.

### Internals

- `sheepfromheaven.screenspec.runtime.item.{ItemSpec, ItemSpecLoader, ItemSpecs}` and the
  `.block` equivalents mirror `ScreenSpec`/`ScreenSpecLoader`'s Gson-POJO/classpath-loading
  pattern (see `GsonSpecIO`).
- `ModContent` is the orchestrator: registers custom attributes first (`CustomAttributeSpecs`),
  then builds `DeferredRegister.Items`/`.Blocks`, registers every item/block spec (threading the
  resolved attribute holders through), and wires creative-tab membership (an existing vanilla tab
  via `BuildCreativeModeTabContentsEvent`, or a `DeferredRegister<CreativeModeTab>` per named tab).
- None of `ItemSpecs`/`BlockSpecs`/`CustomAttributeSpecs`/`ModContent` are meant to be called
  directly by a consuming mod — `ScreenSpecMod` calls them automatically for every mod on the
  classpath.

---

## Known limitations

- **Z-order** is fixed: panels are drawn behind all interactive widgets;
  labels and icons are drawn in front. Arbitrary layering from the designer
  canvas is not yet supported.
- **`panel` and `icon` rendering** are intentional placeholders — real artwork
  is mod-specific; override `renderPanel` / `resolveIcon` for your textures.
- **`SpecContainerScreen`** doesn't yet support interactive widgets (button,
  toggle_button, input, slider) alongside slots — only `panel`/`label`/`icon`/
  `scrollbar` are handled. (`panel`/`label`/`icon` rendering, `text` bindings,
  and `bindText` are shared with `SpecScreen` via `SpecWidgetRenderer`, so
  those behave identically on both — only slot support is exclusive to
  `SpecContainerScreen`.) It also doesn't yet support a designer canvas widget
  for laying out slot areas visually; author the `container` JSON by hand for
  now.
- **Scrolling** is vertical-only (`scrollbar` widgets with `"axis": "x"`
  render but don't drive a horizontal scroll) and only wired up for
  `SpecContainerScreen` slot areas — not the slotless `SpecScreen` or the
  `list`/`scroll` widget types.
- **Porting to other MC versions** means updating `neo_version` and
  `minecraft_version` in `gradle.properties` and auditing API drift (e.g.
  `GuiGraphics.blit` changed signature between 1.21.1 and 1.21.5 — always
  verify against the actual decompiled jar via `javap`).

---

## Building locally

```
cd neoforge-runtime
./gradlew build               # produces build/libs/screenspec-neoforge-<version>.jar
./gradlew publishToMavenLocal # installs to ~/.m2 for local testing
```
