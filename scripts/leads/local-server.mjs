#!/usr/bin/env node
/**
 * Summit local site server — the built site plus the real lead endpoint.
 *
 *   npm run local                 build, then serve (prints the local URL)
 *   npm run leads:local           serve an existing dist/
 *   node scripts/leads/local-server.mjs [--port 4321] [--host 127.0.0.1] [--json]
 *
 * It serves dist/ exactly as built and answers /api/lead with the same handler
 * the Cloudflare Pages Function uses (src/lib/leads/server.mjs), backed by a
 * durable file store in .summit-leads/ (git-ignored). With SUMMIT_LEAD_ENV
 * unset every submission goes to the local TEST SINK, which keeps the received
 * test leads in .summit-leads/ for inspection; nothing leaves the machine.
 * To try a real destination locally, a person sets SUMMIT_LEAD_ENV=production
 * and the destination's environment variables for that one run.
 *
 * A coding agent starts this itself and reports the printed URL; the operator
 * never needs the command. Stop with Ctrl+C.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { handleLeadRequest, LEAD_ENDPOINT, LIMITS, resolveLeadEnv, leadFormsOf } from '../../src/lib/leads/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff' };

/**
 * A durable, atomic file store: one JSON file per key, named by the sha256 of
 * the key (never by submitted content, so no personal data in file names).
 * `create` uses exclusive create, so two local requests cannot both win.
 */
export function fileStore(dir, { keepLeads = true } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const fileOf = (key) => path.join(dir, `${createHash('sha256').update(key).digest('hex')}.json`);
  const write = (file, record, flag) => {
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    if (flag === 'wx') {
      fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
      return;
    }
    fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`);
    fs.renameSync(tmp, file);
  };
  return {
    kind: 'file',
    durable: true,
    atomic: true,
    keepLeads,
    async get(key) {
      try {
        return JSON.parse(fs.readFileSync(fileOf(key), 'utf8')).record;
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
    async create(key, record) {
      try {
        write(fileOf(key), { key, record }, 'wx');
        return true;
      } catch (error) {
        if (error.code === 'EEXIST') return false;
        throw error;
      }
    },
    async put(key, record) {
      write(fileOf(key), { key, record });
    },
    /** Test-sink entries, newest first: { submission_id, form_id, received_at, lead? }. */
    sinkEntries() {
      return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))).filter((entry) => entry.key.startsWith('sink:')).map((entry) => entry.record).sort((a, b) => (a.receipt.received_at < b.receipt.received_at ? 1 : -1));
    },
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function toWebRequest(req, origin) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    chunks.push(chunk);
    // Stop reading past the limit; the handler still sees an oversized body and answers 413.
    if (total > LIMITS.bodyBytes) break;
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value);
  const method = String(req.method || 'GET').toUpperCase();
  return new Request(new URL(req.url, origin), { method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : Buffer.concat(chunks) });
}

function serveStatic(dist, pathname, res) {
  let relative = decodeURIComponent(pathname);
  if (relative.includes('\0')) relative = '/';
  let file = path.join(dist, path.normalize(relative).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(dist)) file = path.join(dist, 'index.html');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  else if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    return res.end(fs.readFileSync(file));
  }
  const notFound = path.join(dist, '404.html');
  res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
  return res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not found');
}

/**
 * Start the server. Returns { url, origin, store, close }. `env` defaults to
 * process.env; `port: 0` picks a free port.
 */
export async function startLocalServer({ root = DEFAULT_ROOT, port = 4321, host = '127.0.0.1', env = process.env, storeDir = null, log = () => {} } = {}) {
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist/ is missing or empty: run `npm run build` first (or `npm run local`, which builds)');
  const site = readJson(path.join(root, 'search/site.json'));
  const entity = readJson(path.join(root, 'search/business-entity.json'));
  const store = fileStore(storeDir || path.join(root, '.summit-leads'));
  let origin = null;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, origin);
      if (url.pathname === LEAD_ENDPOINT || url.pathname === `${LEAD_ENDPOINT}/`) {
        const response = await handleLeadRequest(await toWebRequest(req, origin), { env, site, entity, store, log });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        return res.end(Buffer.from(await response.arrayBuffer()));
      }
      return serveStatic(dist, url.pathname, res);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end(`local server error: ${String(error.message).split('\n')[0]}`);
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  origin = `http://${host}:${server.address().port}`;
  return {
    url: `${origin}/`,
    origin,
    store,
    site,
    close: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

function parseArgs(argv) {
  const options = { port: 4321, host: '127.0.0.1', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--port') options.port = Number(argv[++i]);
    else if (arg === '--host') options.host = argv[++i];
    else if (arg === '--json') options.json = true;
    else return { error: `unknown option ${arg}` };
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) return { error: '--port must be a port number' };
  return { options };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    console.error(`${parsed.error}\nusage: node scripts/leads/local-server.mjs [--port 4321] [--host 127.0.0.1] [--json]`);
    return 2;
  }
  const leadEnv = resolveLeadEnv(process.env);
  if (leadEnv.problem) {
    console.error(leadEnv.problem);
    return 2;
  }
  let server;
  try {
    server = await startLocalServer({ ...parsed.options, log: (event) => console.log(`lead: ${event.form_id || '-'} ${event.state || '-'}${event.code ? ` (${event.code})` : ''} → HTTP ${event.http_status}`) });
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const forms = leadFormsOf(server.site).map((form) => `${form.id} on route "${form.route}"`);
  const summary = { url: server.url, lead_endpoint: `${server.origin}${LEAD_ENDPOINT}`, lead_environment: leadEnv.environment, delivers_to: leadEnv.environment === 'preview' ? 'local test sink (.summit-leads/)' : 'the configured destination (production mode)', lead_forms: forms };
  if (parsed.options.json) console.log(JSON.stringify(summary));
  else {
    console.log(`Summit local site: ${summary.url}`);
    console.log(`Lead endpoint:     ${summary.lead_endpoint} (${summary.lead_environment}: ${summary.delivers_to})`);
    console.log(`Lead forms:        ${forms.length ? forms.join(', ') : 'none approved in search/site.json'}`);
    console.log('Stop with Ctrl+C.');
  }
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  await server.close();
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().then((code) => process.exit(code));
}
