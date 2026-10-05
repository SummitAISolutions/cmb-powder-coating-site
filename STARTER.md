# Summit Website Starter (Visual System v1)

The technical starter for Summit client websites: **Astro + Tailwind CSS v4
(CSS-first) + TypeScript**, static output, driven by a per-client
`visual/DESIGN.md`.

It provides **engineering capability, not a look.** It ships no visual
identity, no section library and no client content. The placeholder page and
greyscale placeholder theme exist only so the starter builds and renders.

## Layout

| Path | What it is |
| --- | --- |
| `AGENTS.md` / `CLAUDE.md` | Canonical, standalone agent instructions / Claude Code bridge (`@AGENTS.md`). |
| `facts.md`, `RESEARCH.md`, `RESOURCES.md`, `INPUT_MANIFEST.md` | The source package. `facts.md` is the only source of client facts (facts contract v2: the seed's template, migrated); the other three are byte-identical to `templates/repo-seed`. `EXPERIMENT.md` is added by Stage 1. |
| `truth/` | The truth package around `facts.md`: `sources.json` (where the source material lives), `provenance.json` (where each fact came from) and the generated `truth.json`. See `truth/README.md`. |
| `src/lib/truth/`, `src/lib/format/` | The source truth contract (facts v2, sources, completeness, claims, route differentiation) and the phone formatter. |
| `.agents/skills/`, `.claude/skills/` | Generated skill mirrors. Never edit. |
| `visual/` | The visual contract: reference analysis, direction, DESIGN.md, image plan, critique. See `visual/README.md`. |
| `src/styles/global.css` | Stylesheet entry: Tailwind, generated theme, base mechanics. |
| `src/styles/theme.generated.css` | GENERATED from `visual/DESIGN.md`. Never edit. |
| `src/styles/base.css` | Reset/base, fluid type roles, section rhythm, focus, reduced motion. Reads token roles only. |
| `src/components/primitives/` | Low-level layout, media, action, form, proof and navigation primitives, plus `Breadcrumbs`, `EntityFact` and `LeadForm`. |
| `src/layouts/BaseLayout.astro` | Document shell, landmarks and the technical SEO head (from `search/`). |
| `src/pages/index.astro` | `[STARTER PLACEHOLDER]` — replace entirely. |
| `src/pages/404.astro` | `[STARTER PLACEHOLDER]` custom 404 — keep it, reword it. |
| `src/pages/sitemap.xml.ts`, `src/pages/robots.txt.ts` | Generated from `search/`. |
| `search/` | Local search contract: `business-entity.json`, `site.json`. See `search/README.md`. |
| `src/lib/local-search/` | The local search contract code (entity, facts reconciliation, site, JSON-LD, checks). |
| `scripts/local-search/check.mjs` | `search:check` (before the build) and `search:verify` (on `dist/`). |
| `src/lib/leads/` | Summit Standard Lead Adapter v1: the lead contract (shared with the browser), destinations, adapters (test sink, webhook), idempotency store, the endpoint handler, the browser client. |
| `functions/api/lead.js` | Cloudflare Pages Function: the `/api/lead` endpoint (deployed with the site by Stage 3). |
| `scripts/leads/local-server.mjs` | `npm run local` / `leads:local`: the built site plus the real lead endpoint and a local test sink (`.summit-leads/`). |
| `scripts/visual/design-md.mjs` | DESIGN.md adapter: `status`, `check`, `export`. The only code aware of `@google/design.md`. |
| `scripts/visual/screenshots.mjs` | Screenshot harness over the built `dist/`. |
| `public/` | Static files served as-is. |

## Commands

```sh
npm install              # exact-pinned dependencies (package-lock.json)
npm run visual:status    # where each visual artifact is in its lifecycle, incl. approval validity
npm run visual:hash      # print the approval content hash of visual/visual-direction.md (read-only)
npm run design:check     # validate artifacts + approval gate + DESIGN.md lint + theme freshness + no raw literals
npm run design:export    # DESIGN.md -> src/styles/theme.generated.css (refuses without approval)
npm run search:check     # business-entity.json <-> facts.md, search/site.json
npm run typecheck        # astro check
npm run build            # design:check + search:check, static site -> dist/, then search:verify (a noindex PREVIEW build)
SUMMIT_SITE_ENV=production npm run build   # production build: indexable routes indexable
npm run screenshots      # dist/ -> visual/screenshots/ (needs Chromium: npx playwright install chromium)
npm run local            # build, then serve dist/ with the real lead endpoint (prints the local URL)
```

Node `>=22.12` (Astro 7). Every dependency is pinned to an exact version.

## Token roles the primitives read

| Group | Required roles |
| --- | --- |
| colors | `surface`, `on-surface`, `on-surface-muted`, `primary`, `on-primary`, `accent` |
| typography | `display`, `heading`, `body`, `label` |
| spacing | `gutter`, `stack`, `section` |
| rounded (optional) | `control`, `media` (fall back to square) |

Tailwind's default colour palette and font stacks are cleared by the generated
theme, so `bg-blue-500`-style defaults do not exist. Token utilities do:
`bg-surface`, `text-on-surface`, `p-gutter`, plus Summit's `type-display`,
`type-heading`, `type-body`, `type-label`, `text-muted`, `measure`,
`section-space`, `section-space-half`, `section-space-double`.
