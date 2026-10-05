---
name: image-opportunity-planning
description: Plan visuals on a built page structure into visual/image-plan.md starting from COMMUNICATION NEEDS — what a visual must explain or show, the best medium (real asset, diagram, SVG illustration, generated image, or none), and whether it is authentic evidence, generated communication or decorative — enforcing real client imagery for anything evidential and never generating people, work, premises or fleet. Zero slots is a valid plan. Use after pages are composed, before sourcing or generating any imagery.
---

<!-- Summit Visual System v1. Canonical source: summit-website-automation/agents/skills/image-opportunity-planning/SKILL.md. Mirrored verbatim into .agents/skills/ and .claude/skills/ — edit the source, never a mirror. -->

# Image opportunity planning

Plan imagery **after** structure exists, starting from what a visitor needs to
understand — never from empty space. A visual earns a slot only when it:

- explains something more effectively than copy;
- communicates a real part of the service, system or process;
- establishes useful context;
- materially improves comprehension or composition; or
- carries a meaningful brand signal without pretending to be evidence.

It does NOT earn one because a page has empty space, the image stage exists,
"every section should have an image", a reviewer said there is little imagery,
or a template has a slot. **"No additional visual improves this page" is a valid
answer, and zero slots is a valid plan.** Less imagery beats irrelevant imagery.

Three kinds of visual, never confused:

| Class | Examples | Rule |
| --- | --- | --- |
| `authentic-evidence` | real jobs, staff, premises, vehicles, products, reviews, before/after, dashboards | only a real asset; never generated; a visible gap until one exists |
| `generated-communication` | diagrams, concepts, illustrations, process visuals, non-documentary scenes | may be generated; never presented as proof of anything that happened |
| `decorative` | texture, atmosphere | sparingly; must justify how it helps (`decorative_justification`) |

Missing photography forbids fabricating proof. It does **not** rule out a
diagram, an illustration or a non-documentary image that communicates something.
A process, a system, a lifecycle or interconnected channels are usually better
as a **diagram** (built in code, responsive, labelled with
`data-diagram-node` / `data-diagram-step`) than as a generated raster.

Precedence, always:
**real client imagery > real business/brand assets > AI-generated supporting imagery**

## Inputs

- The composed pages in `src/pages/` (their `MediaFrame` usages and `slotId`s).
- `visual/visual-direction.md` → Image Treatment; `visual/DESIGN.md` →
  Image Direction.
- `RESOURCES.md` and `INPUT_MANIFEST.md` for real assets and their rights.
- `facts.md` for what the imagery may and may not imply.

## Procedure

1. Per page, write down the COMMUNICATION NEEDS first — what a visitor must
   understand that words alone serve poorly. Many pages have none; record that
   under Notes and move on.
2. For each need, choose the best medium: `real-asset`, `diagram`,
   `svg-illustration`, `generated-image` — or no visual. Give each slot a stable
   `id` and use the same value as the `MediaFrame` `slotId` (with its `visual`
   prop: `editorial`, `diagram`, `illustration` or `decorative`).
3. For each slot fill every field in `visual/image-plan.md` front matter
   (`contract_version: 2`): `communication_need`, `medium`, `evidence_class`,
   `page`, `section`, `role`, `priority` (P1 = composition fails without it),
   `depicts`, `real_asset_available`, `real_asset_path`, `source`,
   `generate_if_needed`, `subject`, `aspect_ratio`, `focal_point`,
   `crop_notes` (desktop vs mobile), `authenticity_constraints`,
   `prompt_notes`, `final_path`, `status`.
4. Check real assets first. If a usable real asset exists, use it
   (`source: real-client` or `real-brand`, `generate_if_needed: false`).
5. Classify `depicts` honestly. Protected categories — `client-work`, `staff`,
   `customers`, `facility`, `fleet`, `client-product`, `documentary-proof` —
   are **never** generated. With no real asset they are `status: needs-asset`
   and stay a visible gap. Add the request to `INPUT_MANIFEST.md` open questions.
6. Only open categories (`place-context`, `atmosphere`, `material-texture`,
   `illustration`, `abstract`) may set `generate_if_needed: true`, and only
   when no real asset fits. Record `prompt_notes` and the authenticity limits
   (no logos, no people presented as staff or customers, no invented premises).
7. Set `aspect_ratio` and `focal_point` to match the `MediaFrame` props.
8. Set front matter `status: draft` (or `active` once sourcing is under way).
9. Run `npm run design:check`; it rejects any protected slot marked for
   generation, authentic evidence that is generated, and a communication need
   that is really a reason to fill space.

## Out of scope here

Generating, editing or placing images. This skill produces the plan only. The
pipeline routes generation to a worker that can do it, reviews every candidate
before placement, records provenance in `visual/asset-manifest.json`, and omits a
slot rather than ship filler.
