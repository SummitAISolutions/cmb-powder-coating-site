# Client Facts — Source of Truth

<!-- summit-facts-contract: 2 -->

Only verified, client-supplied or client-confirmed information belongs here.
Anything not recorded in this file must not appear on the site. Leave a field
as `[UNKNOWN]` rather than guessing — see `AGENTS.md`.

## Business identity

- Legal name: `[UNKNOWN]`
- Trading / display name: CMB Powder Coating
- Tagline: `[UNKNOWN]`
- One-line description: `[UNKNOWN]`
- Website: `[UNKNOWN]`

## Contact

- Primary phone: (208) 440-7812
- Primary email: cmbpowdercoating@cmbgroup.us
- Mailing address (if different): `[UNKNOWN]`
- Hours of operation: `[UNKNOWN]`
- Preferred contact method: `[UNKNOWN]`

## Services

| Service | Description | Included | Not included |
| --- | --- | --- | --- |
| Powder coating | `[UNKNOWN]` | `[UNKNOWN]` | `[UNKNOWN]` |
| Sandblasting | `[UNKNOWN]` | `[UNKNOWN]` | `[UNKNOWN]` |

## Geography

Separate facts. Never infer one from another: an operating base is not a
service area, a remote business can still have an operating base, and having
no public address does not mean having no local presence. Public
customer-facing address is an address or `None`. Delivery model is one of
`storefront`, `customer-location`, `mobile-service`, `remote` or `hybrid`.

- Operating base: Boise, Idaho
- Public customer-facing address: 9461 Hackamore Dr, Boise, ID 83709
- Service geography: Treasure Valley, Idaho
- Areas explicitly **not** served: `[UNKNOWN]`
- Delivery model: storefront
- Local presence / Google Business Profile: `[UNKNOWN]`

## Publishable commitments

Promises, policies, offer terms and guarantees the business makes, recorded
only as the source supports them. Kind: `commitment`, `policy`, `offer` or
`guarantee`. Visibility: `public`, `public-constrained` (only in the stated
Wording), `evidence-only` (supports a claim, never quoted) or `internal-only`.
Support: `exact` (the source says it), `normalized` (the source says it in
other words) or `interpreted` (an implication — never confirmed until a person
confirms the wording). Status: `confirmed`, `conflicting`, `missing` or
`deprecated`. Only confirmed public commitments may appear on the site.

| ID | Kind | Commitment | Visibility | Wording | Source | Support | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `[UNKNOWN]` | `[UNKNOWN]` | `[UNKNOWN]` | `[UNKNOWN]` | `[UNKNOWN]` | `[UNKNOWN]` | `[UNKNOWN]` | `[UNKNOWN]` |

## People

Names and roles only, as the client stated them. A credential, licence, scope
of practice or supervision arrangement is a regulated claim and belongs in
`Credentials and claims`, never here.

- Owners / principals: `[UNKNOWN]`
- Named practitioners: `[UNKNOWN]`
- Supervising / responsible professional: `[UNKNOWN]`

## Credentials and claims

Record only what the client has confirmed and can substantiate.

- Years in business: `[UNKNOWN]`
- Licenses: `[UNKNOWN]`
- Insurance: `[UNKNOWN]`
- Certifications: `[UNKNOWN]`
- Affiliations / memberships: `[UNKNOWN]`
- Awards: `[UNKNOWN]`
- Guarantees / warranties: `[UNKNOWN]`

## Pricing

- Pricing model: `[UNKNOWN]`
- Publishable prices: `[UNKNOWN]`
- Explicitly non-publishable: `[UNKNOWN]`

## Testimonials and reviews

Only reproduce testimonials the client has supplied and authorized.

- Supplied testimonials: `[UNKNOWN]`
- Review platform links: `[UNKNOWN]`
- Ratings/counts authorized for display: `[UNKNOWN]`

## Brand

- Logo files: `[UNKNOWN]` (see `RESOURCES.md`)
- Colors: `[UNKNOWN]`
- Typefaces: `[UNKNOWN]`
- Voice / tone notes: `[UNKNOWN]`
- Things to avoid saying: `[UNKNOWN]`

## Compliance and legal

- Required disclaimers: `[UNKNOWN]`
- Privacy policy source: `[UNKNOWN]`
- Terms source: `[UNKNOWN]`

## Prohibited claims

Claims the site must never make, even when they would sound harmless.

- Any testimonial or review not supplied by the client or quoted from a real public review (the current site's 'Spencer Walsh, Founder Lokamart' lorem-ipsum testimonials are fabricated template filler)
- Longevity or years-in-business claims (the business is new; the domain dates from 2024-01-24)
- Turnaround, pricing, part-size or oven-capacity numbers taken from any competitor or benchmark page

## Internal-only notes

Strategy, future pricing, capacity plans, research and internal mechanics
found in the source material. Recorded so they are never mistaken for public
truth. Never published.

| ID | Note | Source |
| --- | --- | --- |
| protect-urls | Migration: keep /, /services/, /about-us/, /contact-us/ and carry the three /david3/{about-us,services,contact-us}/ 301s forward. The homepage is the only URL with measured organic value (organic #6-8 for 'powder coating boise' variants in all five measured Treasure Valley cities). | drive-cmb-baseline: Baseline §3, §10; Opportunity Records OPP-010 |
| no-location-pages | Every geo-modified organic winner in Boise ranks with its homepage; build no service-by-city pages. | drive-cmb-baseline: Local Market & Category Benchmark §2 item 1 |
| conversion-gap | Current site has zero forms and zero tel: links; competitors all carry a named quote action. Priority fix: click-to-call everywhere, sticky mobile call bar, quote form with photo upload (photos, dimensions, metal, colour). | drive-cmb-baseline: Opportunity Records OPP-001 |
| specificity-gap | No Boise powder coater publishes turnaround, pricing drivers, size limits, what can/cannot be coated or prep rules; FAQs are almost absent. Opening for CMB once the owner supplies the numbers. | drive-cmb-baseline: Local Market & Category Benchmark §3; OPP-009 |
| review-gap | CMB: 5.0 from 9 Google reviews (joint-highest rating, lowest count); top-3 local holders have 28-45. Correlation only, never presented as causation. | drive-cmb-baseline: Search Visibility Baseline Result 3; OPP-004 |
| review-themes | The nine Google reviews describe automotive/enthusiast work (rock sliders, wheels, rotors, brakes, a stencil job) and praise turnaround, fair pricing and communication. Positioning signal only until the owner confirms. | drive-cmb-baseline: Baseline §2 public review themes |
| stray-email | Contact-page markup exposes a personal Gmail mailto link; never carry it into the new site. | drive-cmb-baseline: Baseline §2; Owner Question 11 |
| search-profile | Search Profile v1 (hash fc047d7a...) is the pre-build measurement contract; re-run it pre-launch and at 30/60/90 days, never overwrite it. | drive-cmb-baseline: Search Visibility Baseline; Search Profile v1 |

## Open questions

Anything a build agent needed and could not find. Mirror these into
`INPUT_MANIFEST.md`.

- Which jobs does CMB most want more of, and which does it not want (automotive/enthusiast parts, wheels, commercial/production, other)? This decides what the homepage leads with.
- Is sandblasting a service CMB sells on its own, or only a prep step inside powder coating? (Decides whether it gets its own page.)
- How do parts reach the shop (customer drop-off at 9461 Hackamore Dr, pickup/delivery, shipping), and what are the hours? Sets the delivery model and whether the address is shown.
- Realistic turnaround in days, and is rush work offered?
- Physical limits: oven/booth size, maximum part size and weight.
- What does CMB need to quote a job (photos, dimensions, metal type, colour), and where should quote requests be delivered (email, text)?
- Legal/registered business name and its relationship to 'CMB Group' (footer '© 2024 CMBGroup', email domain cmbgroup.us).
- Is the second number (986) 229-5116 shown on the current site still a business line, or should only (208) 440-7812 be published?
- May the site use CMB's real work photos from Instagram and the current site's media library, and are full-resolution originals available?
- May the site display the 5.0 Google rating and quote the nine real Google reviews?
- Confirm or drop the current site's claims: 'No Delays' / 'On Time' / 'Quick Response', 'save you money and time', 'hundreds of colors', 'a new upcoming company' (2024).
- Public research suggests Trading / display name: "CMB Powder Coating" — is that correct?
- Public research suggests Website: "https://cmbpowdercoating.com/" — is that correct?
- Public research suggests One-line description: "Powder coating and sandblasting in Boise, Idaho" — is that correct?
- Public research suggests Primary phone: "(208) 440-7812" — is that correct?
- Public research suggests Primary email: "cmbpowdercoating@cmbgroup.us" — is that correct?
- Public research suggests Operating base: "Boise, Idaho" — is that correct?
- Public research suggests Public customer-facing address: "9461 Hackamore Dr, Boise, ID 83709" — is that correct?
- Public research suggests Service geography: "Treasure Valley, Idaho" — is that correct?
- Public research suggests Local presence / Google Business Profile: "Google Business Profile 'CMB Powder Coating', Boise ID, primary category Powder coating service" — is that correct?
- Public research suggests Review platform links: "Google Business Profile (Maps CID 8908024561109658504)" — is that correct?
- Public research suggests Logo files: "CMB-Logo.jpg on the current site (wordmark 'CMB POWDER COATING — Product & Service by CMB Group')" — is that correct?
- Public research suggests Things to avoid saying: "The misspelling 'CMB Power Coating'" — is that correct?

## Change log

| Date | Change | Confirmed by |
| --- | --- | --- |
| `[UNKNOWN]` | Seeded from template | `[UNKNOWN]` |
| 2026-10-05 | Recorded 13 item(s) from the source package (live-site, drive-cmb-baseline) | source-worker — see truth/provenance.json |
| 2026-10-05 | Trading / display name → CMB Powder Coating; Primary phone → (208) 440-7812; Primary email → cmbpowdercoating@cmbgroup.us; Service geography → Treasure Valley, Idaho; Operating base → Boise, Idaho; Delivery model → storefront; Public customer-facing address → 9461 Hackamore Dr, Boise, ID 83709 | Samuel |
