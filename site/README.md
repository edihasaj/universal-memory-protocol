# Agent Memory Protocol — docs site

Astro + [Starlight](https://starlight.astro.build). Distinctive ember-on-ink
theme (Space Grotesk / Hanken Grotesk / JetBrains Mono).

```bash
pnpm install
pnpm dev       # local dev at http://localhost:4321
pnpm build     # static output → ./dist
pnpm preview   # serve the build
```

## Deploy to Cloudflare Pages

Static output, no adapter needed.

- **Build command:** `pnpm build`
- **Build output directory:** `dist`
- **Root directory:** `site`
- **Node version:** 20+ (set `NODE_VERSION=20` if needed)

Domain: point `agentmemoryprotocol.io` (and `www`) at the Pages project. Other
TLDs (`.org`, `.dev`, `.ai`) are also reserved-available — redirect them to the
canonical `.io` via Cloudflare Bulk Redirects.

Content lives in `src/content/docs/`. The full specification, rationale, and
adoption pages are generated from the repo-root `SPEC.md`, `docs/RATIONALE.md`,
and `docs/ADOPTION.md` — keep those as the source of truth.
