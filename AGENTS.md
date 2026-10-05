# Agent Instructions — Summit Website Starter

Shared, harness-neutral instructions for any agent (Codex, Claude Code, others)
working in a repository built on the Summit website starter. `CLAUDE.md`
imports this file; keep project rules here, not there.

> Source: `templates/website-starter/AGENTS.md` in
> `SummitAISolutions/summit-website-automation`. This repository was created
> from the **website-starter** template (`source.template: website-starter`).
> It is self-contained: no other template's instructions apply.

## 1. Facts and honesty come first

- `facts.md` is the only authoritative record of client information. If a fact
  is not in `facts.md`, it may not appear on the site. If anything conflicts
  with `facts.md`, `facts.md` wins.
- Never fabricate testimonials, reviews, ratings, years in business, project or
  customer counts, certifications, licenses, insurance, awards, affiliations,
  pricing, guarantees, warranties, service-area coverage, staff names, bios,
  headshots, statistics or endorsements.
- A visual choice may never imply a fact either — no invented proof, staff,
  customers, finished work, premises or fleet in imagery. Facts constrain what
  is claimed or depicted, never the style: "no real photos" does not mean
  "typography-only". Diagrams and non-documentary illustration stay available
  when they communicate something; authentic evidence is never generated, and
  generated communication is never presented as evidence.
- facts.md (contract v2) also records **publishable commitments** (with
  visibility and source), **prohibited claims** and **internal-only notes**.
  Publish a commitment only through `<Commitment id="…" />`; never publish an
  internal note, strategy or research in any wording. A price, years in
  business, rating, review count, guarantee, licence/insurance/certification,
  award or percentage outcome needs support in facts.md — `npm run build` fails
  otherwise (`truth/README.md`).
- Geography is four separate facts (operating base, public customer-facing
  address, service geography, delivery model); never infer one from another.
- `truth/truth.json` is generated (`npm run truth:project`); never edit it.
- `ProofRow` and `Quote` refuse to build without a `facts.md` source. Do not
  work around them.
- A visible gap (`[NEEDS FACT: ...]` recorded under "Open questions" in
  `INPUT_MANIFEST.md`, or an image slot marked `needs-asset`) is always better
  than a plausible fabrication.

## 1a. Precedence and inputs

Highest first: `facts.md` → any benchmark/build prompt → `EXPERIMENT.md`
`build_direction` → the approved `visual/visual-direction.md` and
`visual/DESIGN.md` → this file → your own judgment. Never contradict a higher
level to satisfy a lower one; report genuine conflicts instead of guessing.

A build prompt or change request outranks the approved direction only for what
a **person** asked for. Briefs are often written by an agent: they carry the
person's requirements forward, and the agent's implementation choices around
them (a layout, a component, an extra section) are suggestions, not approvals.
Where such a choice conflicts with the approved direction, follow the direction,
say so in your answer, and leave the change to a person.

Before implementing, read `facts.md`, `EXPERIMENT.md`, `INPUT_MANIFEST.md`,
`RESEARCH.md`, `RESOURCES.md` and any build prompt in full. Say so explicitly if
one is missing or still a template.

Scope: this repository only. Do not modify orchestration logic, do not create
or delete remote repositories, and do not push to any other repository.

## 2. The visual lifecycle is ordered, and one step is human

```
facts / real assets / references
  -> visual/reference-analysis.md
  -> visual/visual-direction.md  (detailed spec) + visual/proof.json (short proposal)
  -> rendered desktop + mobile proof
  -> HUMAN APPROVAL            (of the rendered proof: decided by a person and
                                recorded for them; never set by a worker)
  -> visual/DESIGN.md
  -> npm run design:export     (src/styles/theme.generated.css)
  -> pages composed from primitives
  -> visual/image-plan.md
  -> npm run build && npm run screenshots
  -> visual/critique.md        (independent critic)
  -> refinement
```

- Never set `status: approved`, `approved_by`, `approved_at` or
  `approved_hash` in `visual/visual-direction.md`, and never write
  `visual/approval-record.json`. When the direction is ready,
  stop and say so.
- Approval is bound to the approved content by `approved_hash`. Editing the
  direction after approval invalidates it: `npm run design:export` and
  `npm run build` refuse until a person re-approves. Do not edit an approved
  direction to make implementation easier — report the conflict instead.
- Never write a client `visual/DESIGN.md` from an unapproved direction.
  `npm run design:export` refuses, and there is no override.
- Read `visual/README.md` before any visual work. Use the skills in
  `.agents/skills/` (mirrored in `.claude/skills/`): `reference-analysis`,
  `summit-visual-direction`, `image-opportunity-planning`, `visual-critique`.

## 3. DESIGN.md is the visual source of truth

- Colours, typefaces, type scale, radii and spacing live in `visual/DESIGN.md`
  and reach code only through `src/styles/theme.generated.css`.
- Never hand-edit `theme.generated.css`. Change DESIGN.md, then
  `npm run design:export`.
- No colour literals, named font families or hosted-font imports anywhere in
  `src/` — `npm run design:check` fails on them. Use token roles
  (`var(--color-accent)`, `type-display`, `section-space`). Inline SVG uses
  `currentColor`.

## 4. Compose sections; do not template them

- `src/components/primitives/` is technical capability: Container, Stack,
  Cluster, SplitLayout, ContentGrid, MediaFrame, ResponsiveImage, Button,
  FormField, ProofRow, Quote, StickyMobileCTA, SiteHeader, SiteFooter, SkipLink,
  Breadcrumbs, EntityFact.
- Build each page's sections for this client from those primitives, following
  the approved composition strategy. Do not create reusable finished sections
  (`HeroSection`, `ThreeServiceCards`, `TestimonialsSection`, `PricingSection`,
  …) and do not import a section or UI kit.
- Style a primitive by passing `class` to it (it lands on the primitive's root)
  or through its props; never target a primitive's internal classes from a
  page's scoped CSS — `design:check` refuses it.
- Phones render through `EntityFact`: a human display, a canonical `tel:` link.
- Do not change a primitive to give it a look. If a client needs a distinctive
  treatment, compose it in the page or a client component under
  `src/components/`.
- No frontend framework (React, Vue, …) and minimal client-side JavaScript
  unless a concrete need is recorded.

## 5. Aesthetic tooling

One primary aesthetic layer (Anthropic `frontend-design`, when enabled in the
session) + this repository's DESIGN.md + one craft reviewer (Vercel web
interface guidelines, when enabled) + rendered critique. Do not install, load
or stack other aesthetic skills.

## 6. Local search: one entity, one route inventory

Read `search/README.md` before adding a page, a business fact or metadata.

- `search/business-entity.json` is a projection of `facts.md`, never a second
  source: every value must be recorded there, and `npm run search:check` fails
  on any contradiction or unsourced value. Unknown facts stay `null`.
- A page exists only for a distinct visitor need: every indexable route states
  its `necessity` (route intent contract 2). Never add a page because a template
  or "SEO" suggests one, and never publish two pages that differ only in a name.
- Every page is a route in `search/site.json` and passes its `routeId` to
  `BaseLayout`, which renders the title, description, canonical, robots, Open
  Graph and JSON-LD. Do not hand-write any of them.
- Business facts reach pages only through `EntityFact`. A service-area
  business's address (`address.public: false`) is never rendered or published
  in any form — the build fails if it is.
- No self-serving ratings or reviews of the business, no `FAQPage`/`HowTo`
  rich-result markup, and no other schema the entity cannot back. A
  location page needs an approved service area and genuinely local content, not
  a swapped town name; never generate city pages in bulk.
- `npm run build` is a noindex **preview** build. Only a person decides on a
  production build (`SUMMIT_SITE_ENV=production`).
- Crawler access comes from `search/site.json` `crawlers`: search/retrieval
  agents stay allowed; training is a separate client decision. Never add
  `llms.txt` or hand-edit robots.txt.
- Mark conversion actions and forms for QA with `cta="<id>"` and
  `data-form="<id>"`.

## 6a. Leads: one contract, the adapter is server-side

- A form that collects an inquiry is a lead form: approve its fields, consent
  wording and destination in `search/site.json` (`conversion.forms[].lead`, see
  `search/README.md`), render it with `LeadForm`, and never hand-build one.
- Browser code never names a destination, URL, token or provider. Secrets live
  only in the server environment (Pages environment variables/secrets) and are
  named in site.json by environment variable (`urlEnv`, `headersEnv`); the build
  fails if one reaches `dist/`.
- "Send leads to X" means changing `lead.destination` (and setting the named
  environment variables), not the page. Supported now: `test-sink`, `webhook`
  (Google Sheets, Make, Zapier, a CRM or a custom endpoint behind it). Do not add
  a provider-specific integration without an explicit decision.
- Preview is safe by default: without `SUMMIT_LEAD_ENV=production`, every
  submission goes to the test sink. Never set production mode on a preview, never
  point QA at a production destination, and never remove the honeypot.
- To test a form locally, start the site yourself with `npm run local` (a
  long-running server: run it in the background and stop it when done) and give
  the operator the printed URL; test leads land in `.summit-leads/`. The
  operator should not need a terminal command.

## 7. Validate before reporting done

```sh
npm run design:check   # artifacts, approval gate, DESIGN.md lint, theme freshness, literals
npm run search:check   # business entity ↔ facts.md, search/site.json, truth/ (also: npm run truth:check)
npm run typecheck
npm run build          # includes search:check and the dist/ local search check (and the lead destination scan)
npm run screenshots    # when visual work changed; needs a local Chromium
```

Report the commands you ran and their real exit codes.
