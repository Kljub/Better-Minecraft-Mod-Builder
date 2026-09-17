"use client";

import React, { useState, useEffect, useRef } from "react";
import type { WidgetSpec, BindingsSchema } from "@/lib/types";
import { getWidgetDef } from "@/lib/widgetRegistry";
import { getBindingNode, getPathsByType } from "@/components/BindingsTree";
import type { BindingType } from "@/lib/types";
import { useTextures } from "@/lib/TextureContext";
import TexturePickerModal from "@/components/TexturePickerModal";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, NumInput, Toggle, PropSelect } from "@/components/SchemaFields";
import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";

const BINDING_TARGETS: Record<string, string[]> = {
  button:        ["text", "enabled", "visible"],
  toggle_button: ["text", "enabled", "visible"],
  checkbox:      ["enabled", "visible"],
  input:         ["text", "enabled", "visible"],
  slider:        ["enabled", "visible"],
  label:         ["text", "visible"],
  panel:         ["visible"],
  progress:      ["value", "visible"],
  requirement:   ["satisfied", "visible"],
};

const BINDING_TARGET_TYPES: Record<string, BindingType> = {
  text:      "string",
  enabled:   "boolean",
  visible:   "boolean",
  value:     "number",
  satisfied: "boolean",
};

function argbIntToHex(val: number): string {
  return "#" + (val & 0xffffff).toString(16).padStart(6, "0");
}

function hexToArgbInt(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

interface Props {
  widget: WidgetSpec | null;
  onUpdate: (w: WidgetSpec) => void;
  bindingsSchema: BindingsSchema;
  actions: string[];
  onCreateAction?: (name: string) => void;
  inventoryAreaIds?: string[];
}

export default function PropertyPanel({ widget, onUpdate, bindingsSchema, actions, onCreateAction, inventoryAreaIds = [] }: Props) {
  if (!widget) {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground italic">
        Select a widget to edit its properties.
      </div>
    );
  }

  const { packTextures, uploadCustomTexture } = useTextures();
  const [texPickerOpen, setTexPickerOpen] = useState(false);
  const def = getWidgetDef(widget.type);

  const set = (patch: Partial<WidgetSpec>) => onUpdate({ ...widget, ...patch });
  const setProp = (key: string, value: string) => onUpdate({ ...widget, props: { ...widget.props, [key]: value } });

  const bindings = widget.bindings ?? {};
  const setBinding = (target: string, providerId: string) =>
    onUpdate({ ...widget, bindings: { ...bindings, [target]: providerId } });
  const removeBinding = (target: string) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [target]: _removed, ...rest } = bindings;
    onUpdate({ ...widget, bindings: Object.keys(rest).length ? rest : undefined });
  };

  const changeBindingTarget = (oldTarget: string, newTarget: string) => {
    const value = bindings[oldTarget];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [oldTarget]: _removed, ...rest } = bindings;
    onUpdate({ ...widget, bindings: { ...rest, [newTarget]: value } });
  };

  const availableTargets = BINDING_TARGETS[widget.type] ?? [];
  const unusedTargets = availableTargets.filter((t) => !(t in bindings));

  const propSchema = def?.propSchema ?? [];

  // Collect indices of min/max pairs to render them side by side
  const minIdx = propSchema.findIndex((f) => f.key === "min");
  const maxIdx = propSchema.findIndex((f) => f.key === "max");
  const pairedMinMax = minIdx !== -1 && maxIdx === minIdx + 1;

  return (
    <div className="flex flex-col gap-1 p-2 text-xs overflow-y-auto">
      <div className="font-bold text-foreground mb-1 uppercase tracking-wide">{def?.label ?? widget.type}</div>

      <Field label="ID">
        <Input
          className="h-6 text-xs px-1.5"
          value={widget.id}
          onChange={(e) => set({ id: e.target.value })}
        />
      </Field>

      {widget.type !== "group" && widget.type !== "tab" && (
        <div className="grid grid-cols-2 gap-1">
          <Field label="X"><NumInput value={widget.x} onChange={(v) => set({ x: v })} /></Field>
          <Field label="Y"><NumInput value={widget.y} onChange={(v) => set({ y: v })} /></Field>
          {!(widget.type === "scrollbar" && (widget.props.axis ?? "y") === "y") && (
            <Field label="W"><NumInput value={widget.w} onChange={(v) => set({ w: v })} /></Field>
          )}
          {!(widget.type === "scrollbar" && widget.props.axis === "x") && (
            <Field label="H"><NumInput value={widget.h} onChange={(v) => set({ h: v })} /></Field>
          )}
        </div>
      )}

      {widget.type !== "group" && widget.type !== "checkbox" && (
        <Field label="Text">
          <Input
            className={`h-6 text-xs px-1.5 ${bindings.text ? "text-blue-500 italic" : ""}`}
            value={bindings.text ? bindings.text : (widget.text ?? "")}
            disabled={!!bindings.text}
            onChange={(e) => set({ text: e.target.value })}
          />
        </Field>
      )}

      {(widget.type === "requirement" || widget.type === "button" || widget.type === "toggle_button") && (
        <Field label="Icon">
            <div className="flex flex-col gap-1">
              <button
                title="Change icon"
                onClick={() => setTexPickerOpen(true)}
                className="w-full rounded border border-input hover:border-ring overflow-hidden transition-colors cursor-pointer"
                style={{ background: "#555", aspectRatio: widget.icon && packTextures[widget.icon] ? undefined : "16/9" }}
              >
                {widget.icon && packTextures[widget.icon] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={packTextures[widget.icon]}
                    alt=""
                    draggable={false}
                    style={{ width: "100%", height: "100%", objectFit: "contain", imageRendering: "pixelated", display: "block" }}
                  />
                ) : (
                  <span className="flex items-center justify-center py-4 text-xs text-muted-foreground">Pick icon…</span>
                )}
              </button>
              {widget.icon && (
                <div className="flex items-center gap-1">
                  <p className="flex-1 min-w-0 text-[10px] text-muted-foreground truncate">{widget.icon}</p>
                  <button
                    title="Remove icon"
                    onClick={() => set({ icon: null })}
                    className="shrink-0 text-[10px] text-muted-foreground hover:text-destructive px-1"
                  >
                    ✕
                  </button>
                </div>
              )}
              <TexturePickerModal
                open={texPickerOpen}
                packTextures={packTextures}
                current={widget.icon ?? ""}
                onSelect={(k) => { set({ icon: k }); setTexPickerOpen(false); }}
                onClose={() => setTexPickerOpen(false)}
                onUpload={uploadCustomTexture}
              />
            </div>
        </Field>
      )}

      {propSchema.length > 0 && (
        <>
          <div className="font-semibold text-muted-foreground mt-1">Widget Props</div>
          {(() => {
            const rendered = new Set<number>();
            return propSchema.map((field, i) => {
              if (rendered.has(i)) return null;
              const currentValue = widget.props[field.key] ?? field.defaultValue ?? "";

              // Scrollbar axis — special swap logic
              if (widget.type === "scrollbar" && field.key === "axis") {
                return (
                  <Field key={field.key} label={field.label}>
                    <PropSelect
                      value={currentValue}
                      options={field.options ?? []}
                      onChange={(newAxis) => {
                        if (newAxis !== currentValue) {
                          const newW = widget.h, newH = widget.w;
                          const [newX, newY] = newAxis === "x"
                            ? [widget.x - newW, widget.y + widget.h]
                            : [widget.x + widget.w, widget.y - newH];
                          onUpdate({ ...widget, x: newX, y: newY, w: newW, h: newH, props: { ...widget.props, axis: newAxis } });
                        }
                      }}
                    />
                  </Field>
                );
              }

              // Scrollbar target — inventory area picker
              if (widget.type === "scrollbar" && field.key === "target") {
                const opts = inventoryAreaIds.map((id) => ({ value: id, label: id }));
                const hasOrphan = !!currentValue && !inventoryAreaIds.includes(currentValue);
                return (
                  <Field key={field.key} label={field.label}>
                    <PropSelect
                      value={currentValue}
                      options={["", ...inventoryAreaIds]}
                      labels={{ "": "(none)", ...(hasOrphan ? { [currentValue]: `${currentValue} ⚠` } : {}) }}
                      onChange={(v) => setProp(field.key, v)}
                      extraOptions={hasOrphan ? [currentValue] : []}
                    />
                  </Field>
                );
              }

              // Sprite texture picker
              if (widget.type === "sprite" && field.key === "src") {
                return (
                  <Field key={field.key} label={field.label}>
                      <div className="flex flex-col gap-1">
                        <button
                          title="Change texture"
                          onClick={() => setTexPickerOpen(true)}
                          className="w-full rounded border border-input hover:border-ring overflow-hidden transition-colors cursor-pointer"
                          style={{ background: "#555", aspectRatio: currentValue && packTextures[currentValue] ? undefined : "16/9" }}
                        >
                          {currentValue && packTextures[currentValue] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={packTextures[currentValue]}
                              alt=""
                              draggable={false}
                              style={{ width: "100%", height: "100%", objectFit: "contain", imageRendering: "pixelated", display: "block" }}
                            />
                          ) : (
                            <span className="flex items-center justify-center py-4 text-xs text-muted-foreground">Pick texture…</span>
                          )}
                        </button>
                        {currentValue && (
                          <p className="text-[10px] text-muted-foreground truncate">{currentValue}</p>
                        )}
                        <TexturePickerModal
                          open={texPickerOpen}
                          packTextures={packTextures}
                          current={currentValue}
                          onSelect={(k) => {
                            const url = packTextures[k];
                            if (url) {
                              const img = new Image();
                              img.onload = () => onUpdate({
                                ...widget,
                                props: { ...widget.props, [field.key]: k },
                                w: img.naturalWidth,
                                h: img.naturalHeight,
                              });
                              img.src = url;
                            } else {
                              setProp(field.key, k);
                            }
                          }}
                          onClose={() => setTexPickerOpen(false)}
                          onUpload={uploadCustomTexture}
                        />
                      </div>
                  </Field>
                );
              }

              // Color picker — only for numeric ARGB color props. A "color"-named field can also
              // be a select of preset names (e.g. boss_bar's pink/blue/...), which must fall
              // through to the generic select-dropdown branch below instead.
              if (field.type !== "select" && (field.key === "color" || field.key === "color_met" || field.key === "color_unmet")) {
                const colorInt = parseInt(currentValue, 10) || 0;
                return (
                  <Field key={field.key} label={field.label}>
                    <ColorField value={colorInt} onChange={(v) => setProp(field.key, String(v))} />
                  </Field>
                );
              }

              // Boolean toggle
              if (field.type === "boolean" || (field.type === "select" && field.options?.join(",") === "true,false")) {
                const checked = currentValue === "true";
                return (
                  <div key={field.key} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{field.label}</span>
                    <Toggle checked={checked} onChange={(v) => setProp(field.key, String(v))} />
                  </div>
                );
              }

              // Alignment icon buttons
              if (field.key === "align") {
                return (
                  <Field key={field.key} label={field.label}>
                    <div className="flex gap-1">
                      {(["left", "center", "right"] as const).map((opt) => (
                        <button
                          key={opt}
                          title={opt}
                          onClick={() => setProp(field.key, opt)}
                          className={`flex items-center justify-center rounded p-1 border transition-colors ${
                            currentValue === opt
                              ? "bg-accent border-ring text-accent-foreground"
                              : "border-input text-muted-foreground hover:border-ring hover:text-foreground"
                          }`}
                        >
                          {opt === "left" && <AlignLeft className="h-3 w-3" />}
                          {opt === "center" && <AlignCenter className="h-3 w-3" />}
                          {opt === "right" && <AlignRight className="h-3 w-3" />}
                        </button>
                      ))}
                    </div>
                  </Field>
                );
              }

              // Min + Max side by side
              if (pairedMinMax && field.key === "min") {
                const maxField = propSchema[maxIdx];
                const maxValue = widget.props[maxField.key] ?? maxField.defaultValue ?? "";
                rendered.add(maxIdx);
                return (
                  <div key="min-max" className="grid grid-cols-2 gap-1">
                    <Field label="Min"><NumInput value={parseInt(currentValue, 10) || 0} onChange={(v) => setProp(field.key, String(v))} /></Field>
                    <Field label="Max"><NumInput value={parseInt(maxValue, 10) || 0} onChange={(v) => setProp(maxField.key, String(v))} /></Field>
                  </div>
                );
              }

              // Select
              if (field.type === "select") {
                return (
                  <Field key={field.key} label={field.label}>
                    <PropSelect
                      value={currentValue}
                      options={field.options ?? []}
                      onChange={(v) => setProp(field.key, v)}
                    />
                  </Field>
                );
              }

              // Number or text
              return (
                <Field key={field.key} label={field.label}>
                  <Input
                    className="h-6 text-xs px-1.5"
                    type={field.type === "number" ? "number" : "text"}
                    value={currentValue}
                    onChange={(e) => setProp(field.key, e.target.value)}
                  />
                </Field>
              );
            });
          })()}
        </>
      )}

      {widget.type !== "group" && (
        <Field label="Action">
          <ActionSelect
            value={widget.action ?? ""}
            actions={actions}
            onChange={(v) => set({ action: v || undefined })}
            onCreateAction={onCreateAction}
          />
        </Field>
      )}

      {availableTargets.length > 0 && (
        <>
          <div className="font-semibold text-muted-foreground mt-1">Bindings</div>
          {Object.entries(bindings).map(([target, path]) => {
            const expectedType = BINDING_TARGET_TYPES[target] ?? "string";
            const paths = getPathsByType(bindingsSchema, expectedType);
            const currentNode = getBindingNode(bindingsSchema, path);
            const currentCompatible = !path || (currentNode?.type ?? "string") === expectedType;
            return (
              <div key={target} className="flex gap-1 items-center">
                <select
                  className="shrink-0 rounded border border-input bg-background px-1 py-0.5 text-xs text-foreground focus:outline-none"
                  value={target}
                  onChange={(e) => changeBindingTarget(target, e.target.value)}
                >
                  {availableTargets
                    .filter((t) => t === target || !(t in bindings))
                    .map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  className={`w-full rounded border px-1 py-0.5 text-xs bg-background text-foreground focus:outline-none ${!currentCompatible ? "border-orange-400" : "border-input"}`}
                  value={path}
                  onChange={(e) => setBinding(target, e.target.value)}
                >
                  {paths.length === 0 && (
                    <option value="" disabled>No {expectedType} bindings defined</option>
                  )}
                  {!paths.includes(path) && path && (
                    <option value={path}>{path} ⚠ wrong type</option>
                  )}
                  {paths.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <button
                  className="shrink-0 text-muted-foreground hover:text-destructive px-1"
                  onClick={() => removeBinding(target)}
                >✕</button>
              </div>
            );
          })}
          {unusedTargets.length > 0 && (() => {
            const firstTarget = unusedTargets[0];
            const expectedType = BINDING_TARGET_TYPES[firstTarget] ?? "string";
            const paths = getPathsByType(bindingsSchema, expectedType);
            return (
              <button
                className="w-full rounded border border-dashed border-input py-0.5 text-muted-foreground hover:border-foreground/40 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={paths.length === 0}
                onClick={() => setBinding(firstTarget, paths[0])}
              >
                {paths.length === 0 ? `Define a ${expectedType} binding first` : "+ Add binding"}
              </button>
            );
          })()}
        </>
      )}
    </div>
  );
}

// Native <input type="color"> fires React's onChange on every intermediate value while
// dragging inside the picker (it maps onChange to the DOM "input" event, not "change") — that's
// dozens of events per drag. Committing straight to onChange means dozens of full history pushes
// + app re-renders per drag, which is what made this feel slow. Track the swatch locally for
// instant visual feedback and debounce the actual commit so dragging only produces one commit
// once it pauses (plus a final flush on blur, in case the user tabs away mid-drag).
function ColorField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hex, setHex] = useState(() => argbIntToHex(value));
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setHex(argbIntToHex(value)); }, [value]);
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={hex}
        onChange={(e) => {
          const h = e.target.value;
          setHex(h);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => onChange(hexToArgbInt(h)), 150);
        }}
        onBlur={() => {
          if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
          onChange(hexToArgbInt(hex));
        }}
        className="h-6 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
      />
      <span className="text-[10px] text-muted-foreground">{hex}</span>
    </div>
  );
}

function ActionSelect({
  value,
  actions,
  onChange,
  onCreateAction,
}: {
  value: string;
  actions: string[];
  onChange: (v: string) => void;
  onCreateAction?: (name: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  if (creating) {
    const confirm = () => {
      const name = draft.trim();
      if (name) onCreateAction?.(name);
      setCreating(false);
      setDraft("");
    };
    return (
      <div className="flex gap-1">
        <Input
          autoFocus
          className="h-6 text-xs px-1.5 flex-1"
          placeholder="action name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirm();
            if (e.key === "Escape") { setCreating(false); setDraft(""); }
          }}
        />
        <button
          className="shrink-0 text-xs px-1.5 rounded border border-input bg-background hover:bg-accent"
          onClick={confirm}
        >
          Add
        </button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={(v) => {
      if (v === "__create__") { setCreating(true); }
      else onChange(v ?? "");
    }}>
      <SelectTrigger size="sm" className="w-full h-6 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="" className="text-xs py-0.5">
          <span className="text-muted-foreground">(none)</span>
        </SelectItem>
        {actions.map((a) => (
          <SelectItem key={a} value={a} className="text-xs py-0.5">{a}</SelectItem>
        ))}
        {onCreateAction && (
          <SelectItem value="__create__" className="text-xs py-0.5 text-muted-foreground italic">
            + Create new action…
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
