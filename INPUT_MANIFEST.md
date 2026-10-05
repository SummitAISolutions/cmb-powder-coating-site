# Input Manifest — CMB Powder Coating

A complete inventory of everything supplied for this build, so a build agent
can tell the difference between "not provided" and "not found". If an input is
not listed here, assume it does not exist.

## Status legend

- `provided` — present and usable
- `partial` — present but incomplete
- `missing` — expected but not supplied
- `n/a` — not applicable to this build

## Inputs

| # | Input | Status | Location | Notes |
| --- | --- | --- | --- | --- |
| 1 | Client facts (`facts.md`) | partial | `./facts.md` | Facts contract v2. Name, phone, email, storefront address, operating base, service geography, delivery model and both services are confirmed by Samuel (2026-10-05). Hours, descriptions, pricing, turnaround, limits, credentials, reviews and brand are `[UNKNOWN]` |
| 2 | Research notes (`RESEARCH.md`) | missing | `./RESEARCH.md` | Still the seed template; the baseline research lives in the client's Drive (`drive-cmb-baseline`) and is summarised in facts.md internal-only notes |
| 3 | Resource pointers (`RESOURCES.md`) | missing | `./RESOURCES.md` | Still the seed template |
| 4 | Experiment metadata (`EXPERIMENT.md`) | n/a | `./EXPERIMENT.md` | A pipeline-created site has none |
| 5 | Benchmark / build prompt | missing | — | |
| 6 | Brand assets | missing | — | No approved logo file. The current site's `CMB-Logo.jpg` is an open question; the header sets the name from the entity until a file is approved |
| 7 | Approved imagery | missing | — | No authorised CMB photographs. Placed imagery is generated supporting imagery of materials, light and place (`visual/image-plan.md`); the "Recent work" band is omitted until real photos are authorised |
| 8 | Approved copy | missing | — | Copy is plain, general description of powder coating and sandblasting as processes; no claims beyond facts.md |
| 9 | Visual direction | provided | `./visual/visual-direction.md` | Approved by Samuel, 2026-10-05 |

## Visible gaps in the build

- **Proof strip (home, under the opening): not rendered.** The visual direction
  reserves this slot for the Google rating and reviews. facts.md records no
  rating, review count or review authorised for display, so the strip is left
  out entirely — no placeholder, no stars, no counts — until the owner
  authorises it.
- **Hours: not shown** anywhere (facts.md: `[UNKNOWN]`).
- **Recent work band: omitted** until real CMB photographs are authorised.
- **Logo: not used**; the name is set typographically from the entity.

## Open questions

Every fact a build agent needed and could not find. Kept in sync with the
"Open questions" section of `facts.md`.

| # | Question | Blocking? | Raised | Answer |
| --- | --- | --- | --- | --- |
| 1 | May the site display the 5.0 Google rating and quote the real Google reviews? (Fills the proof strip under the home opening.) | no | 2026-10-05 | — |
| 2 | May the site use CMB's real work photos from Instagram and the current site's media library, and are full-resolution originals available? | no | 2026-10-05 | — |
| 3 | What are the shop's hours? | no | 2026-10-05 | — |
| 4 | Is sandblasting sold on its own, or only as prep for powder coating? (Decides whether it gets its own page.) | no | 2026-10-05 | — |
| 5 | Which jobs does CMB most want more of, and which does it not want? (Decides what the home page leads with.) | no | 2026-10-05 | — |
| 6 | Realistic turnaround, rush work, and physical limits (oven/booth size, maximum part size and weight)? | no | 2026-10-05 | — |
| 7 | What does CMB need to quote a job, and where should quote requests be delivered (email, text)? The quote form currently reaches only the preview test sink. | no (blocks launch) | 2026-10-05 | — |
| 8 | Is there an approved logo file (the current site's `CMB-Logo.jpg`)? | no | 2026-10-05 | — |
| 9 | Legal/registered business name and its relationship to "CMB Group". | no | 2026-10-05 | — |
| 10 | Is (986) 229-5116 still a business line, or should only (208) 440-7812 be published? | no | 2026-10-05 | — |
| 11 | Confirm or drop the current site's claims ("No Delays", "On Time", "save you money and time", "hundreds of colors"). None are used. | no | 2026-10-05 | — |

## Sign-off

- Inputs reviewed by: `[pending]`
- Date: `[pending]`
- Safe to build: `[x] yes  [ ] no` — the build uses only confirmed facts; every gap above stays visible or omitted.
