---
# Lifecycle: template -> draft -> in-review -> (changes-requested -> in-review)* -> approved
# Only a human sets "approved", together with approved_by, approved_at and
# approved_hash — the output of `npm run visual:hash` for the exact content
# being approved. Any later edit to the direction (outside this approval
# metadata and the "## Approval" section) invalidates the approval:
# `npm run design:export` and `npm run build` refuse until it is re-approved.
status: in-review
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

**From bare metal to finish.** CMB Powder Coating should feel like a clean,
capable local shop that you can reach in one tap: big condensed headings set
straight onto raw steel and warm shop light, a primer-white page, graphite
bands, and one amber action — call or request a quote — that is always in
reach. The site wins on clarity and ease of contact, not on longevity it does
not have.

## Subject Grounding

All from `facts.md`:

- **Powder coating, with sandblasting.** Two services; the services page holds
  both, sandblasting as a section, until the owner says whether it is sold on
  its own. The imagery is the material the work turns on — blasted steel,
  cured surfaces, light on metal — never a finished customer part.
- **A storefront shop at 9461 Hackamore Dr, Boise** where customers drop parts
  off. So the address, directions and "how a job reaches the shop" are content,
  not footnotes.
- **Serving the Treasure Valley, Idaho.** One place image (foothills at dusk)
  carries the geography; no city pages.
- **Phone first, quote second.** (208) 440-7812 is the primary path; the quote
  form (part description, metal, colour) is the written alternative.
- **Proof is small, real and not yet authorised.** The Google profile exists;
  rating and reviews appear only once the owner authorises display. Until then
  the slot under the opening is a visible gap in the build, never filled.

## Visual Personality

- **Capable** — heavy condensed headings, square-shouldered layout. Not
  aggressive, no "extreme"/motorsport styling.
- **Clean** — primer-white space and few words per band. Not sterile.
- **Local** — the address and the Treasure Valley are named plainly. Not
  folksy, no invented history.
- **Direct** — the amber call/quote pill is the only saturated colour.

## Typography Direction

- **Display — Barlow Condensed 600.** Openings ~5.5rem desktop / 2.75rem
  mobile, line-height ~0.95, tight tracking; section headings ~3.25rem /
  2rem. Sentence case, not all-caps shouting.
- **Body / interface — Barlow 400/500.** Same family, normal width: the
  condensed/normal contrast does the work instead of a second personality.
  Buttons and nav at 500; small uppercase eyebrows (0.75rem, +0.14em).
- Why not Inter or a serif: a signage-born grotesque fits a trade shop and
  reads well on phones; a serif would read as boutique.

## Palette Concept

| Role | Colour | Job |
| --- | --- | --- |
| surface | Primer `#F1EFEA` | Page and light panels |
| on-surface | Graphite `#16181A` | Text |
| primary | Blued steel `#2B3E4C` | Scrims over imagery, the steel band, the contact panel, outlined secondary actions |
| on-primary | Primer `#F1EFEA` | Words on imagery and steel (≈9.6:1) |
| accent | Cured amber `#E2A11B` | **Only the actions**: the call and quote pills (header, openings, closers, mobile bar), always with graphite text (≈8:1) |
| muted | Slate `#5F646A` | Secondary text, eyebrows on light |

The amber comes from the gold on CMB's current site and logo, deepened and only
ever used as a fill under dark text (the old gold-on-light text failed
contrast). Graphite is a band colour for the footer and one mid-page section,
never the base — surfaces rotate primer → graphite → steel-tint so no two
adjacent sections match.

## Composition Strategy

- **Floating header card**, sticky and inset: the CMB Powder Coating name (the
  logo when an approved file arrives), Services, Request a quote, and the
  amber call pill on wide screens. Phones: the menu opens a floating panel; a
  sticky bottom bar carries Call and Quote.
- **Openings run full-bleed behind the header**: generated material image,
  blued-steel scrim from the left, words directly on it — eyebrow, very large
  heading, one lede, amber call pill + outlined quote action. No framed image
  over the hero; no crowded hero.
- **Under the home opening**: the proof strip slot (Google rating) — a visible
  gap until authorised.
- **Two tall image cards** — Powder coating, Sandblasting — each one link to the
  services page section.
- **"How a job works"** — one full-bleed band (foothills or shop light under
  steel): describe the part → get a quote → drop it off at Hackamore Dr, as
  three frosted panels. A real sequence, but no numerals.
- **Shop and directions** — address, map link, call; hours shown when
  supplied.
- **Services page** — opening; powder coating; sandblasting section; "what to
  send for a quote" panel beside the quote action; closing panel.
- **Contact / quote page** — opening; graphite panel with the large phone,
  address and directions beside a primer panel holding the quote form.
- **Closing panel on every page** with its own image inset.
- **Footer** on graphite: name, one line, links, "Website built by Summit AI
  Solutions".

## Density and Rhythm

Comfortable. Openings and the "how a job works" band are tall and quiet; the
proof strip is tight; cards and panels sit at ~6rem spacing. Home rhythm:
image → primer strip → primer with image cards → full-bleed steel band →
primer panel → closing panel → graphite footer.

## Signature Visual Device

**Words on metal.** Very large condensed headings set straight onto macro
images of blasted steel, cured surfaces and shop light through a blued-steel
scrim. The amber pill is the only warm, saturated colour on any page.

## Image Treatment

- **Real CMB work photography first.** A "Recent work" band and the service
  cards switch to real photos once the owner authorises his Instagram /
  media-library images (open question). Until then that band is omitted, not
  filled.
- **Generated supporting imagery** with Alibaba Qwen Image
  (`qwen-image-2.0-pro` and its dated snapshots; escalate only if needed): one
  graded series — cool steel, warm work light, shallow depth, negative space on
  the word side.
- **Subjects are materials, light and place only**: sandblasted steel texture,
  a cured coated surface catching light, sheet and bar stock, abstract powder in
  light, Treasure Valley foothills at dusk. Never a finished wheel, rim, slider,
  frame or any part that reads as CMB's work; never a shop interior that could
  read as CMB's premises; never people, hands, vehicles, logos or text.
  Generated images carry empty alt text and are never captioned or presented as
  CMB's.

## References Used

See `visual/reference-analysis.md`:

- **Jace Cox / Modern Necessity (Summit)** — the approved image-led grammar;
  different palette, type and subjects.
- **Grill Docs design-taste (Summit)** — surface rotation and "every section
  has a focal point"; not its dark dominance or identity.
- **Idaho Dustless Sandblasting** — quote action on every screen; reviews on
  the site once authorised.
- **Seattle Powder Coat** — "what to send for a quote" structure; no borrowed
  numbers.
- **CMB's current site** — the amber/gold cue only.

## Prohibited Defaults

- Centered generic hero with a headline, subline and two buttons over a gradient
- Repeated three-card grids as the default way to present anything
- Rounded cards and bordered containers around every section
- Decorative gradients and glows with no subject meaning
- Arbitrary "luxury" styling (thin serif + gold + black) unrelated to the business
- Inter (or any single system-ish sans) everywhere by default
- Uniform section padding and identical full-width section stacks
- Pills, badges and icon rows standing in for real proof
- Stock-like "authentic" photography or AI images of people, work or premises

Client-specific risks:

- Generated finished parts (wheels, sliders, rims) that would read as CMB jobs.
- Motorsport / "extreme" styling, flames, carbon fibre.
- Colour-swatch charts implying a colour range the owner has not confirmed.
- Any testimonial, rating or review count before the owner authorises it.
- Turnaround, price or size-limit numbers before the owner states them.
- 1-2-3 numbering, divider rules between topics, framed images over heroes.

## Approval

- Reviewer: [FILL: name]
- Decision: [FILL: approved / changes requested]
- Notes: [FILL: what changed after review]

Approval is recorded in the front matter (`status: approved`, `approved_by`,
`approved_at: YYYY-MM-DD`, `approved_hash` from `npm run visual:hash`). This
section is excluded from the hash, so reviewer notes can be added after
approval. Agents never set these fields.
