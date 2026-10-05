#!/usr/bin/env node
/**
 * Summit DESIGN.md adapter — the only code in this repository that knows about
 * @google/design.md.
 *
 *   node scripts/visual/design-md.mjs status   # lifecycle state of every visual artifact
 *   node scripts/visual/design-md.mjs check    # validate artifacts, lint DESIGN.md, verify theme is current
 *   node scripts/visual/design-md.mjs export   # regenerate src/styles/theme.generated.css
 *   node scripts/visual/design-md.mjs hash     # print visual-direction.md's approval content hash (read-only)
 *
 * Boundary: Google's package is invoked only through its documented CLI
 * (`lint`, `export --format css-tailwind`), pinned to an exact version, and
 * never downloaded mid-run. Its JSON findings are translated here; nothing
 * downstream sees a package-specific shape. If the alpha format changes,
 * this file is the one place to adapt.
 *
 * Exit codes: 0 ok, 1 validation failure, 2 usage or missing prerequisite.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  splitFrontMatter,
  designProblems,
  directionProblems,
  referenceProblems,
  imagePlanProblems,
  critiqueProblems,
  exportGate,
  approvalState,
  isTemplateDesign,
  visualLiteralFindings,
} from './lib/contract.mjs';
import { styleBoundaryProblems } from './lib/style-boundaries.mjs';
import { renderTheme, missingThemeVariables, THEME_PATH, DESIGN_PATH } from './lib/theme.mjs';

export const EXPORTER_PACKAGE = '@google/design.md';
export const EXPORTER_VERSION = '0.4.0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');

// Google lint rules whose warnings Summit treats as failures. Contrast below
// WCAG AA is an accessibility defect, not a style preference.
const ESCALATED_RULES = new Set(['contrast-ratio', 'broken-ref']);

// Files a generated theme is allowed to contain raw visual values in.
const LITERAL_ALLOWLIST = new Set([THEME_PATH]);
const SCANNED_EXTENSIONS = new Set(['.astro', '.css', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.md', '.mdx', '.html']);

const ARTIFACTS = {
  direction: 'visual/visual-direction.md',
  references: 'visual/reference-analysis.md',
  design: DESIGN_PATH,
  imagePlan: 'visual/image-plan.md',
  critique: 'visual/critique.md',
};

class Prerequisite extends Error {}

// ------------------------------------------------------------------ helpers

const out = (line = '') => process.stdout.write(`${line}\n`);
const err = (line = '') => process.stderr.write(`${line}\n`);

async function loadYaml() {
  try {
    return (await import('yaml')).default;
  } catch {
    throw new Prerequisite('the "yaml" package is not installed. Run `npm install` in this repository.');
  }
}

function readArtifact(root, relative, YAML) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return { present: false, relative };
  const text = fs.readFileSync(absolute, 'utf8');
  const { frontMatter, body } = splitFrontMatter(text);
  let meta = null;
  let parseError = null;
  if (frontMatter !== null) {
    try {
      meta = YAML.parse(frontMatter);
    } catch (error) {
      parseError = error.message;
    }
  }
  return { present: true, relative, absolute, text, meta, body, parseError };
}

/** Resolve the pinned exporter from node_modules. Never installs anything. */
export function resolveExporter(root) {
  const pkgFile = path.join(root, 'node_modules', ...EXPORTER_PACKAGE.split('/'), 'package.json');
  if (!fs.existsSync(pkgFile)) {
    throw new Prerequisite(
      `${EXPORTER_PACKAGE} is not installed. Run \`npm install\` in this repository ` +
        '(this tool never downloads packages mid-run).'
    );
  }
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  if (pkg.version !== EXPORTER_VERSION) {
    throw new Prerequisite(
      `${EXPORTER_PACKAGE} ${pkg.version} is installed, but this adapter is pinned to ${EXPORTER_VERSION}. ` +
        'Update the adapter deliberately rather than running against an unverified version.'
    );
  }
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && pkg.bin['design.md'];
  if (!bin) throw new Prerequisite(`${EXPORTER_PACKAGE} ${pkg.version} declares no "design.md" bin`);
  return { script: path.join(path.dirname(pkgFile), bin), label: `${EXPORTER_PACKAGE}@${pkg.version}` };
}

function runExporter(exporter, args, cwd) {
  const result = spawnSync(process.execPath, [exporter.script, ...args], {
    cwd,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

/** Google lint, translated to Summit findings. */
export function translateLint(json) {
  const findings = Array.isArray(json?.findings) ? json.findings : [];
  const problems = [];
  const warnings = [];
  for (const finding of findings) {
    const text = `DESIGN.md [${finding.rule || 'lint'}]${finding.path ? ` ${finding.path}` : ''}: ${finding.message}`;
    if (finding.severity === 'error' || (finding.severity === 'warning' && ESCALATED_RULES.has(finding.rule))) {
      problems.push(text);
    } else if (finding.severity === 'warning') {
      warnings.push(text);
    }
  }
  return { problems, warnings };
}

function lintDesign(root, exporter) {
  const result = runExporter(exporter, ['lint', DESIGN_PATH], root);
  let json;
  try {
    json = JSON.parse(result.stdout);
  } catch {
    return {
      problems: [`DESIGN.md: ${exporter.label} lint produced no JSON (exit ${result.status}): ${(result.stderr || '').trim()}`],
      warnings: [],
    };
  }
  const translated = translateLint(json);
  if (result.status !== 0 && translated.problems.length === 0) {
    translated.problems.push(`DESIGN.md: ${exporter.label} lint exited ${result.status}`);
  }
  return translated;
}

function exportCss(root, exporter) {
  const result = runExporter(exporter, ['export', '--format', 'css-tailwind', DESIGN_PATH], root);
  if (result.status !== 0) {
    throw new Error(`${exporter.label} export failed (exit ${result.status}): ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result.stdout;
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

/** Raw colour / font literals in src/, outside the generated theme. */
export function sourceLiteralProblems(root) {
  const problems = [];
  for (const file of walk(path.join(root, 'src'))) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    if (LITERAL_ALLOWLIST.has(relative) || !SCANNED_EXTENSIONS.has(path.extname(file))) continue;
    for (const finding of visualLiteralFindings(fs.readFileSync(file, 'utf8'))) {
      problems.push(
        `${relative}:${finding.line}: ${finding.kind} "${finding.match}" — visual values come from DESIGN.md via the generated theme`
      );
    }
  }
  return problems;
}

// ------------------------------------------------------------------ commands

async function gatherState(root) {
  const YAML = await loadYaml();
  const artifacts = Object.fromEntries(
    Object.entries(ARTIFACTS).map(([key, relative]) => [key, readArtifact(root, relative, YAML)])
  );
  const problems = [];
  const warnings = [];

  for (const artifact of Object.values(artifacts)) {
    if (!artifact.present) problems.push(`${artifact.relative} is missing`);
    else if (artifact.parseError) problems.push(`${artifact.relative}: front matter is not valid YAML (${artifact.parseError})`);
  }

  const { direction, references, design, imagePlan, critique } = artifacts;
  if (direction.present && !direction.parseError) problems.push(...directionProblems(direction.meta, direction.body));
  if (references.present && !references.parseError) problems.push(...referenceProblems(references.meta, references.body));
  if (design.present && !design.parseError) {
    const result = designProblems(design.meta, design.body);
    problems.push(...result.problems);
    warnings.push(...result.warnings);
  }
  if (imagePlan.present && !imagePlan.parseError) {
    const result = imagePlanProblems(imagePlan.meta);
    problems.push(...result.problems);
    warnings.push(...result.warnings);
  }
  if (critique.present && !critique.parseError) problems.push(...critiqueProblems(critique.meta));

  const directionStatus = direction.meta?.status ?? null;
  const designIsTemplate = isTemplateDesign(design.meta);
  const approval = direction.present && !direction.parseError ? approvalState(direction.meta, direction.body) : null;
  const gate = exportGate({ directionStatus, designIsTemplate, approval });

  return { artifacts, problems, warnings, gate, directionStatus, designIsTemplate, approval };
}

function renderFromDesign(root, state, exporter) {
  const exported = exportCss(root, exporter);
  const missing = missingThemeVariables(exported);
  if (missing.length > 0) {
    throw new Error(
      `${exporter.label} did not emit required role variables: ${missing.join(', ')}. ` +
        'Either DESIGN.md is missing a role or the exporter changed its naming — the adapter must be updated.'
    );
  }
  return renderTheme({
    exportedCss: exported,
    tokens: state.artifacts.design.meta,
    sourceSha256: createHash('sha256').update(state.artifacts.design.text).digest('hex'),
    exporter: exporter.label,
    mode: state.gate.mode,
  });
}

async function commandStatus(root) {
  const state = await gatherState(root);
  const { artifacts } = state;
  out('Summit Visual System — artifact status');
  out('');
  out(`  reference-analysis   ${artifacts.references.meta?.status ?? 'missing'}`);
  const meta = artifacts.direction.meta;
  const approvalNote =
    meta?.status === 'approved'
      ? state.approval?.approved
        ? `  (approved by ${meta.approved_by} on ${meta.approved_at}; content hash verified)`
        : `  (APPROVAL INVALID: ${state.approval?.reason ?? 'not verified'})`
      : '';
  out(`  visual-direction     ${meta?.status ?? 'missing'}${approvalNote}`);
  out(`  DESIGN.md            ${state.designIsTemplate ? 'template' : artifacts.design.present ? 'written' : 'missing'}`);
  out(`  theme export         ${state.gate.allowed ? `allowed (${state.gate.mode})` : 'BLOCKED'} — ${state.gate.reason}`);
  out(`  image-plan           ${artifacts.imagePlan.meta?.status ?? 'missing'}${Array.isArray(artifacts.imagePlan.meta?.slots) ? `  (${artifacts.imagePlan.meta.slots.length} slot(s))` : ''}`);
  out(`  critique             ${artifacts.critique.meta?.status ?? 'missing'}${Array.isArray(artifacts.critique.meta?.findings) ? `  (${artifacts.critique.meta.findings.length} finding(s))` : ''}`);
  out('');
  if (!state.gate.allowed || !state.approval?.approved) {
    out('  Next human checkpoint: review visual/visual-direction.md, then set status: approved,');
    out('  approved_by, approved_at and approved_hash (from `npm run visual:hash`).');
    out('  Agents never do this.');
  }
  return 0;
}

/**
 * Print the approval hash of visual-direction.md as it stands. Read-only: it
 * never writes the approval — recording approval stays a human edit.
 */
async function commandHash(root) {
  const YAML = await loadYaml();
  const direction = readArtifact(root, ARTIFACTS.direction, YAML);
  if (!direction.present) throw new Error(`${ARTIFACTS.direction} is missing`);
  if (direction.parseError) throw new Error(`${ARTIFACTS.direction}: front matter is not valid YAML (${direction.parseError})`);
  const state = approvalState(direction.meta, direction.body);
  out(state.expectedHash);
  process.stderr.write(
    `  Content hash of ${ARTIFACTS.direction} (approval metadata and the "## Approval" section excluded).\n` +
      '  A human reviewer who approves exactly this content records it as approved_hash.\n' +
      `  Current approval: ${state.approved ? 'valid' : state.reason}\n`
  );
  return 0;
}

async function commandCheck(root) {
  const state = await gatherState(root);
  const problems = [...state.problems];
  const warnings = [...state.warnings];

  if (!state.gate.allowed) problems.push(`approval gate: ${state.gate.reason}`);

  problems.push(...sourceLiteralProblems(root));
  problems.push(...styleBoundaryProblems(
    walk(path.join(root, 'src')).filter((file) => file.endsWith('.astro')).map((file) => ({ path: path.relative(root, file).split(path.sep).join('/'), text: fs.readFileSync(file, 'utf8') })),
    { config: fs.existsSync(path.join(root, 'astro.config.mjs')) ? fs.readFileSync(path.join(root, 'astro.config.mjs'), 'utf8') : '' },
  ));

  const exporter = resolveExporter(root);
  if (state.artifacts.design.present && !state.artifacts.design.parseError) {
    const lint = lintDesign(root, exporter);
    problems.push(...lint.problems);
    warnings.push(...lint.warnings);
  }

  if (state.gate.allowed && problems.length === 0) {
    const expected = renderFromDesign(root, state, exporter);
    const themeFile = path.join(root, THEME_PATH);
    const actual = fs.existsSync(themeFile) ? fs.readFileSync(themeFile, 'utf8') : null;
    if (actual === null) problems.push(`${THEME_PATH} is missing — run \`npm run design:export\``);
    else if (actual !== expected) {
      problems.push(`${THEME_PATH} is stale or hand-edited — it does not match visual/DESIGN.md. Run \`npm run design:export\`.`);
    }
  }

  for (const warning of warnings) err(`  warn ${warning}`);
  if (problems.length > 0) {
    err(`  FAIL visual check found ${problems.length} problem(s):`);
    for (const problem of problems) err(`      - ${problem}`);
    return 1;
  }
  out(`  ok   visual artifacts valid; DESIGN.md lints clean (${exporter.label}); theme is current (${state.gate.mode})`);
  return 0;
}

async function commandExport(root) {
  const state = await gatherState(root);
  if (!state.gate.allowed) {
    err(`  FAIL refusing to export: ${state.gate.reason}`);
    return 1;
  }
  const exporter = resolveExporter(root);
  const designOnly = [...state.problems.filter((p) => p.startsWith('DESIGN.md')), ...lintDesign(root, exporter).problems];
  if (designOnly.length > 0) {
    err('  FAIL refusing to export an invalid DESIGN.md:');
    for (const problem of designOnly) err(`      - ${problem}`);
    return 1;
  }
  const css = renderFromDesign(root, state, exporter);
  const themeFile = path.join(root, THEME_PATH);
  const previous = fs.existsSync(themeFile) ? fs.readFileSync(themeFile, 'utf8') : null;
  if (previous === css) {
    out(`  ok   ${THEME_PATH} already current (${state.gate.mode})`);
    return 0;
  }
  fs.mkdirSync(path.dirname(themeFile), { recursive: true });
  fs.writeFileSync(themeFile, css);
  out(`  ok   wrote ${THEME_PATH} from ${DESIGN_PATH} (${state.gate.mode}, ${exporter.label})`);
  return 0;
}

// -------------------------------------------------------------------- main

const USAGE = `Usage: node scripts/visual/design-md.mjs <status|check|export|hash> [--root <dir>]`;

export async function main(argv) {
  const args = [...argv];
  let root = DEFAULT_ROOT;
  const rootIndex = args.indexOf('--root');
  if (rootIndex !== -1) {
    if (!args[rootIndex + 1]) {
      err(USAGE);
      return 2;
    }
    root = path.resolve(args[rootIndex + 1]);
    args.splice(rootIndex, 2);
  }
  const [command, ...extra] = args;
  if (extra.length > 0 || !['status', 'check', 'export', 'hash'].includes(command)) {
    err(USAGE);
    return 2;
  }
  try {
    if (command === 'status') return await commandStatus(root);
    if (command === 'check') return await commandCheck(root);
    if (command === 'hash') return await commandHash(root);
    return await commandExport(root);
  } catch (error) {
    if (error instanceof Prerequisite) {
      err(`  FAIL prerequisite missing: ${error.message}`);
      return 2;
    }
    err(`  FAIL ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
