---
version: alpha
name: "[TEMPLATE] Summit starter placeholder"
description: >-
  PLACEHOLDER. Neutral greyscale tokens so the starter builds before any client
  direction exists. Not a visual identity. Replace every value with tokens
  derived from the APPROVED visual/visual-direction.md.
colors:
  surface: "#FAFAFA"
  on-surface: "#1F1F1F"
  on-surface-muted: "#595959"
  primary: "#262626"
  on-primary: "#FFFFFF"
  accent: "#404040"
typography:
  display:
    fontFamily: PLACEHOLDER-SANS
    fontSize: 4.5rem
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -0.02em
  heading:
    fontFamily: PLACEHOLDER-SANS
    fontSize: 2.25rem
    fontWeight: 600
    lineHeight: 1.15
  body:
    fontFamily: PLACEHOLDER-SANS
    fontSize: 1.0625rem
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: PLACEHOLDER-SANS
    fontSize: 0.8125rem
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.04em
rounded:
  control: 0px
  media: 0px
spacing:
  gutter: 1.5rem
  stack: 1.25rem
  section: 7rem
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
---

<!--
  DESIGN.md — the per-client visual source of truth.

  Format: Google's DESIGN.md (alpha), pinned via @google/design.md in
  package.json. YAML tokens above are normative; the prose below says why they
  exist and how to apply them. Summit adds three art-direction sections
  (Composition, Signature Element, Image Direction) that Google's linter
  preserves as unknown sections.

  Rules:
  - Write this file ONLY from an approved visual/visual-direction.md.
  - Required token roles (the starter primitives read them): colors surface,
    on-surface, on-surface-muted, primary, on-primary, accent; typography
    display, heading, body, label; spacing gutter, stack, section. Add more
    roles freely.
  - Never hand-edit src/styles/theme.generated.css. Change this file and run
    `npm run design:export`; `npm run design:check` fails on drift.
  - Keep the TEMPLATE prefix in `name` only while this is still the
    placeholder; removing it makes this a client design, which requires an
    approved visual direction.
-->

## Overview

[FILL: two or three sentences: the design thesis from visual-direction.md, in
terms of what a visitor should feel and believe within five seconds. Name the
subject the design is grounded in.]

## Colors

[FILL: one line per colour role — the value, its job, and where it must not be
used. Explain the palette concept, not a mood word.]

## Typography

[FILL: why these faces for this business; how display and body contrast; the
scale's personality (tight/editorial, generous/calm, condensed/industrial).
Record licensing and hosting for every face.]

## Layout

[FILL: grid, measure, gutters, and the section rhythm. State which sections
break the container and why.]

## Composition

[FILL: the composition strategy page by page — asymmetry, overlap, image-led
fields, where density rises and falls. Name the repeated structures that are
forbidden (e.g. uniform three-card rows).]

## Components

[FILL: how primitives are treated: button character, form fields, media frames,
proof rows, quotes. Composition-level sections are built per page from
primitives, never from a section library.]

## Signature Element

[FILL: the one recognisable visual device that makes this site this client's —
what it is, where it appears, and how often. One device, used with discipline.]

## Image Direction

[FILL: real client imagery first, real brand assets second, AI-generated
supporting imagery last and never for people, work, premises or fleet. Crop,
colour grading, focal behaviour, and what imagery must never look like.]

## Do's and Don'ts

### Do

- [FILL: concrete, checkable rules derived from the direction]

### Don't

- [FILL: concrete prohibitions, including the generic AI defaults this client is
  most at risk of]
