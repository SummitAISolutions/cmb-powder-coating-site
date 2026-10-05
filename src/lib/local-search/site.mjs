/**
 * search/site.json — the site's route inventory and search policy.
 *
 * One small file answers, deterministically: which public routes exist, what
 * each one's title/description/h1 is, which are indexable, what sits in the
 * sitemap, how breadcrumbs nest, which service or service area a page is
 * about, how crawlers are treated, and (optionally) each route's intent and
 * the approved conversion destinations (intent.mjs). The build renders from
 * it, the build check verifies the output against it, and Summit's QA config
 * generator projects Stage 4's contract from it.
 *
 * Indexability has two independent inputs:
 *   - the BUILD MODE, from the SUMMIT_SITE_ENV environment variable:
 *       unset / "preview"  → every page is noindex (the safe default)
 *       "production"       → routes are indexable per site.json
 *     Anything else stops the build.
 *   - the site's production intent, site.json `indexing.production`
 *     ("index", or "noindex" only as an explicit, committed decision).
 *
 * Pure functions only; no filesystem access.
 */

import { isTemplateEntity, normalizeText, serviceAreaNames, PLACEHOLDER_MARKERS } from './entity.mjs';
import { CRAWLER_AGENTS, CRAWLER_REGISTRY_VERSION, findAgent } from './crawlers.mjs';
import { intentProblems } from './intent.mjs';

export const SITE_SCHEMA_VERSION = 1;
export const SITE_PATH = 'search/site.json';
export const SITE_ENV_VARIABLE = 'SUMMIT_SITE_ENV';
export const SITE_ENVS = ['preview', 'production'];
// The build stamps its mode into every page so QA can tell a Summit preview
// build's intentional noindex from a stray one.
export const SITE_ENV_META = 'summit-site-env';

export const ROUTE_KINDS = ['home', 'service', 'location', 'about', 'contact', 'content', 'legal', 'utility', 'error'];
const NON_INDEXABLE_KINDS = ['utility', 'error'];
export const LOCAL_SIGNALS = ['local-jobs', 'local-photos', 'local-reviews', 'local-case-study', 'local-information', 'local-team', 'local-pricing'];

// Crawler policy (see crawlers.mjs for the agents and their verified meaning):
//   search    "allow" (default) | "disallow" — search / indexing / retrieval agents
//   training  "allow" | "disallow" | "unset" — training / non-search agents;
//             "unset" writes no rule for them, so they follow the
//             `User-agent: *` group (which always allows crawling)
//   agents    optional per-agent override { "<registry token>": "allow" | "disallow" }
export const SEARCH_POLICIES = ['allow', 'disallow'];
export const TRAINING_POLICIES = ['allow', 'disallow', 'unset'];

// Future integrations. v1 implements none of them; the keys exist so their
// place in the contract is fixed, and every value must stay null. IndexNow, if
// ever enabled, only notifies participating engines (Google does not
// participate); it guarantees no crawling or indexing.
export const INTEGRATION_SEAMS = ['searchConsole', 'bingWebmaster', 'indexNow', 'aiSearchMonitoring'];

const TOP_KEYS = ['schemaVersion', 'intentContract', 'routes', 'indexing', 'crawlers', 'icons', 'defaultOgImage', 'logo', 'integrations', 'conversion'];
const ROUTE_KEYS = ['id', 'path', 'kind', 'title', 'description', 'heading', 'breadcrumb', 'parent', 'indexable', 'service', 'area', 'localSignals', 'ogImage', 'intent', 'primaryCta', 'necessity'];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const normPath = (value) => {
  const text = String(value || '/');
  return text.length > 1 ? text.replace(/\/+$/, '') || '/' : text;
};

/** A route with defaults applied. */
export function normalizeRoute(route) {
  const kind = route.kind;
  return {
    id: route.id,
    path: route.path,
    kind,
    title: route.title ?? null,
    description: route.description ?? null,
    heading: route.heading ?? null,
    breadcrumb: route.breadcrumb ?? null,
    parent: route.parent ?? (kind === 'home' || kind === 'error' ? null : 'home'),
    indexable: route.indexable === undefined ? !NON_INDEXABLE_KINDS.includes(kind) : route.indexable === true,
    service: route.service ?? null,
    area: route.area ?? null,
    localSignals: Array.isArray(route.localSignals) ? route.localSignals : [],
    ogImage: route.ogImage ?? null,
    // Route intent v1 (intent.mjs): optional, never defaulted.
    intent: route.intent ?? null,
    primaryCta: route.primaryCta ?? null,
    // Route necessity (intent contract 2): why this page exists on its own.
    necessity: route.necessity ?? null,
  };
}

export const routesOf = (site) => (isObject(site) && Array.isArray(site.routes) ? site.routes.filter(isObject).map(normalizeRoute) : []);
export const findRoute = (site, id) => routesOf(site).find((route) => route.id === id) || null;

/**
 * Problems with site.json on its own and against the entity. Pure.
 * Returns { problems, warnings }.
 */
export function siteProblems(site, entity) {
  const problems = [];
  const warnings = [];
  if (!isObject(site)) return { problems: ['site.json must be a JSON object'], warnings };
  for (const key of Object.keys(site)) if (!TOP_KEYS.includes(key)) problems.push(`unknown key "${key}"`);
  if (site.schemaVersion !== SITE_SCHEMA_VERSION) problems.push(`schemaVersion must be ${SITE_SCHEMA_VERSION}`);
  const template = isTemplateEntity(entity);

  if (!Array.isArray(site.routes) || site.routes.length === 0) problems.push('routes must list every public page (at least the home page)');
  const ids = new Set();
  const paths = new Set();
  for (const [index, raw] of (Array.isArray(site.routes) ? site.routes : []).entries()) {
    const where = `routes[${index}]`;
    if (!isObject(raw)) {
      problems.push(`${where} must be an object`);
      continue;
    }
    for (const key of Object.keys(raw)) if (!ROUTE_KEYS.includes(key)) problems.push(`${where}: unknown key "${key}"`);
    const route = normalizeRoute(raw);
    if (!SLUG_RE.test(route.id || '')) problems.push(`${where}.id must be a slug`);
    else if (ids.has(route.id)) problems.push(`${where}: duplicate route id "${route.id}"`);
    ids.add(route.id);
    if (!ROUTE_KINDS.includes(route.kind)) problems.push(`${where}.kind must be one of ${ROUTE_KINDS.join(', ')}`);
    if (!isText(route.path) || !route.path.startsWith('/') || route.path.includes('..') || /[?#\s]/.test(route.path)) problems.push(`${where}.path must be an absolute site path`);
    else if (route.kind !== 'error' && route.path !== '/' && !route.path.endsWith('/')) problems.push(`${where}.path must end with "/" (the starter builds directory-style URLs; the canonical URL uses this exact path)`);
    else if (paths.has(normPath(route.path))) problems.push(`${where}: duplicate path "${route.path}"`);
    paths.add(normPath(route.path));
    if (raw.indexable !== undefined && typeof raw.indexable !== 'boolean') problems.push(`${where}.indexable must be true or false`);
    if (route.kind === 'home' && route.path !== '/') problems.push(`${where}: the home route must have path "/"`);
    if (route.kind === 'error' && route.indexable) problems.push(`${where}: an error page is never indexable`);
    for (const field of ['title', 'heading']) if (!isText(route[field])) problems.push(`${where}.${field} is required (it is the page's ${field === 'title' ? '<title>' : 'h1'})`);
    if (route.kind !== 'error' && !isText(route.description)) problems.push(`${where}.description is required (meta description)`);

    if (route.kind === 'service') {
      if (!isText(route.service)) problems.push(`${where}: a service page names the entity service it is about (service: <services[].id>)`);
      else if (!template && !(entity.services || []).some((service) => service.id === route.service)) problems.push(`${where}.service "${route.service}" is not a service in business-entity.json`);
    } else if (route.service !== null) problems.push(`${where}.service is only for kind "service"`);

    if (route.kind === 'location') {
      if (!isText(route.area)) problems.push(`${where}: a location page names the approved service area it serves (area: <serviceAreas[].name>)`);
      else if (template || !serviceAreaNames(entity).some((name) => normalizeText(name) === normalizeText(route.area))) {
        problems.push(`${where}.area "${route.area}" is not an approved service area in business-entity.json — a location page may exist only for an area the client genuinely serves`);
      }
    } else if (route.area !== null) problems.push(`${where}.area is only for kind "location"`);

    for (const signal of route.localSignals) if (!LOCAL_SIGNALS.includes(signal)) problems.push(`${where}.localSignals: unknown signal "${signal}" (${LOCAL_SIGNALS.join(', ')})`);
    if (route.localSignals.length > 0 && route.kind !== 'location') problems.push(`${where}.localSignals is only for kind "location"`);
    if (route.ogImage !== null && !isText(route.ogImage)) problems.push(`${where}.ogImage must be a path or URL, or null`);
  }

  const routes = routesOf(site);
  const homes = routes.filter((route) => route.kind === 'home');
  if (homes.length !== 1) problems.push('exactly one route must have kind "home"');
  for (const route of routes) {
    if (route.parent !== null && !ids.has(route.parent)) problems.push(`route "${route.id}": parent "${route.parent}" is not a route id`);
    const seen = new Set([route.id]);
    for (let parent = route.parent; parent; parent = (routes.find((r) => r.id === parent) || {}).parent) {
      if (seen.has(parent)) {
        problems.push(`route "${route.id}": breadcrumb parents form a cycle`);
        break;
      }
      seen.add(parent);
    }
  }
  // Route intent and conversion destinations (intent.mjs).
  const intent = intentProblems(site, entity, routes);
  problems.push(...intent.problems);
  warnings.push(...intent.warnings);
  if (!routes.some((route) => route.kind === 'error')) warnings.push('no error route: add src/pages/404.astro with a kind "error" route so unknown paths answer a real 404');

  // Weak or duplicate metadata (warnings, never word counts).
  const byTitle = new Map();
  for (const route of routes.filter((r) => r.indexable)) {
    const key = normalizeText(route.title);
    byTitle.set(key, [...(byTitle.get(key) || []), route.id]);
    if (isText(route.description) && normalizeText(route.description) === normalizeText(route.title)) warnings.push(`route "${route.id}": the meta description repeats the title`);
  }
  for (const [, list] of byTitle) if (list.length > 1) warnings.push(`routes ${list.join(', ')} share one title; each indexable page needs its own`);
  if (!template) {
    for (const route of routes) {
      const text = [route.title, route.description, route.heading].join(' ').toLowerCase();
      for (const marker of PLACEHOLDER_MARKERS) if (text.includes(marker.toLowerCase())) problems.push(`route "${route.id}" still contains the placeholder "${marker}"`);
    }
  }

  // Indexing intent.
  if (!isObject(site.indexing) || !['index', 'noindex'].includes(site.indexing.production)) {
    problems.push('indexing.production must be "index" or "noindex" (noindex only as an explicit decision)');
  } else if (site.indexing.production === 'noindex') {
    warnings.push('indexing.production is "noindex": the production site will be kept out of search indexes on purpose');
  }

  // Crawler policy: search and training are separate decisions.
  if (!isObject(site.crawlers)) problems.push('crawlers must be { registry, search, training, agents? }');
  else {
    const crawlers = site.crawlers;
    for (const key of Object.keys(crawlers)) if (!['registry', 'search', 'training', 'agents'].includes(key)) problems.push(`crawlers: unknown key "${key}"`);
    if (crawlers.registry !== CRAWLER_REGISTRY_VERSION) {
      problems.push(`crawlers.registry is ${JSON.stringify(crawlers.registry)} but the crawler registry is "${CRAWLER_REGISTRY_VERSION}": re-review the crawler policy against the current registry, then record its version`);
    }
    if (!SEARCH_POLICIES.includes(crawlers.search)) problems.push(`crawlers.search must be one of ${SEARCH_POLICIES.join(', ')}`);
    if (!TRAINING_POLICIES.includes(crawlers.training)) problems.push(`crawlers.training must be one of ${TRAINING_POLICIES.join(', ')}`);
    const indexed = isObject(site.indexing) && site.indexing.production === 'index';
    if (crawlers.search === 'disallow' && indexed) problems.push('crawlers.search is "disallow" while indexing.production is "index": blocking search crawlers would keep the site out of search');
    if (crawlers.agents !== undefined && crawlers.agents !== null) {
      if (!isObject(crawlers.agents)) problems.push('crawlers.agents must map registry tokens to "allow" or "disallow"');
      else for (const [token, value] of Object.entries(crawlers.agents)) {
        const agent = findAgent(token);
        if (!agent) problems.push(`crawlers.agents: "${token}" is not in the crawler registry (${CRAWLER_REGISTRY_VERSION}); add it to crawlers.mjs deliberately rather than per site`);
        else if (!['allow', 'disallow'].includes(value)) problems.push(`crawlers.agents.${token} must be "allow" or "disallow"`);
        else if (agent.category === 'search' && value === 'disallow' && indexed) warnings.push(`crawlers.agents: ${agent.token} (a search/retrieval agent) is disallowed; the site will not be available to ${agent.operator} through it`);
      }
    }
  }

  // Assets and seams.
  if (site.icons !== undefined && site.icons !== null) {
    if (!isObject(site.icons)) problems.push('icons must be { favicon, appleTouchIcon }');
    else for (const [key, value] of Object.entries(site.icons)) {
      if (!['favicon', 'appleTouchIcon'].includes(key)) problems.push(`icons: unknown key "${key}"`);
      else if (value !== null && (!isText(value) || !value.startsWith('/'))) problems.push(`icons.${key} must be a site path under public/ (e.g. "/favicon.svg") or null`);
    }
  }
  if (!isObject(site.icons) || !site.icons.favicon) warnings.push('no favicon configured (icons.favicon); add a real brand asset from RESOURCES.md when one exists');
  if (site.defaultOgImage !== undefined && site.defaultOgImage !== null && !isText(site.defaultOgImage)) problems.push('defaultOgImage must be a path or URL, or null');
  if (site.logo !== undefined && site.logo !== null && (!isObject(site.logo) || !isText(site.logo.url))) problems.push('logo must be { url } for a real logo asset, or null');
  if (site.integrations !== undefined && site.integrations !== null) {
    if (!isObject(site.integrations)) problems.push('integrations must be an object');
    else for (const [key, value] of Object.entries(site.integrations)) {
      if (!INTEGRATION_SEAMS.includes(key)) problems.push(`integrations: unknown key "${key}"`);
      else if (value !== null) problems.push(`integrations.${key}: not implemented in v1 — the value must stay null (see docs/local-search.md, deferred)`);
    }
  }
  return { problems, warnings };
}

/**
 * The build mode. Unset means preview: a build is only indexable when someone
 * asked for production explicitly. An unknown value throws.
 */
export function resolveSiteEnv(env = {}) {
  const raw = env[SITE_ENV_VARIABLE];
  if (raw === undefined || raw === null || raw === '') return 'preview';
  if (!SITE_ENVS.includes(raw)) throw new Error(`${SITE_ENV_VARIABLE} must be "preview" or "production" (got "${raw}"); unset means preview`);
  return raw;
}

/** The build environment of the current process, read without assuming a Node global exists. */
export const buildSiteEnv = () => resolveSiteEnv((globalThis.process && globalThis.process.env) || {});

/** Whether a route is intended to be indexed in production. */
export const intendedIndexable = (site, route) => Boolean(route.indexable && route.kind !== 'error' && isObject(site.indexing) && site.indexing.production === 'index');

/** The robots meta content for a route in a build mode, or null for "no directive" (indexable). */
export function robotsDirective(site, route, siteEnv) {
  if (siteEnv !== 'production') return 'noindex';
  return intendedIndexable(site, route) ? null : 'noindex';
}

/** The website origin (no trailing slash), or null when facts do not record one. */
export function siteOrigin(entity) {
  if (!isObject(entity) || !isText(entity.url)) return null;
  try {
    return new URL(entity.url).origin;
  } catch {
    return null;
  }
}

/** The production canonical URL of a route, or null. Previews point at production too. */
export function canonicalUrl(entity, route) {
  const origin = siteOrigin(entity);
  if (!origin || !route || route.kind === 'error') return null;
  return `${origin}${route.path}`;
}

/** Routes the sitemap lists: indexable in production, never an error page. */
export const sitemapRoutes = (site) => routesOf(site).filter((route) => intendedIndexable(site, route));

const xmlEscape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function sitemapXml(site, entity) {
  const origin = siteOrigin(entity);
  const urls = origin ? sitemapRoutes(site).map((route) => `  <url><loc>${xmlEscape(`${origin}${route.path}`)}</loc></url>`) : [];
  const note = origin ? '' : '\n  <!-- No website origin in search/business-entity.json (url): no absolute URLs can be listed yet. -->';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${note}\n${urls.join('\n')}${urls.length ? '\n' : ''}</urlset>\n`;
}

/**
 * robots.txt. It never blocks crawling of a preview: a crawler must be able to
 * fetch a page to see its noindex. Category rules are emitted only for named
 * user agents; nothing is assumed about any crawler.
 */
export function robotsTxt(site, entity, siteEnv) {
  const lines = ['# Generated from search/site.json by the Summit website starter. Do not edit by hand.'];
  if (siteEnv !== 'production') {
    lines.push('# Preview build: every page carries <meta name="robots" content="noindex">.', '# Crawling is not blocked, so that noindex can be seen.');
  }
  lines.push('', 'User-agent: *', 'Allow: /');
  let category = null;
  for (const [token, access] of Object.entries(crawlerAccess(site))) {
    if (access === 'unset') continue;
    const agent = findAgent(token);
    if (agent.category !== category) {
      category = agent.category;
      lines.push('', `# ${category === 'search' ? 'Search, indexing and retrieval agents' : 'Training and non-search agents'} (registry ${CRAWLER_REGISTRY_VERSION})`);
    }
    lines.push('', `User-agent: ${token}`, access === 'disallow' ? 'Disallow: /' : 'Allow: /');
  }
  const origin = siteOrigin(entity);
  if (siteEnv === 'production' && origin) lines.push('', `Sitemap: ${origin}/sitemap.xml`);
  return `${lines.join('\n')}\n`;
}

/**
 * The robots decision for every registry agent: "allow", "disallow" or
 * "unset" (no rule; the agent follows `User-agent: *`). Category policy first,
 * then per-agent overrides. An invalid policy yields "unset" for its category.
 */
export function crawlerAccess(site) {
  const crawlers = isObject(site) && isObject(site.crawlers) ? site.crawlers : {};
  const overrides = isObject(crawlers.agents) ? Object.fromEntries(Object.entries(crawlers.agents).map(([token, value]) => [String(token).toLowerCase(), value])) : {};
  const access = {};
  for (const agent of CRAWLER_AGENTS) {
    const categoryPolicy = agent.category === 'search' ? (SEARCH_POLICIES.includes(crawlers.search) ? crawlers.search : 'allow') : TRAINING_POLICIES.includes(crawlers.training) ? crawlers.training : 'unset';
    const override = overrides[agent.token.toLowerCase()];
    access[agent.token] = ['allow', 'disallow'].includes(override) ? override : categoryPolicy;
  }
  return access;
}

/** Home → … → route, following `parent`. */
export function breadcrumbTrail(site, routeId) {
  const routes = routesOf(site);
  const trail = [];
  const seen = new Set();
  for (let route = routes.find((r) => r.id === routeId); route && !seen.has(route.id); route = routes.find((r) => r.id === route.parent)) {
    seen.add(route.id);
    trail.unshift({ id: route.id, path: route.path, name: route.breadcrumb || route.heading });
  }
  return trail;
}
