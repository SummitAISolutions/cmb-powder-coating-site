# [TEMPLATE] Input Manifest

> **This file is a placeholder** copied from
> `templates/repo-seed/INPUT_MANIFEST.md` in
> `SummitAISolutions/summit-website-automation`.

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
| 1 | Client facts (`facts.md`) | missing | `./facts.md` | Seeded as template |
| 2 | Research notes (`RESEARCH.md`) | missing | `./RESEARCH.md` | Seeded as template |
| 3 | Resource pointers (`RESOURCES.md`) | missing | `./RESOURCES.md` | Seeded as template |
| 4 | Experiment metadata (`EXPERIMENT.md`) | n/a | `./EXPERIMENT.md` | Generated only for experiment repos (`scripts/create-experiment-repos.js`); a pipeline-created site has none. Mark `provided` only when the file exists |
| 5 | Benchmark / build prompt | missing | `[placeholder]` | Add path when supplied |
| 6 | Brand assets | missing | `[placeholder]` | |
| 7 | Approved imagery | missing | `[placeholder]` | |
| 8 | Approved copy | missing | `[placeholder]` | |

## Open questions

Every fact a build agent needed and could not find. Keep in sync with the
"Open questions" section of `facts.md`.

| # | Question | Blocking? | Raised | Answer |
| --- | --- | --- | --- | --- |
| 1 | `[placeholder]` | no | `[placeholder]` | `[placeholder]` |

## Sign-off

- Inputs reviewed by: `[placeholder]`
- Date: `[placeholder]`
- Safe to build: `[ ] yes  [ ] no`
