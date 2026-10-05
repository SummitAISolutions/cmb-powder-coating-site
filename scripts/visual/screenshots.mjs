#!/usr/bin/env node
/**
 * Capture full-page screenshots of the BUILT site across a small viewport
 * matrix, for visual critique.
 *
 *   npm run build
 *   npm run screenshots
 *   npm run screenshots -- --routes /,/contact/ --viewports desktop,mobile,tablet
 *
 * Output (deterministic paths):
 *   visual/screenshots/<viewport>/<route-slug>.png        full page
 *   visual/screenshots/<viewport>/<route-slug>--fold.png  first viewport only
 *   visual/screenshots/manifest.json
 *
 * This is a capture harness only — not QA. It asserts nothing about the page.
 * It serves dist/ from a local, loopback-only static server, never a dev
 * server, and it never downloads a browser: a missing prerequisite stops the
 * run with the exact command to fix it.
 *
 * Exit codes: 0 ok, 1 capture failure, 2 usage error or missing prerequisite.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MANIFEST_SCHEMA_VERSION,
  UsageError,
  VIEWPORTS,
  capturePlan,
  discoverRoutes,
  parseArgs,
  preflightProblems,
} from './lib/screenshots.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const USAGE = `Usage: npm run screenshots -- [--routes /,/about/] [--viewports desktop,mobile] [--dist dist] [--out visual/screenshots]`;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

/** Minimal static server for dist/, bound to 127.0.0.1 on an ephemeral port. */
function serveStatic(distDir) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    let relative = decodeURIComponent(url.pathname);
    if (relative.endsWith('/')) relative += 'index.html';
    let file = path.join(distDir, relative);
    if (!file.startsWith(distDir + path.sep) && file !== distDir) {
      response.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      const notFound = path.join(distDir, '404.html');
      response.writeHead(404, { 'content-type': CONTENT_TYPES['.html'] });
      response.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not found');
      return;
    }
    response.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' });
    response.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return null;
  }
}

export async function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`  FAIL ${error.message}\n${USAGE}\n`);
      return 2;
    }
    throw error;
  }
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  const problems = preflightProblems({ root: ROOT, dist: options.dist });
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`  FAIL ${problem}\n`);
    return 2;
  }

  const playwright = await loadPlaywright();
  if (!playwright) {
    process.stderr.write('  FAIL playwright is not installed. Run `npm install` in this repository.\n');
    return 2;
  }

  const distDir = path.resolve(ROOT, options.dist);
  const routes = options.routes ?? discoverRoutes(distDir);
  const plan = capturePlan({ routes, viewports: options.viewports, out: options.out });

  let browser;
  try {
    browser = await playwright.chromium.launch();
  } catch (error) {
    const firstLine = String(error.message || error).split('\n').find(Boolean) || 'launch failed';
    process.stderr.write(
      `  FAIL Chromium could not be launched for Playwright: ${firstLine}\n` +
        '       If the browser is not installed, run `npx playwright install chromium` once.\n' +
        '       This script never downloads a browser itself.\n'
    );
    return 2;
  }

  const browserVersion = browser.version();
  const server = await serveStatic(distDir);
  const base = `http://127.0.0.1:${server.address().port}`;
  const captures = [];
  let failures = 0;

  try {
    for (const entry of plan) {
      const context = await browser.newContext({
        viewport: { width: entry.width, height: entry.height },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
        colorScheme: 'light',
        locale: 'en-US',
        timezoneId: 'UTC',
      });
      const page = await context.newPage();
      try {
        const response = await page.goto(`${base}${entry.route}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        const absolute = path.resolve(ROOT, entry.file);
        fs.mkdirSync(path.dirname(absolute), { recursive: true });
        const shot = { animations: 'disabled', caret: 'hide' };
        await page.screenshot({ ...shot, path: path.resolve(ROOT, entry.fold_file), fullPage: false });
        await page.screenshot({ ...shot, path: absolute, fullPage: true });
        // An observation for the critic, not a pass/fail assertion.
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        captures.push({
          ...entry,
          http_status: response ? response.status() : null,
          horizontal_overflow: scrollWidth > entry.width,
        });
        process.stdout.write(`  ok   ${entry.viewport.padEnd(8)} ${entry.route} -> ${entry.file}${scrollWidth > entry.width ? '  (horizontal overflow)' : ''}\n`);
      } catch (error) {
        failures += 1;
        captures.push({ ...entry, http_status: null, horizontal_overflow: null, error: String(error.message || error).split('\n')[0] });
        process.stderr.write(`  FAIL ${entry.viewport} ${entry.route}: ${error.message}\n`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  const manifest = {
    schema_version: MANIFEST_SCHEMA_VERSION,
    tool: 'scripts/visual/screenshots.mjs',
    browser: `chromium ${browserVersion}`,
    captured_at: new Date().toISOString(),
    dist: options.dist,
    viewports: Object.fromEntries(options.viewports.map((name) => [name, VIEWPORTS[name]])),
    routes,
    captures,
  };
  const manifestFile = path.resolve(ROOT, options.out, 'manifest.json');
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`  ok   manifest: ${path.relative(ROOT, manifestFile)} (${captures.length - failures}/${captures.length} captured)\n`);
  return failures > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
