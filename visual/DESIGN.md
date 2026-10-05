---
version: alpha
name: "CMB Powder Coating — from bare metal to finish"
description: >-
  Client design for CMB Powder Coating, derived from the approved
  visual/visual-direction.md (approved by Samuel, 2026-10-05). Primer-white
  pages, graphite bands and blued-steel scrims behind very large condensed
  headings; cured amber reserved for the call and quote pills, always under
  graphite text.
colors:
  surface: "#F1EFEA"
  on-surface: "#16181A"
  on-surface-muted: "#5F646A"
  primary: "#2B3E4C"
  on-primary: "#F1EFEA"
  accent: "#2B3E4C"
  action: "#E2A11B"
  on-action: "#16181A"
  graphite: "#16181A"
  on-graphite: "#F1EFEA"
typography:
  display:
    fontFamily: Barlow Condensed
    fontSize: 5.5rem
    fontWeight: 600
    lineHeight: 0.95
    letterSpacing: -0.01em
  heading:
    fontFamily: Barlow Condensed
    fontSize: 3.25rem
    fontWeight: 600
    lineHeight: 1
    letterSpacing: -0.005em
  body:
    fontFamily: Barlow
    fontSize: 1.0625rem
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: Barlow
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.14em
rounded:
  control: 10px
  media: 10px
spacing:
  gutter: 1.5rem
  stack: 1.25rem
  section: 6rem
components:
  page:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
  caption:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.label}"
  link:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    typography: "{typography.label}"
  action-pill:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.control}"
    typography: "{typography.body}"
  steel-panel:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
  graphite-band:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.on-graphite}"
    typography: "{typography.body}"
---

## Overview

From bare metal to finish. Within five seconds a visitor should see a clean,
capable local shop they can reach in one tap: very large condensed headings set
straight onto raw steel and warm shop light, a primer-white page, graphite
bands, and one amber action — call or request a quote — always in reach. The
design is grounded in the material the work turns on (blasted steel, cured
surfaces, light on metal), the storefront on Hackamore Dr where parts are
dropped off, and the Treasure Valley. It wins on clarity and ease of contact,
never on longevity, speed or price claims it cannot support.

## Colors

- **surface `#F1EFEA` (primer)** — the page and light panels. Never pure white.
- **on-surface `#16181A` (graphite)** — all text on primer (≈15.5:1).
- **on-surface-muted `#5F646A` (slate)** — secondary text and eyebrows on
  primer (≈5.2:1). Never for a heading or an action.
- **primary `#2B3E4C` (blued steel)** — the scrim over every opening image, the
  full-bleed "how a job works" band, the contact panel, outlined secondary
  actions, and a light tint (mixed with primer) for the rotating steel-tint
  surface.
- **on-primary `#F1EFEA` (primer)** — words on imagery and on steel (≈9.6:1).
- **action `#E2A11B` (cured amber)** — ONLY the call and quote pills (header,
  openings, closing panels, mobile bar), always filled, always with graphite
  `on-action` text (≈7.9:1). Never text on primer (≈2:1 fails), never a
  section background, never decoration. It is the only saturated colour on any
  page.
- **accent `#2B3E4C` (blued steel)** — the starter's `accent` role: focus rings
  and quiet text links on primer. Mapped to blued steel because the starter
  requires `accent` to read at 4.5:1 on the surface and the approved direction
  never lets amber be text on primer. On steel and graphite surfaces the focus
  ring switches to amber (≈4.9:1 on steel, ≈7.9:1 on graphite).
- **graphite `#16181A` / on-graphite `#F1EFEA`** — the footer and one mid-page
  band per page. A band colour, never the base.

Surfaces rotate primer → graphite → steel-tint so no two adjacent sections
match. No gradients except the scrims that make words legible over images; no
glows.

## Typography

- **Display and heading — Barlow Condensed 600** (Jeremy Tribby, SIL OFL 1.1).
  A signage-born condensed grotesque that fits a trade shop and stays legible
  on phones. Openings ~5.5rem desktop / 2.75rem mobile at line-height 0.95;
  section headings ~3.25rem / 2rem. Sentence case, never all-caps shouting.
- **Body and interface — Barlow 400/500** (SIL OFL 1.1). The same family at
  normal width: the condensed/normal contrast does the work instead of a second
  personality. Buttons and nav at 500.
- **Label — Barlow 500**, 0.75rem, uppercase, +0.14em: eyebrows only.
- Why not Inter or a serif: a serif reads boutique; a system sans reads generic.
- Hosting: self-hosted. The faces are named here and reach code only as
  `--font-*` roles; the WOFF2 files (Latin subset: Barlow Condensed 600,
  Barlow 400 and 500) are served from `public/fonts/` with `@font-face` rules in
  `public/fonts.css`, outside `src/`. No hosted-font import. The display face is
  preloaded.

## Layout

- Content container 76rem, gutters 1.5rem, reading measure ~60ch.
- Openings break the container: full-bleed, running up behind the floating
  header card.
- The "how a job works" band breaks the container: full-bleed steel over the
  foothills image.
- Everything else sits in the container; panels carry their own surface and
  10px radius instead of borders.
- Section rhythm ~6rem between panels and cards; openings and the steel band are
  tall and quiet; uniform padding everywhere is not allowed.

## Composition

- **Header:** a floating, sticky, inset primer card: the business name (from the
  entity; the logo once an approved file exists), Services, Request a quote,
  and the amber call pill on wide screens. On phones the Menu opens a floating
  panel over the page and a sticky bottom bar carries Call and Quote.
- **Openings (every page):** full-bleed generated material image, blued-steel
  scrim deepest on the left, words set directly on it — eyebrow, very large
  heading, one short lede, amber call pill + outlined quote action. Never a
  framed image laid over the hero; never crowded.
- **Home:** opening → two tall image cards (Powder coating, Sandblasting, each
  one link to its services section) → full-bleed steel band "How a job works"
  with three frosted panels (no numerals) → shop and directions on a graphite
  panel → closing panel → graphite footer. The proof strip under the opening is
  not rendered until the owner authorises review display.
- **Services:** opening → powder coating (primer, text beside an inset image) →
  sandblasting (steel-tint panel) → "What to send for a quote" (graphite band
  beside the quote action) → closing panel.
- **Contact:** opening → blued-steel panel with the large phone, address,
  directions and email beside a primer panel holding the quote form → closing
  panel.
- **Closing panel on every page:** steel-tint panel, heading, one line, call and
  quote actions, with its own inset image.
- **Footer:** graphite — name, one line, links, "Website built by Summit AI
  Solutions".
- Forbidden: repeated three-card grids, divider lines between topics, 1-2-3
  numbering, bordered boxes around every section, a centred gradient hero.

## Components

- **Action pill:** amber fill, graphite text, 10px radius, Barlow 500 at
  1rem, min 48px tall. The call pill shows the phone number from the entity.
- **Outlined action:** 1px currentColor outline in blued steel on primer,
  primer outline on steel/imagery. The secondary action everywhere.
- **Frosted panel:** blued steel at ~40% with a backdrop blur over imagery; the
  three "how a job works" steps.
- **Image card:** tall, 10px radius, image under a steel scrim at the foot, name
  in Barlow Condensed, one line, one link.
- **Form:** the starter's LeadForm on a primer panel; fields on a lighter primer
  with a slate border and 10px radius; the submit is the amber pill.
- **Facts:** every name, phone, email, address and area through `EntityFact`.

## Signature Element

**Words on metal.** Very large condensed headings set straight onto macro
images of blasted steel, cured surfaces and shop light through a blued-steel
scrim. It appears in every opening, the two service cards and the "how a job
works" band. The amber pill is the only warm, saturated colour on any page.

## Image Direction

- Real CMB work photography first — none is authorised yet (open question).
  Until then a "recent work" band is omitted, not filled.
- Generated supporting imagery (Alibaba Qwen Image `qwen-image-2.0-pro`): one
  graded series — cool blue-grey steel, one warm work light, shallow depth of
  field, negative space on the word side (left).
- Subjects: sandblasted steel texture, a cured coated flat surface catching
  light, sheet and bar stock, abstract powder in light, Treasure Valley
  foothills at dusk.
- Never: wheels, rims, sliders, frames or any finished part that reads as CMB's
  work; a shop interior that could read as CMB's premises; people, hands,
  vehicles, logos or text.
- Generated images carry empty alt, are never captioned and are never presented
  as CMB's work or premises.

## Do's and Don'ts

### Do

- Keep the call action in reach on every screen (header pill on wide screens,
  sticky bar on phones).
- Render every business fact through `EntityFact`.
- Use amber only as the fill of the call and quote pills, with graphite text.
- Rotate surfaces primer → graphite → steel-tint; give every section a focal
  point.
- Keep copy short, plain and general about powder coating and sandblasting as
  processes.

### Don't

- No reviews, ratings, testimonials or review counts until the owner
  authorises them.
- No turnaround, price, size-limit, colour-range or years-in-business claims.
- No generated wheels, rims, sliders, frames, parts, shop interiors, people or
  vehicles.
- No motorsport or "extreme" styling, flames or carbon fibre.
- No 1-2-3 numbering, divider rules between topics, or framed images over
  heroes.
- No colour-swatch charts implying a colour range.
