/**
 * Screenshot harness — pure pieces (argument parsing, the viewport matrix,
 * route discovery, output paths). No Playwright import here, so these can be
 * tested without a browser.
 */

import fs from 'node:fs';
import path from 'node:path';

export const MANIFEST_SCHEMA_VERSION = 1;
export const DEFAULT_OUT_DIR = 'visual/screenshots';
export const DEFAULT_DIST_DIR = 'dist';

/**
 * The viewport matrix. Deliberately small: this harness makes rendered output
 * visible to a critic; it is not a device lab. Changing a size changes every
 * future screenshot, so treat these as a contract.
 */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 },
};
export const DEFAULT_VIEWPORTS = ['desktop', 'mobile'];

export class UsageError extends Error {}

export function parseArgs(argv) {
  const options = {
    dist: DEFAULT_DIST_DIR,
    out: DEFAULT_OUT_DIR,
    viewports: [...DEFAULT_VIEWPORTS],
    routes: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new UsageError(`${arg} requires a value`);
      i += 1;
      return next;
    };
    if (arg === '-h' || arg === '--help') options.help = true;
    else if (arg === '--dist') options.dist = value();
    else if (arg === '--out') options.out = value();
    else if (arg === '--viewports') options.viewports = value().split(',').map((v) => v.trim()).filter(Boolean);
    else if (arg === '--routes') options.routes = value().split(',').map((r) => r.trim()).filter(Boolean);
    else throw new UsageError(`Unknown option: ${arg}`);
  }
  const unknown = options.viewports.filter((name) => !VIEWPORTS[name]);
  if (unknown.length > 0) {
    throw new UsageError(`Unknown viewport(s): ${unknown.join(', ')} (available: ${Object.keys(VIEWPORTS).join(', ')})`);
  }
  if (options.viewports.length === 0) throw new UsageError('--viewports must name at least one viewport');
  if (options.routes) {
    for (const route of options.routes) {
      if (!route.startsWith('/') || route.includes('..')) throw new UsageError(`Route "${route}" must be an absolute site path like /about/`);
    }
  }
  return options;
}

/** "/" -> "home", "/services/drain-repair/" -> "services--drain-repair". */
export function routeSlug(route) {
  const trimmed = String(route).replace(/^\/+|\/+$/g, '');
  if (trimmed === '') return 'home';
  return trimmed.replace(/\/+/g, '--').replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Every page in a static build, as sorted site routes. 404 pages are excluded. */
export function discoverRoutes(distDir) {
  const routes = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (entry.name === 'index.html') routes.push(`/${prefix}`);
      else if (entry.name.endsWith('.html') && entry.name !== '404.html') routes.push(`/${prefix}${entry.name}`);
    }
  };
  walk(distDir, '');
  return routes.filter((route) => !/^\/404\/?$/.test(route)).sort();
}

/** Problems that stop a run before any browser starts. */
export function preflightProblems({ root, dist }) {
  const distDir = path.resolve(root, dist);
  if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
    return [`build output "${dist}/" does not exist. Run \`npm run build\` first — screenshots are taken of the built site, never of a dev server.`];
  }
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    return [`"${dist}/index.html" is missing. The build did not produce a home page to capture.`];
  }
  return [];
}

/**
 * Two captures per route and viewport:
 *   <slug>.png       full page — the whole composition and its rhythm
 *   <slug>--fold.png the first viewport — what a visitor sees before scrolling
 * Full-page captures draw position:fixed elements (e.g. a sticky mobile CTA)
 * where they sit in the first viewport, so a critic judges fixed UI from the
 * fold capture.
 */
export function capturePlan({ routes, viewports, out }) {
  const plan = [];
  for (const viewport of viewports) {
    for (const route of routes) {
      const base = `${out}/${viewport}/${routeSlug(route)}`;
      plan.push({
        route,
        viewport,
        width: VIEWPORTS[viewport].width,
        height: VIEWPORTS[viewport].height,
        file: `${base}.png`,
        fold_file: `${base}--fold.png`,
      });
    }
  }
  return plan;
}
