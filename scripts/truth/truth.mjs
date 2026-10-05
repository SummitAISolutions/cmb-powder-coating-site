#!/usr/bin/env node
/**
 * Summit source truth — deterministic, offline.
 *
 *   node scripts/truth/truth.mjs project   # facts.md → truth/truth.json
 *   node scripts/truth/truth.mjs check     # facts contract, manifest, provenance, projection freshness
 *   node scripts/truth/truth.mjs status    # what is known, and what is still missing
 *
 * `npm run build` runs the check through `search:check`. facts.md is the only
 * place truth is written; truth/truth.json is generated and never hand-edited.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TRUTH_PROJECTION_PATH, SOURCES_PATH, PROVENANCE_PATH, parseTruth, projectTruth, truthJsonText, truthProblems,
  manifestProblems, provenanceProblems, completeness,
} from '../../src/lib/truth/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');

export const factsSha = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const read = (root, relative) => (fs.existsSync(path.join(root, relative)) ? fs.readFileSync(path.join(root, relative), 'utf8') : null);
const json = (text, label, failures) => {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`${label}: not valid JSON (${error.message})`);
    return null;
  }
};

/** The projection facts.md implies, as the exact bytes truth/truth.json must hold. */
export function expectedProjection(root) {
  const facts = read(root, 'facts.md');
  if (facts === null) return null;
  return truthJsonText(projectTruth(facts, { factsSha256: factsSha(facts) }));
}

/** Everything about source truth that can be checked before a build. */
export function truthReport(root) {
  const failures = [];
  const warnings = [];
  const facts = read(root, 'facts.md');
  if (facts === null) return { failures: ['facts.md is missing'], warnings };
  const truth = parseTruth(facts);
  const shape = truthProblems(truth);
  failures.push(...shape.problems.map((p) => `facts.md: ${p}`));
  warnings.push(...shape.warnings.map((w) => `facts.md: ${w}`));

  const manifest = json(read(root, SOURCES_PATH), SOURCES_PATH, failures);
  if (manifest === null && !failures.some((f) => f.startsWith(SOURCES_PATH))) failures.push(`${SOURCES_PATH} is missing — the project must say where its source material lives`);
  if (manifest) {
    const checked = manifestProblems(manifest);
    failures.push(...checked.problems.map((p) => `${SOURCES_PATH}: ${p}`));
    warnings.push(...checked.warnings.map((w) => `${SOURCES_PATH}: ${w}`));
  }
  const provenance = json(read(root, PROVENANCE_PATH), PROVENANCE_PATH, failures);
  if (provenance) failures.push(...provenanceProblems(provenance, { manifest }).map((p) => `${PROVENANCE_PATH}: ${p}`));

  const committed = read(root, TRUTH_PROJECTION_PATH);
  if (committed === null) failures.push(`${TRUTH_PROJECTION_PATH} is missing — run npm run truth:project`);
  else if (committed !== expectedProjection(root)) failures.push(`${TRUTH_PROJECTION_PATH} is stale: facts.md changed since it was projected — run npm run truth:project (never hand-edit the projection)`);
  return { failures, warnings, truth };
}

export async function main(argv) {
  const [command, ...rest] = argv;
  const rootIndex = rest.indexOf('--root');
  const root = rootIndex >= 0 ? path.resolve(rest[rootIndex + 1]) : DEFAULT_ROOT;
  if (command === 'project') {
    const text = expectedProjection(root);
    if (text === null) {
      process.stderr.write('  FAIL facts.md is missing\n');
      return 2;
    }
    fs.mkdirSync(path.join(root, 'truth'), { recursive: true });
    fs.writeFileSync(path.join(root, TRUTH_PROJECTION_PATH), text);
    process.stdout.write(`  ok   ${TRUTH_PROJECTION_PATH} projected from facts.md\n`);
    return 0;
  }
  if (command === 'check') {
    const report = truthReport(root);
    for (const warning of report.warnings) process.stderr.write(`  warn ${warning}\n`);
    if (report.failures.length) {
      process.stderr.write(`  FAIL source truth check found ${report.failures.length} problem(s):\n`);
      for (const failure of report.failures) process.stderr.write(`      - ${failure}\n`);
      return 1;
    }
    process.stdout.write('  ok   source truth check passed\n');
    return 0;
  }
  if (command === 'status') {
    const facts = read(root, 'facts.md') || '';
    const site = json(read(root, 'search/site.json'), 'search/site.json', []);
    process.stdout.write(`${JSON.stringify(completeness(facts, { site }), null, 2)}\n`);
    return 0;
  }
  process.stderr.write('Usage: node scripts/truth/truth.mjs <project|check|status> [--root <dir>]\n');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
