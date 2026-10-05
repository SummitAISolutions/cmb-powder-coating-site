# `truth/` — the truth package around `facts.md`

`facts.md` is where client truth is written. This folder holds what makes it
traceable and machine-readable. Full reference:
`summit-website-automation/docs/source-truth.md`.

| File | What it is | Who writes it |
| --- | --- | --- |
| `sources.json` | Where this project's source material lives (a folder, a connected document, the client's site), its precedence, and what it may contain. No credentials. | Summit, once, when the sources are known |
| `provenance.json` | Where each recorded fact, service and commitment came from: source, location, method, time, who confirmed it. | Summit's source-truth stage and `fact` command |
| `truth.json` | The deterministic projection of `facts.md`. **Generated** — `npm run truth:project`; the build refuses a stale or hand-edited copy. | never by hand |

Rules that matter while building pages:

- Publish a business commitment only with `<Commitment id="…" />`, and only if
  facts.md records it as confirmed and public. Never paraphrase a
  public-constrained commitment.
- Internal-only notes are never published, in any wording.
- A price, years in business, rating, review count, guarantee, licence,
  insurance, certification, award or percentage outcome needs support in
  facts.md, or the build fails.
- No placeholder (`[FILL]`, `[NEEDS FACT]`, TODO, lorem ipsum, example.com,
  fake names, `alt="image"`) may be published.
- The operating base is not a service area; no public address does not mean no
  local presence.
