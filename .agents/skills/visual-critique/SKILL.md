---
name: visual-critique
description: Independently critique rendered screenshots of a Summit site against the approved visual direction and reference analysis, writing finding-based results (no scores) into visual/critique.md — hierarchy, composition, typography, spacing, rhythm, density, image treatment, reference alignment and brand differentiation. Use after `npm run build && npm run screenshots`, by an agent that did not build the pages.
---

<!-- Summit Visual System v1. Canonical source: summit-website-automation/agents/skills/visual-critique/SKILL.md. Mirrored verbatim into .agents/skills/ and .claude/skills/ — edit the source, never a mirror. -->

# Visual critique

You are the **critic**, not the builder. Judge what rendered, against what was
approved. Do not edit pages, styles or DESIGN.md.

## Preconditions

- `visual/visual-direction.md` is `status: approved` and
  `npm run visual:status` reports the approval as valid (content hash
  verified). If not, stop: critique against an unapproved or since-edited
  direction is meaningless.
- `visual/screenshots/manifest.json` exists and is newer than the last build.
  If not, run `npm run build` then `npm run screenshots`, or report that you
  could not.

## Procedure

1. Read `visual/visual-direction.md`, `visual/reference-analysis.md` (KEEP and
   DIFFER especially) and `visual/DESIGN.md` prose.
2. Open every screenshot listed in the manifest. Use `--fold` captures for the
   first impression and any fixed UI; full-page captures for composition and
   rhythm. Note `horizontal_overflow: true` entries.
3. Look for generic AI defaults first: centered generic hero, repeated
   three-card grids, rounded boxes around everything, decorative gradients,
   uniform section padding, Inter everywhere, weak hierarchy, stock-like
   imagery, token consistency without art direction.
4. Record one finding per concrete issue in `visual/critique.md` front matter
   `findings`, each with: `id`, `axis` (hierarchy | composition | typography |
   spacing | rhythm | density | image-treatment | reference-alignment |
   brand-differentiation), `severity` (blocker | major | minor | note), `page`,
   `viewport`, `screenshot` (path), `location` (where on the page),
   `observation` (what you see), `anchor` (the direction section or reference
   principle it is measured against), `recommendation` (a specific change).
5. A finding without an anchor is taste, not a finding — anchor it or drop it.
6. Under `## What works`, record anchored strengths to protect during
   refinement. Under `## Priority order`, sequence the fixes.
7. Fill `direction_status_at_review`, `reviewed_commit` (`git rev-parse HEAD`)
   and `critic`. Set `status: final`.
8. Run `npm run design:check`.

## Rules

- No numeric score, rating or grade — anywhere. The validator rejects them.
- Critique what rendered, not what the code intends.
- Never recommend inventing proof, testimonials, people or imagery of work to
  fix a composition problem. Recommend a visible gap or a real asset request.
- Craft review (spacing, focus states, forms, touch targets) may use the Vercel
  web interface guidelines if that skill is enabled; report those findings on
  the same axes. Do not load additional aesthetic systems.
