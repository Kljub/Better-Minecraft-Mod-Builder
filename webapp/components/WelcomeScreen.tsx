"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, FolderOpen } from "lucide-react";
import { AccountMenu } from "@/components/AuthGate";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ProjectSummary {
  key: string;
  screenId: string;
  modId?: string;
  updatedAt: number;
}

interface Props {
  projects: ProjectSummary[];
  onOpenProject: (key: string) => void;
  onCreateProject: (modId: string, screenId: string) => void;
  onLoadProject?: (file: File) => void;
  onDeleteProject?: (key: string) => void;
  onEditTestScreen?: () => void;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function WelcomeScreen({ projects, onOpenProject, onCreateProject, onLoadProject, onDeleteProject, onEditTestScreen }: Props) {
  const [open, setOpen] = useState(false);
  const [modId, setModId] = useState("");
  const [screenId, setScreenId] = useState("main");
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);

  const canCreate = modId.trim().length > 0;

  const submit = () => {
    if (!canCreate) return;
    onCreateProject(modId.trim(), screenId.trim() || "main");
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-background">
      <div className="absolute right-4 top-3"><AccountMenu /></div>
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">MC Screen Designer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visual designer for Minecraft mod GUI screens
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card px-10 py-8 shadow-sm w-full max-w-sm">
        {projects.length === 0 ? (
          <>
            <div className="text-5xl select-none">🗂️</div>
            <p className="text-sm text-muted-foreground">No projects yet</p>
          </>
        ) : (
          <div className="flex flex-col gap-2 w-full">
            {projects.map((p) => (
              <div
                key={p.key}
                className="group flex items-center justify-between rounded-lg border bg-background pl-4 pr-2 py-3 hover:bg-accent hover:text-accent-foreground transition-colors w-full"
              >
                <button
                  onClick={() => onOpenProject(p.key)}
                  className="flex-1 text-left min-w-0"
                >
                  <p className="text-sm font-medium truncate">{p.screenId || "(unnamed)"}</p>
                  {p.modId && (
                    <p className="text-xs text-muted-foreground truncate">{p.modId}</p>
                  )}
                </button>
                <span className="text-xs text-muted-foreground shrink-0 ml-4">
                  {relativeTime(p.updatedAt)}
                </span>
                {onDeleteProject && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-2 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete project ${p.screenId || "(unnamed)"}`}
                    onClick={(e) => { e.stopPropagation(); setPendingDelete(p); }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <Button className="w-full" onClick={() => setOpen(true)}>+ New Project</Button>
        {onLoadProject && (
          <>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => loadInputRef.current?.click()}
            >
              <FolderOpen className="mr-2 size-4" />
              Load Project
            </Button>
            <input
              ref={loadInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onLoadProject(file);
                e.target.value = "";
              }}
            />
          </>
        )}
        {process.env.NODE_ENV === "development" && onEditTestScreen && (
          <Button className="w-full" variant="outline" onClick={onEditTestScreen}>
            Edit test screen
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="modId">
                Mod ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="modId"
                autoFocus
                placeholder="e.g. my_mod"
                value={modId}
                onChange={(e) => setModId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <p className="text-xs text-muted-foreground">
                Your mod's namespace — qualifies binding and action IDs automatically
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="screenId">First screen ID</Label>
              <Input
                id="screenId"
                placeholder="main"
                value={screenId}
                onChange={(e) => setScreenId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!canCreate} onClick={submit}>
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingDelete !== null} onOpenChange={(v) => { if (!v) setPendingDelete(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground py-2">
            {pendingDelete && `"${pendingDelete.screenId || "(unnamed)"}"`} will be permanently deleted. This can&apos;t be undone.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDelete) onDeleteProject?.(pendingDelete.key);
                setPendingDelete(null);
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
