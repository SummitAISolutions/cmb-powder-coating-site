# visual/ — the visual contract

Summit separates what is usually collapsed into one file:

| Concern | Lives in |
| --- | --- |
| Brand facts | `facts.md` (never here) |
| References | `reference-analysis.md` |
| Art direction | `visual-direction.md` — human-approved |
| Design tokens + rationale | `DESIGN.md` |
| Page composition | `src/pages/`, built from primitives |
| Imagery | `image-plan.md` |
| Rendered output | `screenshots/` (generated, git-ignored) |
| Visual QA | `critique.md` |

## Lifecycle

```
facts / real assets / references
        ↓
reference-analysis.md        status: template → draft → complete
        ↓
visual-direction.md          status: template → draft → in-review → approved
        ↓
HUMAN APPROVAL               a person sets approved_by + approved_at + approved_hash
        ↓
DESIGN.md                    written from the approved direction
        ↓
npm run design:export        → src/styles/theme.generated.css
        ↓
implementation               pages composed from primitives
        ↓
image-plan.md                status: draft → active → complete
        ↓
npm run build && npm run screenshots
        ↓
critique.md                  status: draft → final (independent critic)
        ↓
refinement
```

`npm run visual:status` prints where each artifact is.
`npm run design:check` enforces the contract below.

## What `design:check` enforces

- Every artifact exists and its front matter parses.
- **Approval gate.** A client DESIGN.md (one whose `name` no longer starts with
  `[TEMPLATE]`) requires `visual-direction.md` `status: approved` with
  `approved_by`, `approved_at` (YYYY-MM-DD) and a matching `approved_hash`.
  There is no override flag. `npm run build` runs this check first.
- **Approval integrity.** `approved_hash` is the normalised SHA-256 of the
  direction's approval-controlled content, printed (never written) by
  `npm run visual:hash`. It excludes the approval fields, YAML comments, the
  `## Approval` section and whitespace-only differences; any other edit after
  approval invalidates the approval until a person re-approves.
- **DESIGN.md**: Google's linter (`@google/design.md`, pinned) passes with
  broken references and WCAG contrast warnings treated as errors; the required
  token roles exist; required contrast pairs meet 4.5:1; Google's sections
  (Overview, Colors, Typography, Layout, Components, Do's and Don'ts) and
  Summit's (Composition, Signature Element, Image Direction) are present; no
  `[FILL: ...]` or placeholder fonts remain once it is a client design.
- **Theme freshness**: `src/styles/theme.generated.css` is exactly what the
  current DESIGN.md exports to.
- **No raw visual values** in `src/`: no colour literals, colour functions with
  literal channels, named font families or hosted-font imports outside the
  generated theme.
- **visual-direction.md**: all sections present; approval fields consistent
  with status.
- **reference-analysis.md**: 3–6 references once past template, each with every
  axis heading plus KEEP, DIFFER and Fit.
- **image-plan.md**: every slot field valid; real assets first; protected
  subjects never generated.
- **critique.md**: findings well-formed and anchored; no score, rating or grade
  keys; a final critique names an approved direction, a screenshot manifest and
  the reviewed commit.

## Image plan

Contract v2: one slot per **communication need**, planned after page structure
exists. Zero slots is a valid plan; empty space is never a reason. Missing
photography forbids fabricating proof, not diagrams or illustration.

| Field | Meaning |
| --- | --- |
| `id` | Stable slug; equals the `MediaFrame` `slotId`. |
| `page`, `section`, `role` | Where it sits and the job it does. |
| `communication_need` | What the visual must explain or show, specifically. "Add visual interest" and "fill the space" are refused. |
| `medium` | `real-asset`, `generated-image`, `diagram`, `svg-illustration`. |
| `evidence_class` | `authentic-evidence` (real only, never generated), `generated-communication` (never presented as proof), `decorative` (needs `decorative_justification`; use sparingly). |
| `priority` | `P1` (composition fails without it) or `P2`. |
| `depicts` | Protected: `client-work`, `staff`, `customers`, `facility`, `fleet`, `client-product`, `documentary-proof`. Open: `place-context`, `atmosphere`, `material-texture`, `illustration`, `abstract`. |
| `real_asset_available`, `real_asset_path` | Real imagery first. |
| `source` | `real-client` > `real-brand` > `ai-generated`; `none-yet` while unresolved. |
| `generate_if_needed` | Never `true` for a protected subject or when a real asset exists. |
| `subject`, `aspect_ratio`, `focal_point`, `crop_notes` | Match the `MediaFrame` props; crops per breakpoint. |
| `authenticity_constraints` | What would make this image dishonest. |
| `prompt_notes` | Required for AI-generated slots. |
| `final_path` | Required once `approved` or `placed`. |
| `status` | `planned`, `needs-asset`, `generating`, `in-review`, `approved`, `placed`, `dropped` (with `omitted_reason` when generation produced nothing useful). |

Generation runs only in the Summit website pipeline: routed to a worker that can
generate images, every candidate reviewed, at most two attempts per slot,
provenance in `visual/asset-manifest.json`, and an omitted slot is a valid
result. Mark visuals in pages with `MediaFrame visual="diagram"` (or
`illustration` / `decorative`; default `editorial`); give a diagram an
accessible name and, for a sequence, `data-diagram-step="<n>"` on each label so
its mobile layout can be checked.

## Visual proof

`proof.json` is the short proposal a person approves once it is rendered at
desktop and mobile width: 3–6 summary lines, palette roles
(`surface`, `on-surface`, `primary`, `on-primary`, `accent`, `muted`; text pairs
at 4.5:1), typography (`display`, `body`, `scale`, optional Google Fonts
`stylesheet`), `shape`, `density`, `surface_treatment`, `style`,
`visual_medium`, a `hero` and one content `section`. Specimen copy is
placeholder design copy — never a client claim. The template is
`status: "template"`; a director sets `"proposed"`. Never write
`approval-record.json`.

## Screenshots

`npm run screenshots` serves the built `dist/` on a loopback-only port and
captures, per route and viewport (`desktop` 1440×900 and `mobile` 390×844 by
default; `tablet` 834×1112 on request):

- `screenshots/<viewport>/<route-slug>.png` — full page
- `screenshots/<viewport>/<route-slug>--fold.png` — first viewport
- `screenshots/manifest.json` — routes, viewports, files, HTTP status, and a
  `horizontal_overflow` observation per capture

Motion is reduced, animations are disabled and fonts are awaited before
capture. Full-page captures draw fixed elements where they sit in the first
viewport; judge fixed UI from the fold capture. The harness never downloads a
browser and asserts nothing about the page — it is capture, not QA.

## Critique

Finding-based, never scored. Each finding names an axis, a severity, the
screenshot, a location, an observation, the direction section or reference
principle it is anchored to, and a recommendation. The critic is not the
builder.
