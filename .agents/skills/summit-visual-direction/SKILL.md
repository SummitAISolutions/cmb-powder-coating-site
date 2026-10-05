---
name: summit-visual-direction
description: Write the visual direction for a Summit client site — the detailed agent-facing spec (visual/visual-direction.md) plus the short proposal a person reviews as a rendered desktop and mobile proof (visual/proof.json) — from facts.md, real assets and the reference analysis; then, only after a human approves the proof, derive visual/DESIGN.md and export the theme. Use at the start of visual work, for a revision, and whenever DESIGN.md needs to change.
---

<!-- Summit Visual System v1. Canonical source: summit-website-automation/agents/skills/summit-visual-direction/SKILL.md. Mirrored verbatim into .agents/skills/ and .claude/skills/ — edit the source, never a mirror. -->

# Summit visual direction

Art direction comes before tokens. Tokens without a direction produce
consistent, generic sites.

```
facts + real assets + references -> reference-analysis -> visual-direction
  + proof.json -> RENDERED PROOF (desktop + mobile) -> HUMAN APPROVAL
  -> DESIGN.md -> theme export -> implementation
```

The person approves what they can SEE. `visual-direction.md` is the detailed
spec for agents; the operator is never asked to read it. `visual/proof.json` is
the short proposal the pipeline renders into the proof they review.

## Phase A — write the direction (no approval needed)

1. Read `facts.md`, `RESOURCES.md`, `INPUT_MANIFEST.md` and
   `visual/reference-analysis.md` in full. If the reference analysis is still
   `template`, run the `reference-analysis` skill first.
2. Fill every section of `visual/visual-direction.md`:
   - **Design Thesis** — one idea, not adjectives.
   - **Subject Grounding** — cite the materials, place, process or real assets
     the design is built from. If it could belong to any competitor, it is not
     grounded.
   - **Visual Personality**, **Typography Direction**, **Palette Concept**,
     **Composition Strategy**, **Density and Rhythm** — each states what it
     means in practice and what it does not mean.
   - **Signature Visual Device** — exactly one, with a limit on its use.
   - **Image Treatment** — real imagery first; list slots that must stay gaps
     until real photographs exist.
   - **References Used** — per reference: what we take, what we do differently.
   - **Prohibited Defaults** — keep the list, add client-specific risks, justify
     any exception.
3. Write `visual/proof.json` (`status: "proposed"`): 3–6 plain-language
   `summary` lines (the choices a person should weigh), the palette roles, the
   display and body faces (optionally a Google Fonts `stylesheet`), `scale`,
   `shape`, `density`, `surface_treatment`, `style`, `visual_medium`, a
   representative `hero` and one representative content `section`. Specimen
   copy is placeholder design copy — never a client fact, a rating or a
   "trusted by" claim.
4. Set `status: in-review`. Leave `approved_by`, `approved_at` and
   `approved_hash` empty, and never write `visual/approval-record.json`.

**Facts constrain claims, never style.** "No authentic photography" means do
not fabricate staff, customers, work, premises or results. It does NOT mean the
site must be typography-only or visually sparse: diagrams, illustration,
conceptual graphics and non-documentary imagery remain available whenever they
communicate something. A typographic direction is fine when it is chosen for a
reason — not as a consequence of missing photographs. The pipeline refuses a
direction that makes that leap.

**Revisions are observable.** When a person asks for changes, first write
`visual/revision-notes.md` with `## OBSERVATION`, `## CHANGE`, `## PRESERVE`
and `## DONE WHEN`. "Make it more modern" becomes specific, visible edits;
nothing the person did not ask about changes. Then revise the direction and
`proof.json` together.
5. Run `npm run visual:status` and `npm run design:check`.
6. **Stop.** Report that the direction is ready for human review; the pipeline
   renders the proof and asks. Do not write DESIGN.md, components or pages from
   an unapproved direction.

## Phase B — after a human approves

Proceed only when `visual/visual-direction.md` has `status: approved` with
`approved_by`, `approved_at` and `approved_hash` recorded **for the person who
decided** — you never write them yourself; the website pipeline's `approve`
command records them, and only from an explicit human decision — and
`npm run visual:status` reports the approval as valid. Never set these fields
yourself, and never edit an approved direction: any change invalidates the
approval and blocks export and build until a person re-approves.

What reopens the gate is deliberate. A MATERIAL change to `proof.json` — light ↔
dark presentation, a different colour family, a different typeface, a
different shape class (square/rounded/pill), surface treatment, style, primary
visual medium or hero composition — asks the person again. An IMPLEMENTATION
refinement — a shade nudged for contrast, a radius adjusted within the same
class, spacing cleanup, button fill, specimen copy — does not. Anything the
rules do not recognise is treated as material. DESIGN.md, theme and page work
that faithfully executes the approved direction never touches `proof.json`.

1. Rewrite `visual/DESIGN.md` from the approved direction:
   - Remove `[TEMPLATE]` from `name`; replace every placeholder value.
   - Keep the required roles: colors `surface`, `on-surface`,
     `on-surface-muted`, `primary`, `on-primary`, `accent`; typography
     `display`, `heading`, `body`, `label`; spacing `gutter`, `stack`,
     `section`. Add roles the direction needs.
   - Reference every colour from a component entry so contrast is checked.
   - Fill every prose section, including Summit's `## Composition`,
     `## Signature Element` and `## Image Direction`, and concrete
     `### Do` / `### Don't` lists.
   - Only use typefaces whose licence permits web use; record hosting.
2. `npm run design:export` — regenerates `src/styles/theme.generated.css`.
   Never hand-edit that file.
3. `npm run design:check` — must pass.

## Aesthetic layer

One primary aesthetic skill (Anthropic `frontend-design`, if it is enabled in
this session) plus this repository's DESIGN.md. Do not install, load or stack
other aesthetic systems. If direction and a skill disagree, the approved
direction wins.
