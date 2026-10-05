#!/usr/bin/env node
/**
 * Summit local search check — deterministic, offline, no browser.
 *
 *   node scripts/local-search/check.mjs source   # before the build: entity ↔ facts.md, site.json, build mode
 *   node scripts/local-search/check.mjs dist     # after the build: dist/ against the entity and site.json
 *   node scripts/local-search/check.mjs status   # what the contract currently says
 *   add --json for a machine-readable result
 *
 * `npm run build` runs `source` before `astro build` and `dist` after it, so
 * a contradiction between facts.md, the entity and the rendered site stops
 * the build that Stage 3 deploys. The build mode comes from SUMMIT_SITE_ENV
 * (unset = preview).
 *
 * Exit codes: 0 ok (warnings allowed), 1 failures, 2 usage or missing input.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ENTITY_PATH, SITE_PATH, LOCAL_SEARCH_RULES, entityProblems, reconcileEntityWithFacts, siteProblems, resolveSiteEnv,
  routesOf, siteOrigin, isTemplateEntity, extractHtml, analyzeEntityConsistency, analyzeJsonLd, analyzeIndexability,
  analyzeRobotsPolicy, analyzeSitemap, analyzeLocationPages, analyzeBuiltSite,
} from '../../src/lib/local-search/index.mjs';
import { bundleDestinationFindings, productionDestinationProblems } from '../../src/lib/leads/destinations.mjs';
import { TRUTH_RULES, analyzePublicCopy, analyzeRouteDifferentiation, parseTruth } from '../../src/lib/truth/index.mjs';
import { truthReport } from '../truth/truth.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');

class Prerequisite extends Error {}

const readText = (root, relative, { required = true } = {}) => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    if (required) throw new Prerequisite(`${relative} is missing`);
    return null;
  }
  return fs.readFileSync(file, 'utf8');
};

function readJson(root, relative, failures) {
  const text = readText(root, relative);
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`${relative}: not valid JSON (${error.message})`);
    return null;
  }
}

/** Everything that can be checked before a build. */
export function sourceReport(root, env = process.env) {
  const failures = [];
  const warnings = [];
  const entity = readJson(root, ENTITY_PATH, failures);
  const site = readJson(root, SITE_PATH, failures);
  const facts = readText(root, 'facts.md');
  let siteEnv = null;
  try {
    siteEnv = resolveSiteEnv(env);
  } catch (error) {
    failures.push(error.message);
  }
  if (entity) {
    const shape = entityProblems(entity);
    failures.push(...shape.problems.map((p) => `${ENTITY_PATH}: ${p}`));
    warnings.push(...shape.warnings.map((w) => `${ENTITY_PATH}: ${w}`));
    if (shape.problems.length === 0) {
      const factsSha256 = `sha256:${createHash('sha256').update(facts).digest('hex')}`;
      const reconciled = reconcileEntityWithFacts(entity, facts, {
        resources: readText(root, 'RESOURCES.md', { required: false }) || '',
        research: readText(root, 'RESEARCH.md', { required: false }) || '',
        factsSha256,
      });
      failures.push(...reconciled.problems.map((p) => `facts.md ↔ ${ENTITY_PATH}: ${p}`));
      warnings.push(...reconciled.warnings.map((w) => `facts.md ↔ ${ENTITY_PATH}: ${w}`));
    }
  }
  if (site && entity) {
    const result = siteProblems(site, entity);
    failures.push(...result.problems.map((p) => `${SITE_PATH}: ${p}`));
    warnings.push(...result.warnings.map((w) => `${SITE_PATH}: ${w}`));
  }
  if (siteEnv === 'production' && entity) {
    if (isTemplateEntity(entity)) failures.push('a production build needs a client business entity (status "client"), not the template');
    if (!siteOrigin(entity)) failures.push('a production build needs the website origin (business-entity.json url) for canonical links and the sitemap');
  }
  if (siteEnv === 'production' && site) failures.push(...productionDestinationProblems(site).map((p) => `${SITE_PATH}: ${p}`));
  // Source truth v2: facts contract, source manifest, provenance, projection freshness.
  const truth = truthReport(root);
  failures.push(...truth.failures);
  warnings.push(...truth.warnings);
  return { mode: 'source', site_env: siteEnv, failures, warnings };
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Cloudflare Pages `_headers`: which X-Robots-Tag applies to a path (host-less rules only, plus the canonical host). */
function headerRules(text, origin) {
  const rules = [];
  let current = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = { pattern: raw.trim(), headers: {} };
      rules.push(current);
    } else if (current) {
      const match = /^\s*([^:]+):\s*(.*)$/.exec(raw);
      if (match) current.headers[match[1].trim().toLowerCase()] = match[2].trim();
    }
  }
  return (sitePath) => {
    const values = [];
    for (const rule of rules) {
      let pattern = rule.pattern;
      if (/^https?:\/\//.test(pattern)) {
        const url = new URL(pattern.replace(/\*/g, '__star__').replace(/:([a-z]+)/g, '__$1__'));
        if (!origin || url.origin !== origin) continue;
        pattern = decodeURIComponent(url.pathname).replace(/__star__/g, '*');
      }
      const regex = new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
      if (regex.test(sitePath) && rule.headers['x-robots-tag']) values.push(rule.headers['x-robots-tag']);
    }
    return values.length ? values.join(', ') : null;
  };
}

/** Everything that can be checked in a finished dist/. */
export function distReport(root, env = process.env) {
  const failures = [];
  const warnings = [];
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(dist)) throw new Prerequisite('dist/ does not exist. Run `npm run build` (or astro build) first.');
  const entity = readJson(root, ENTITY_PATH, failures);
  const site = readJson(root, SITE_PATH, failures);
  if (!entity || !site) return { mode: 'dist', failures, warnings };
  let siteEnv;
  try {
    siteEnv = resolveSiteEnv(env);
  } catch (error) {
    return { mode: 'dist', failures: [error.message], warnings };
  }
  const routes = routesOf(site);
  const origin = siteOrigin(entity);
  const headersFile = path.join(dist, '_headers');
  const xRobotsFor = headerRules(fs.existsSync(headersFile) ? fs.readFileSync(headersFile, 'utf8') : '', origin);

  const pages = [];
  const builtPaths = [];
  let has404 = false;
  for (const file of walk(dist).filter((name) => name.endsWith('.html'))) {
    const relative = path.relative(dist, file).split(path.sep).join('/');
    let sitePath;
    if (relative === '404.html') {
      has404 = true;
      sitePath = '/404';
    } else if (relative === 'index.html') sitePath = '/';
    else if (relative.endsWith('/index.html')) sitePath = `/${relative.slice(0, -'index.html'.length)}`;
    else sitePath = `/${relative.replace(/\.html$/, '')}`;
    if (sitePath !== '/404') builtPaths.push(sitePath);
    const route = routes.find((entry) => entry.path === sitePath) || null;
    const html = fs.readFileSync(file, 'utf8');
    pages.push({ ...extractHtml(html), html, route_id: route ? route.id : `path:${sitePath}`, primary: Boolean(route && route.kind === 'home'), x_robots_tag: xRobotsFor(sitePath), path: sitePath });
  }
  const robots = fs.existsSync(path.join(dist, 'robots.txt')) ? fs.readFileSync(path.join(dist, 'robots.txt'), 'utf8') : null;
  if (robots === null) failures.push('[search-route-missing] dist/robots.txt is missing (src/pages/robots.txt.ts)');
  const sitemap = fs.existsSync(path.join(dist, 'sitemap.xml')) ? fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8') : null;

  const violations = [
    ...analyzeEntityConsistency({ entity, pages }),
    ...analyzeJsonLd({ entity, pages }),
    ...analyzeIndexability({ siteEnv, site, pages, robots }),
    ...(robots === null ? [] : analyzeRobotsPolicy({ robots, site })),
    ...analyzeSitemap({ status: sitemap === null ? 404 : 200, xml: sitemap, site, entity }),
    ...analyzeLocationPages({ site, entity, pages }),
    ...analyzeBuiltSite({
      site,
      entity,
      pages: pages.filter((page) => page.path !== '/404'),
      builtPaths,
      has404,
      fileExists: (sitePath) => fs.existsSync(path.join(dist, sitePath)) && fs.statSync(path.join(dist, sitePath)).isFile(),
    }),
  ];
  // Lead destinations are server-side: no built browser file may name one.
  const browserFiles = walk(dist).filter((name) => /\.(html|js|mjs|css|json|txt|xml|map)$/.test(name)).map((name) => ({ name: path.relative(dist, name).split(path.sep).join('/'), text: fs.readFileSync(name, 'utf8') }));
  for (const finding of bundleDestinationFindings(browserFiles, site, env)) failures.push(`[lead-destination-in-bundle] dist/${finding.file} contains a lead ${finding.kind}; destinations stay server-side (functions/, never src/ pages or scripts)`);
  // Supportable copy, no placeholders, distinct pages — for a client build.
  if (!isTemplateEntity(entity)) {
    const factsText = readText(root, 'facts.md');
    const projection = readJson(root, 'truth/truth.json', failures);
    const published = pages.filter((page) => page.path !== '/404');
    violations.push(...analyzePublicCopy({ truth: parseTruth(factsText), projection, entity, pages: published }));
    const serviceName = (id) => ((entity.services || []).find((service) => service.id === id) || {}).name;
    violations.push(...analyzeRouteDifferentiation(published.map((page) => {
      const route = routes.find((entry) => entry.id === page.route_id);
      return { route_id: page.route_id, html: page.html, kind: route ? route.kind : null, indexable: Boolean(route && route.indexable), terms: route ? [route.heading, route.title, route.service && serviceName(route.service), route.area].filter(Boolean) : [] };
    }), { globalTerms: [entity.publicName, entity.legalName].filter(Boolean) }));
  }
  // Every local image a page references exists in the build (no broken or placeholder asset ships).
  const fileExists = (sitePath) => fs.existsSync(path.join(dist, sitePath)) && fs.statSync(path.join(dist, sitePath)).isFile();
  for (const page of pages) {
    const sources = [...page.html.matchAll(/<(?:img|source)\b[^>]*?\s(?:src|srcset)="([^"]+)"/gi)].flatMap((m) => m[1].split(',').map((part) => part.trim().split(/\s+/)[0]));
    for (const source of sources) {
      if (!source.startsWith('/') || source.startsWith('//')) continue;
      const target = decodeURIComponent(source.split(/[?#]/)[0]);
      if (!fileExists(target)) violations.push({ rule_id: 'search-image-missing', route_id: page.route_id, subject: `image:${target}`, expected: 'every local image to exist in the build', actual: `${source} is not a built file (add the real asset under public/ or remove the image)` });
    }
  }
  const gate = (ruleId) => (ruleId === 'search-image-missing' ? 'hard' : LOCAL_SEARCH_RULES[ruleId] || TRUTH_RULES[ruleId]);
  const seen = new Set();
  for (const violation of violations) {
    const line = `[${violation.rule_id}] ${violation.route_id ? `${violation.route_id}: ` : ''}expected ${violation.expected}; got ${violation.actual}`;
    if (seen.has(line)) continue;
    seen.add(line);
    (gate(violation.rule_id) === 'hard' ? failures : warnings).push(line);
  }
  return { mode: 'dist', site_env: siteEnv, pages: pages.length, failures, warnings, violations };
}

function statusReport(root, env) {
  const failures = [];
  const entity = readJson(root, ENTITY_PATH, failures);
  const site = readJson(root, SITE_PATH, failures);
  let siteEnv;
  try {
    siteEnv = resolveSiteEnv(env);
  } catch (error) {
    siteEnv = `INVALID (${error.message})`;
  }
  return {
    mode: 'status',
    site_env: siteEnv,
    entity: entity ? { status: entity.status, businessModel: entity.businessModel, publicName: entity.publicName, address_public: entity.address ? entity.address.public : null, service_areas: (entity.serviceAreas || []).length, services: (entity.services || []).length, origin: siteOrigin(entity) } : null,
    routes: site ? routesOf(site).map((route) => `${route.id} ${route.path} (${route.kind}${route.indexable ? '' : ', noindex'})`) : [],
    failures,
    warnings: [],
  };
}

export async function main(argv) {
  const args = [...argv];
  const json = args.includes('--json');
  const rest = args.filter((arg) => arg !== '--json');
  let root = DEFAULT_ROOT;
  const rootIndex = rest.indexOf('--root');
  if (rootIndex !== -1) {
    root = path.resolve(rest[rootIndex + 1] || '.');
    rest.splice(rootIndex, 2);
  }
  const [command, ...extra] = rest;
  if (extra.length > 0 || !['source', 'dist', 'status'].includes(command)) {
    process.stderr.write('Usage: node scripts/local-search/check.mjs <source|dist|status> [--json] [--root <dir>]\n');
    return 2;
  }
  let report;
  try {
    report = command === 'source' ? sourceReport(root) : command === 'dist' ? distReport(root) : statusReport(root);
  } catch (error) {
    if (error instanceof Prerequisite) {
      process.stderr.write(`  FAIL prerequisite missing: ${error.message}\n`);
      return 2;
    }
    throw error;
  }
  if (json) {
    const { violations, ...summary } = report;
    process.stdout.write(`${JSON.stringify({ ...summary, violations: violations || [] }, null, 2)}\n`);
  } else {
    if (command === 'status') process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    for (const warning of report.warnings) process.stderr.write(`  warn ${warning}\n`);
    if (report.failures.length > 0) {
      process.stderr.write(`  FAIL local search ${command} check found ${report.failures.length} problem(s) (${report.site_env || 'unknown'} build):\n`);
      for (const failure of report.failures) process.stderr.write(`      - ${failure}\n`);
    } else if (command !== 'status') {
      process.stdout.write(`  ok   local search ${command} check passed (${report.site_env} build${command === 'dist' ? `, ${report.pages} page(s)` : ''}; ${report.warnings.length} warning(s))\n`);
    }
  }
  return report.failures.length > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
