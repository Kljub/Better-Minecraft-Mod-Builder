"use client";

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VANILLA_MOBS, vanillaLabel, type VanillaMob } from "@/lib/model3d/vanillaImport";
import { BEDROCK_SAMPLES_COMMIT } from "@/lib/model3d/vanillaMobs";

const textureUrl = (mob: VanillaMob) => `https://raw.githubusercontent.com/Mojang/bedrock-samples/${BEDROCK_SAMPLES_COMMIT}/resource_pack/${mob.texture}`;

/** Picks a vanilla mob to start an Entity Model from (geometry + texture from Mojang's bedrock-samples). */
export default function VanillaMobDialog({ open, onOpenChange, onPick }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** resolves true when imported (false = cancelled by the user) */
  onPick: (mob: VanillaMob) => Promise<boolean>;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/\s+/g, "_");
    return VANILLA_MOBS.filter((m) => m.id.includes(s));
  }, [q]);

  const pick = async (mob: VanillaMob) => {
    setBusy(mob.id);
    setError(null);
    try {
      if (await onPick(mob)) onOpenChange(false);
    } catch (e) {
      setError(`${vanillaLabel(mob.id)}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl" data-testid="vanilla-mob-dialog">
        <DialogHeader><DialogTitle>Start from a Minecraft mob</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${VANILLA_MOBS.length} mobs… (zombie, iron golem)`} className="h-8 pl-7 text-xs" aria-label="Search mobs" />
        </div>
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-1.5 overflow-y-auto pr-1">
          {shown.map((m) => (
            <button key={m.id} type="button" disabled={!!busy} onClick={() => void pick(m)} title={m.id}
              className="flex flex-col items-center gap-1 rounded-sm border border-transparent p-1.5 text-[11px] enabled:hover:border-input enabled:hover:bg-accent disabled:opacity-60">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-sm bg-[var(--rail)]">
                {busy === m.id ? <Loader2 className="h-5 w-5 animate-spin" />
                  : m.texture.endsWith(".png")
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={textureUrl(m)} alt="" loading="lazy" className="h-14 w-14 object-contain" style={{ imageRendering: "pixelated" }} />
                    : <span className="text-[9px] text-muted-foreground">TGA</span>}
              </div>
              <span className="w-full truncate text-center">{vanillaLabel(m.id)}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Models and textures are loaded from Mojang&apos;s official <a className="underline" href="https://github.com/Mojang/bedrock-samples" target="_blank" rel="noreferrer">bedrock-samples</a> (© Mojang, Minecraft EULA).
          Use them as a starting point — repaint the texture before you publish a mod with it.
        </p>
      </DialogContent>
    </Dialog>
  );
}
