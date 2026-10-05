# `search/` — the local search contract

Two small files make this site's local-search behaviour deterministic. Read
this before adding a page, a business fact, a location page or any metadata.
The full reference lives in `summit-website-automation/docs/local-search.md`.

| File | What it is | Who edits it |
| --- | --- | --- |
| `business-entity.json` | A normalized projection of the client truth in `facts.md` | written from `facts.md`, never from memory |
| `site.json` | Every public route (title, description, h1, indexability), crawler policy, icons | the build agent, as pages are added |

## Precedence

```
facts.md  →  search/business-entity.json  →  pages, JSON-LD, QA
```

`facts.md` is authoritative. The entity may only contain what `facts.md` (or,
for URLs, `RESOURCES.md`) records. `npm run search:check` fails when they
disagree or when the entity holds a fact `facts.md` does not — nothing is picked
silently. Unknown facts stay `null` or `[]`; leave a visible `[NEEDS FACT: …]`
gap on the page instead of inventing one.

## `business-entity.json`

Set `"status": "client"` once the entity is filled from `facts.md`. Geography
follows facts.md's separate facts: service areas come only from **Service
geography** (never the operating base); `businessModel` follows the **Delivery
model**; `address.public` follows the **Public customer-facing address**.

- `businessModel`: `storefront` (customers visit), `service_area` (the business
  travels; no customer-facing premises), or `hybrid`. `multi_location` is not
  supported.
- `address`: `{ "value": {…} | null, "public": true | false }`. A
  `service_area` business keeps `public: false`: its address is never rendered,
  never enters JSON-LD, and the build fails if it appears anywhere.
- `serviceAreas`: only areas listed in facts.md "Areas served".
- `services`: names exactly as in the facts.md Services table; `id` is the slug
  a service page refers to.
- `hours`: 24h `HH:MM` rows; each time must be in facts.md.
- `qualifications`: licences, certifications, insurance, memberships, awards —
  each with a `source` pointing into facts.md.
- `url`: the production website origin. Canonical URLs and the sitemap use it.
- `gbpCategories`, `sameAs`, `bookingUrl`, `contactUrl`, `provenance`: optional.

Never add ratings, review counts, years in business or anything else the
schema does not have.

## `site.json`

Every page has a route, and a page names its route: `<BaseLayout routeId="…">`.

```json
{ "id": "roof-repair", "path": "/services/roof-repair/", "kind": "service", "service": "roof-repair",
  "title": "Roof repair — Business Name", "description": "…", "heading": "Roof repair" }
```

- `kind`: `home`, `service` (names an entity `service`), `location` (names an
  entity `area`), `about`, `contact`, `content`, `legal`, `utility`, `error`.
- `heading` is the page's h1 exactly; `title` is unique per page.
- `parent` (default `home`) builds the breadcrumb trail; `indexable` defaults
  to true (false for `utility` and `error`).
- `indexing.production`: `"index"`. Use `"noindex"` only as a recorded decision.
- `crawlers`: `{ "registry", "search", "training", "agents" }`. `search`
  (Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, Claude-SearchBot,
  Claude-User, PerplexityBot, Perplexity-User) stays `allow` for a public
  site. `training` (GPTBot, Google-Extended, ClaudeBot) is a separate client
  decision: `allow`, `disallow`, or `unset` (no rule; they follow
  `User-agent: *`). `agents` overrides one registry agent. Opting out of
  training never blocks search. The agent list is maintained in
  `src/lib/local-search/crawlers.mjs`; never type tokens elsewhere.
- `icons.favicon`: a real asset under `public/`, or null.
- `integrations`: future seams; every value stays `null`.

### Route intent and conversion (optional)

Summit's Stage 4 QA config is generated from this file (`npm run qa:config` in
summit-website-automation), so the approved conversion paths live here, once:

```json
{ "id": "home", "path": "/", "kind": "home", "intent": "convert", "primaryCta": "call", "title": "…", "description": "…", "heading": "…" }
```

```json
"conversion": {
  "ctas": [
    { "id": "call", "kind": "tel", "target": "entity:primaryPhone" },
    { "id": "book", "kind": "external-scheduler", "target": "entity:bookingUrl", "routes": ["home"], "handoff": true }
  ],
  "forms": [{ "id": "contact", "route": "contact", "mode": "intercepted-submit" }]
}
```

- `intent`: `convert`, `inform` or `reference`. A `convert` page names a
  `primaryCta` or has a conversion form.
- A CTA `target` is a reference — `entity:primaryPhone`, `entity:emails.0`,
  `entity:bookingUrl`, `entity:contactUrl` or `route:<id>` — never a typed
  number or URL. Its `id` is the `data-cta` marker; a form `id` is the
  `data-form` marker.
- Form `mode`: `inspect`, `intercepted-submit` (QA never delivers an inquiry),
  `sandbox-receipt` (only with a Summit-owned `sandbox`) or `lead-receipt` (a
  Summit lead form, proven end to end through its QA test sink).
- No keyword research, ranking targets or content briefs belong here.

### Lead forms (Summit Standard Lead Adapter v1)

A form that collects an inquiry is a **lead form**: it is approved here, once,
with a `lead` block, rendered with `<LeadForm formId="contact" />`, and submitted
to the Summit endpoint `/api/lead` (`functions/api/lead.js`). Pages never wire a
form to a provider.

```json
{ "id": "contact", "route": "contact", "mode": "lead-receipt",
  "lead": {
    "fields": [
      { "name": "name", "label": "Name", "required": true },
      { "name": "email", "label": "Email", "required": true },
      { "name": "phone", "label": "Phone", "phoneCheck": true },
      { "name": "service", "label": "Service", "options": "entity:services" },
      { "name": "message", "label": "How can we help?", "required": true }
    ],
    "consent": { "id": "contact-consent-v1", "label": "<exact approved wording>", "required": true },
    "destination": { "adapter": "webhook", "urlEnv": "SUMMIT_LEAD_WEBHOOK_URL" }
  } }
```

- Fields: the standard `name`, `email`, `phone`, `service`, `message` (fixed
  types and limits) plus any approved extra (`type`: text, textarea, select,
  checkbox). Collect only what the client approved; never invent a field.
- `consent` only when the client supplies wording; change its `id` whenever the
  wording changes.
- `destination` is server-side: `{ "adapter": "test-sink" }` or a `webhook`
  whose URL and headers live in environment variables (`urlEnv`, `headersEnv`).
  A literal URL, token or header value here fails `npm run search:check`.
  Google Sheets, Make, Zapier or a CRM sit behind the webhook.
- Without `SUMMIT_LEAD_ENV=production` on the server, every submission goes to
  the test sink. A production build refuses a test-sink destination.
- Try it locally: `npm run local` builds and serves the site with the real
  endpoint; received test leads land in `.summit-leads/` (git-ignored).

## Pages

- Render business facts with `EntityFact` (`field="publicName" | "primaryPhone"
  | "email" | "address" | "hours" | "serviceAreas"`), never typed literals.
  It adds `data-entity`, which the build and QA compare with the entity.
- Use `Breadcrumbs routeId="…"` on non-home pages; the JSON-LD BreadcrumbList
  matches it.
- Mark conversion actions with a stable id: `Button cta="call"`,
  `EntityFact field="primaryPhone" cta="call"`, `StickyMobileCTA cta="call"`.
  Mark forms `<form data-form="contact">` (`LeadForm` adds it for lead forms). The primary navigation already carries
  `data-nav="primary"` and its mobile toggle `data-nav-toggle`; `<main>` carries
  `data-route-landmark`.
- JSON-LD is generated in `BaseLayout` from the entity. Do not add hand-written
  JSON-LD, `FAQPage`/`HowTo` markup for rich results, or `AggregateRating`/`Review`
  markup about the business itself. There is no special schema for AI search.

### Location pages

A location page may exist when the client genuinely serves the area (it is an
entity service area), the content is truthful, and the page is genuinely useful
for that area — not the same text with the town name swapped. Real local jobs,
photos, reviews or case studies strengthen a page (record them in
`localSignals`) but are not required. Near-identical location pages produce a
warning for a person to judge; do not generate city pages in bulk.

### Answer-first content

Where it helps the reader: open service and location pages with a direct answer
that names the service or area, define the service clearly, use question-style
headings for real customer questions, and cite statistics only when
`facts.md` sources them. These are editorial tools, not required sections, and
there are no word counts.

## Build modes

| Command | Result |
| --- | --- |
| `npm run build` | a **preview** build: every page `noindex` (what Stage 3 deploys) |
| `SUMMIT_SITE_ENV=production npm run build` | a **production** build: indexable routes indexable, sitemap in robots.txt |

`npm run build` runs `search:check` before Astro and `search:verify` on
`dist/` after it. A stray production noindex, a hidden address anywhere, a
contradicted fact, malformed JSON-LD, a wrong canonical, an invalid sitemap, a
broken internal link or an uninventoried page fails the build.

```sh
npm run search:check    # entity ↔ facts.md, site.json, build mode
npm run search:verify   # the built dist/
npm run search:status   # what the contract currently says
```

## Route necessity (`"intentContract": 2`)

Every indexable route says why it exists on its own:

```json
"necessity": { "reason": "distinct-service", "userIntent": "…", "searchIntent": "… or null", "conversionRole": "…", "contentPurpose": "…" }
```

Reasons: `entry`, `distinct-service`, `distinct-geography`,
`distinct-conversion`, `trust-support-legal`, `distinct-information`. "The
template has one", "SEO likes more pages" and "one page per keyword" are not
reasons; two pages for the same visitor need or the same service are refused.
The build fails a service or content page that is another page with a new name.
