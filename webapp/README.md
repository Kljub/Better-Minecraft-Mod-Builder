This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Item Skin Generator

The "Item Skin Generator" rail entry makes 16×16 item textures (from text, a base texture or as a
material set) and 64×64 player skins with a 3D preview; the "Block Generator" entry makes block textures
from 16×16 up to 256×256 (seamless); the "Armor Generator" entry makes whole armor sets (both worn body
layers + four icons) previewed on a 3D player; the "Screen GUI Generator" makes GUI backgrounds (new
panels at a chosen size, or restyling an existing GUI texture while keeping its slots) with either Codex's
image generation (`/api/gui/codex`, the dev machine's Codex CLI login, ~40 s per image) or the local SD 1.5
server, and drops them into a screen as a background sprite. Results go into Resources and can be applied straight to an
item, block or armor set. Models and licences:
`tools/skin-generator/README.md`. `app/api/skin/generate` runs them on one of two backends, picked in the
tab (block textures and player skins are local only):

- **Local GPU** — `tools/skin-generator/server.py` on this machine, started/stopped from the tab
  (dev server only). One-time setup: see `tools/skin-generator/README.md`.
- **HF Space** — the public demo Space on shared ZeroGPU; anonymous callers run out of quota after a
  handful of generations. `HF_TOKEN=hf_...` raises it, `SKIN_GENERATOR_SPACE_URL` points at a duplicate.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
