@AGENTS.md

# Claude Code bridge

The import above is the canonical project instruction set. Claude Code does not
load `AGENTS.md` on its own, so this file exists only to import it and add
Claude-specific notes. Put project rules in `AGENTS.md`, never here.

## Claude-specific

- Project skills live in `.claude/skills/` and are byte-for-byte mirrors of
  `.agents/skills/`. Both are generated from
  `summit-website-automation/agents/skills/`; never edit a mirror.
- If the `frontend-design` skill is enabled in this session it is the primary
  aesthetic layer. Do not enable additional design or aesthetic skills or
  plugins for this repository.
- When a step needs a human decision (approving the visual direction, supplying
  a real photograph), stop and report it. Do not wait on or simulate the
  approval.
