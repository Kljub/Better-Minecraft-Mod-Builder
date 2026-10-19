"use client";

import { useEffect, useEffectEvent } from "react";
import { useAccount } from "@/components/AuthGate";

/**
 * Picks up structures the Minecraft companion mod uploaded (/mmb generate, /mmb upload): polls
 * /api/mod/inbox while an editor is open, claims each new one and hands its .nbt to the Structures
 * tab. Renders nothing; only active when logged in.
 */
const POLL_MS = 5_000;

export default function ModStructureInbox({ projectKey, onFiles }: { projectKey: string; onFiles: (files: File[]) => void | Promise<void> }) {
  const user = useAccount();
  const deliver = useEffectEvent((files: File[]) => onFiles(files));

  useEffect(() => {
    if (!user) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const res = await fetch(`/api/mod/inbox?project=${encodeURIComponent(projectKey)}`, { cache: "no-store" });
        const items: { id: number; name: string }[] = res.ok ? (await res.json()).items ?? [] : [];
        const files: File[] = [];
        for (const item of items) {
          if (stopped) return;
          const claim = await fetch(`/api/mod/inbox?id=${item.id}`, { method: "POST" });
          if (claim.ok) files.push(new File([await claim.arrayBuffer()], `${item.name}.nbt`));
        }
        if (files.length && !stopped) await deliver(files);
      } catch { /* offline — try again next round */ }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [user, projectKey]);

  return null;
}
