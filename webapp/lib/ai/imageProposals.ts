"use client";

/**
 * Pictures the chat agent asked for (editorTools `generate_image`). Generation takes a minute or
 * more, longer than an MCP tool call may block, so the tool only starts it: the picture appears as
 * "generating" right away and fills in when it's done — no matter whether the agent run has
 * finished by then. The chat (lib/ai/chatStore) attaches the proposals of a run to its answer and
 * follows their updates; the user adds a finished picture to Resources (folder "KI") or discards it.
 */
export interface ImageProposal {
  id: string;
  name: string;
  /** empty while generating */
  dataUrl: string;
  status: "generating" | "pending" | "failed";
  error?: string;
  /** apply as this texture when added: a built-in record (items, blocks, …) or a generic element */
  assign?: { collection: string; id: string; field: string };
  /** scale to this many pixels (square) when added, e.g. 16 for an item texture */
  size?: number;
}

let fresh: ImageProposal[] = [];
const listeners = new Set<(p: ImageProposal) => void>();

/** Starts tracking new proposals (shown as "generating" until `updateImageProposal`). */
export function proposeImages(images: ImageProposal[]) {
  fresh = [...fresh, ...images];
}

/** A generation finished (or failed): updates the proposal wherever it is shown. */
export function updateImageProposal(id: string, patch: Partial<ImageProposal>) {
  fresh = fresh.map((p) => (p.id === id ? { ...p, ...patch } : p));
  const p = fresh.find((x) => x.id === id);
  listeners.forEach((l) => l(p ?? ({ id, ...patch } as ImageProposal)));
}

export function onImageProposalUpdate(fn: (p: ImageProposal) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Takes (and stops listing) everything proposed since the last call. */
export function takeImageProposals(): ImageProposal[] {
  const out = fresh;
  fresh = [];
  return out;
}
