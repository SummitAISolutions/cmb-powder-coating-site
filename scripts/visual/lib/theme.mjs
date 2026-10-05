/**
 * Summit theme rendering. Pure: takes Google's exported Tailwind v4 CSS plus the
 * parsed DESIGN.md tokens and returns the exact contents of
 * src/styles/theme.generated.css.
 *
 * Output must be byte-for-byte deterministic for the same inputs — no
 * timestamps, no environment — so `design:check` can detect a stale theme by
 * comparison, and so regenerating an unchanged DESIGN.md is never a diff.
 */

import { requiredThemeVariables } from './contract.mjs';

export const THEME_PATH = 'src/styles/theme.generated.css';
export const DESIGN_PATH = 'visual/DESIGN.md';

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** CSS custom property names declared in a CSS string. */
export function declaredVariables(css) {
  return new Set([...String(css ?? '').matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((match) => match[1]));
}

/** Required role variables the exporter failed to emit. */
export function missingThemeVariables(exportedCss) {
  const declared = declaredVariables(exportedCss);
  return requiredThemeVariables().filter((name) => !declared.has(name));
}

/**
 * Values DESIGN.md defines that the pinned exporter does not emit. Derived from
 * the same DESIGN.md, so there is still exactly one token source; this only
 * fills a known gap in an alpha exporter. Each is emitted only when the
 * exporter output lacks it, so an exporter upgrade that starts emitting them
 * wins automatically.
 */
export function supplementDeclarations(tokens, exportedCss) {
  const declared = declaredVariables(exportedCss);
  const lines = [];
  const typography = isObject(tokens?.typography) ? tokens.typography : {};
  for (const name of Object.keys(typography).sort()) {
    const entry = typography[name];
    if (!isObject(entry) || entry.lineHeight === undefined) continue;
    const variable = `--text-${name}--line-height`;
    if (!declared.has(variable)) lines.push(`  ${variable}: ${String(entry.lineHeight)};`);
  }
  return lines;
}

export function renderTheme({ exportedCss, tokens, sourceSha256, exporter, mode }) {
  const exported = String(exportedCss ?? '').replace(/\r\n/g, '\n').trim();
  const supplements = supplementDeclarations(tokens, exported);

  const parts = [
    '/*',
    ` * GENERATED from ${DESIGN_PATH} by scripts/visual/design-md.mjs — do not edit.`,
    ' * Change visual/DESIGN.md, then run `npm run design:export`.',
    ` * mode: ${mode}`,
    ` * source sha256: ${sourceSha256}`,
    ` * exporter: ${exporter} (css-tailwind)`,
    ' */',
    '',
    '/* Clear Tailwind\'s default palette and font stacks: every colour and',
    '   typeface on the site must come from DESIGN.md. */',
    '@theme {',
    '  --color-*: initial;',
    '  --font-*: initial;',
    '}',
    '',
    exported,
  ];
  if (supplements.length > 0) {
    parts.push(
      '',
      '/* Summit supplements: values defined in DESIGN.md that the pinned exporter',
      '   does not emit. Derived from the same file. */',
      '@theme {',
      ...supplements,
      '}'
    );
  }
  return `${parts.join('\n')}\n`;
}
