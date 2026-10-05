---
name: reference-analysis
description: Analyse 3-6 curated visual references axis by axis (typography, layout/composition, color, imagery, interaction/motion) into visual/reference-analysis.md, extracting principles to KEEP and choices to DIFFER, grounded in the client's subject. Use before writing a visual direction, or when references are added or changed.
---

<!-- Summit Visual System v1. Canonical source: summit-website-automation/agents/skills/reference-analysis/SKILL.md. Mirrored verbatim into .agents/skills/ and .claude/skills/ — edit the source, never a mirror. -->

# Reference analysis

Goal: extract **principles**, not a page to clone. A reference never supplies
client facts, copy, imagery or proof.

## Inputs

- The curated references (URLs, screenshots or files) named in `RESOURCES.md`
  or supplied by a human. Do not go find your own unless asked.
- `facts.md` — to judge fit against the real business.

If fewer than 3 references are available, stop and report it. Do not pad the
set with references nobody curated.

## Procedure

1. Open `visual/reference-analysis.md`. Keep its structure: one
   `## Reference N — <name>` section per reference, each with the headings
   `### Source`, `### Typography`, `### Layout / Composition`, `### Color`,
   `### Imagery`, `### Interaction / Motion`, `### KEEP`, `### DIFFER`, `### Fit`.
2. For each reference, look at the actual rendered page (or supplied image).
   Record what you observed, not what the site claims about itself.
3. Per axis, write what the reference does that matters **for this client**, or
   `not taken`. Most references contribute to one or two axes only — say so.
4. **KEEP**: phrase each extracted principle as a rule you could apply to a
   different layout ("display type set tight and large against generous
   whitespace, one idea per viewport"). Never "copy the hero".
5. **DIFFER**: name what you will explicitly not reproduce — distinctive
   layouts, signature devices, brand colours, imagery — and what this client
   does instead.
6. **Fit**: tie the reference to the client's subject, audience or service
   using `facts.md`. Taste alone is not fit.
7. Set front matter `status: draft`. Set `complete` only when every section is
   filled and no `[FILL: ...]` marker remains.
8. Run `npm run design:check` and fix every reported problem.

## Rules

- 3–6 references. More dilutes the direction; fewer cannot triangulate it.
- Do not let two references pull the same axis in opposite directions without
  resolving it in the text.
- Never take imagery, copy, logos or claims from a reference.
