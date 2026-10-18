"use client";

import { useState, useRef, useEffect } from "react";
import { Network, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import BindingsTree from "@/components/BindingsTree";
import type { BindingsSchema } from "@/lib/types";

type Tab = "bindings" | "actions";

interface Props {
  schema: BindingsSchema;
  onChangeSchema: (schema: BindingsSchema) => void;
  actions: string[];
  onChangeActions: (actions: string[]) => void;
  modId?: string;
}

// ── Actions tab ──────────────────────────────────────────────────────────────

function ActionsTab({ actions, onChange, modId }: { actions: string[]; onChange: (a: string[]) => void; modId?: string }) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const v = draft.trim();
    if (!v || actions.includes(v)) return;
    onChange([...actions, v]);
    setDraft("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-3">
      {modId && (
        <p className="text-xs text-muted-foreground">
          Actions will be qualified as <code className="font-mono">{modId}.{"<action>"}</code> in Java.
        </p>
      )}

      {actions.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No actions defined yet.
        </p>
      )}

      <div className="flex flex-col gap-1">
        {actions.map((action, idx) => (
          <div key={idx} className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent">
            <span className="flex-1 font-mono text-xs">{action}</span>
            {modId && (
              <span className="text-xs text-muted-foreground shrink-0">{modId}.{action}</span>
            )}
            <button
              className="hidden group-hover:flex text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => onChange(actions.filter((_, i) => i !== idx))}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          className="flex-1 rounded border border-border bg-transparent px-2 py-1 text-xs focus:border-ring focus:outline-none"
          placeholder="action_name"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") add(); }}
        />
        <Button size="sm" variant="outline" onClick={add} disabled={!draft.trim()}>
          <Plus size={13} /> Add
        </Button>
      </div>
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export default function BindingsModal({ schema, onChangeSchema, actions, onChangeActions, modId }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("bindings");
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleOpen = () => {
    setJsonMode(false);
    setJsonError(null);
    setOpen(true);
  };

  const enterJsonMode = () => {
    const payload = tab === "bindings" ? schema : actions;
    setJsonText(JSON.stringify(payload, null, 2));
    setJsonError(null);
    setJsonMode(true);
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (tab === "bindings") {
        onChangeSchema(parsed as BindingsSchema);
      } else {
        if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of strings");
        onChangeActions(parsed as string[]);
      }
      setJsonError(null);
      setJsonMode(false);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  const scopeNote = modId
    ? `Properties are qualified as ${modId}.<name> in Java`
    : "Set a modId in settings to enable scoped path generation";

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 w-7 px-0" title="Edit bindings schema" onClick={handleOpen}>
        <Network className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex flex-col gap-0 p-0 sm:max-w-lg max-h-[80vh]">

          {/* header */}
          <DialogHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-3 border-b shrink-0">
            <DialogTitle>Data Schema</DialogTitle>
            <div className="flex items-center gap-2">
              {jsonMode ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setJsonMode(false)}>Cancel</Button>
                  <Button size="sm" onClick={applyJson}>Apply</Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={enterJsonMode}>Edit as JSON</Button>
              )}
            </div>
          </DialogHeader>

          {/* tabs */}
          {!jsonMode && (
            <div className="flex border-b shrink-0">
              {(["bindings", "actions"] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-xs font-medium capitalize border-b-2 -mb-px transition-colors ${
                    tab === t
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
                  {t === "bindings" && Object.keys(schema).length > 0 && (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs">{Object.keys(schema).length}</span>
                  )}
                  {t === "actions" && actions.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs">{actions.length}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* scope note */}
          {!jsonMode && tab === "bindings" && (
            <p className="px-4 pt-3 pb-0 text-xs text-muted-foreground">{scopeNote}</p>
          )}

          {/* body */}
          <div className="flex-1 overflow-y-auto p-4">
            {jsonMode ? (
              <div className="flex flex-col gap-2">
                <textarea
                  className="w-full rounded border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:border-ring resize-none"
                  rows={20}
                  value={jsonText}
                  onChange={e => { setJsonText(e.target.value); setJsonError(null); }}
                  spellCheck={false}
                />
                {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
              </div>
            ) : tab === "bindings" ? (
              <>
                {Object.keys(schema).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No bindings defined yet. Add a property below to get started.
                  </p>
                )}
                <BindingsTree schema={schema} onChange={onChangeSchema} />
              </>
            ) : (
              <ActionsTab actions={actions} onChange={onChangeActions} modId={modId} />
            )}
          </div>

        </DialogContent>
      </Dialog>
    </>
  );
}
