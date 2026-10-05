---
# Lifecycle: template -> draft -> in-review -> (changes-requested -> in-review)* -> approved
# Only a human sets "approved", together with approved_by, approved_at and
# approved_hash — the output of `npm run visual:hash` for the exact content
# being approved. Any later edit to the direction (outside this approval
# metadata and the "## Approval" section) invalidates the approval:
# `npm run design:export` and `npm run build` refuse until it is re-approved.
status: template
approved_by: ""
approved_at: ""
approved_hash: ""
---

# Visual Direction

> **Human checkpoint.** This document is written before DESIGN.md and before any
> implementation. It is reviewed and approved by a person. Nothing downstream —
> tokens, theme, components, imagery — may be produced from an unapproved
> direction.
>
> Inputs: `facts.md` (the only source of client facts), real client assets
> listed in `RESOURCES.md`, and `visual/reference-analysis.md`. A visual choice
> may never imply a fact that `facts.md` does not state.

## Design Thesis

[FILL: one or two sentences. What this site must make a visitor feel and
believe, and the single idea the design uses to do it. Not a list of adjectives.]

## Subject Grounding

[FILL: what in THIS business the design is built from — materials, tools,
place, process, the texture of the work — citing facts.md or real assets. A
design that could belong to any competitor is not grounded.]

## Visual Personality

[FILL: three to five traits, each with what it means in practice and what it
does NOT mean. e.g. "Precise — tight alignment and measured type; not sterile,
not corporate SaaS."]

## Typography Direction

[FILL: the role of display vs body type, the contrast between them, the faces
under consideration and why they fit the subject. Justify any common default.]

## Palette Concept

[FILL: where the colours come from (subject, material, place), the role of each,
the proportion of use, and the accent's single job.]

## Composition Strategy

[FILL: how pages are composed — asymmetry, image-led fields, overlap, the
container and when it breaks, how the home page differs from inner pages.]

## Density and Rhythm

[FILL: where the page is dense and where it breathes; section spacing that
varies on purpose; the scroll rhythm from top to bottom.]

## Signature Visual Device

[FILL: the one recognisable device, where it recurs, and the limit on its use.]

## Image Treatment

[FILL: real imagery first. Crop, grade, framing, captions. Which slots need real
photographs and must stay visible gaps until they exist. What imagery must never
look like (stock-like authenticity, fabricated staff, customers or work).]

## References Used

[FILL: summarise visual/reference-analysis.md — per reference, what we take and
what we deliberately do differently. Principles, not layouts to clone.]

## Prohibited Defaults

Generic AI-website patterns this direction rules out. Keep the ones that apply,
add client-specific risks, and explain any deliberate exception.

- Centered generic hero with a headline, subline and two buttons over a gradient
- Repeated three-card grids as the default way to present anything
- Rounded cards and bordered containers around every section
- Decorative gradients and glows with no subject meaning
- Arbitrary "luxury" styling (thin serif + gold + black) unrelated to the business
- Inter (or any single system-ish sans) everywhere by default
- Uniform section padding and identical full-width section stacks
- Pills, badges and icon rows standing in for real proof
- Stock-like "authentic" photography or AI images of people, work or premises
- Token consistency mistaken for art direction

[FILL: client-specific risks]

## Approval

- Reviewer: [FILL: name]
- Decision: [FILL: approved / changes requested]
- Notes: [FILL: what changed after review]

Approval is recorded in the front matter (`status: approved`, `approved_by`,
`approved_at: YYYY-MM-DD`, `approved_hash` from `npm run visual:hash`). This
section is excluded from the hash, so reviewer notes can be added after
approval. Agents never set these fields.
