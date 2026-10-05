/**
 * Route intent and conversion destinations — the parts of search/site.json a
 * QA contract is generated from, plus the semantic marker convention the
 * starter renders.
 *
 * Route intent v1 is deliberately small. site.json already says, per route,
 * the id, path, page kind, h1, service or service area, and indexability; a
 * route may add:
 *   intent       "convert" | "inform" | "reference" (optional, never defaulted)
 *   primaryCta   the id of the conversion action this page exists for
 *
 * `conversion` (optional, top level) lists the approved conversion actions:
 *   ctas   [{ id, kind, target, routes?, viewports?, handoff? }]
 *   forms  [{ id, route, mode, sandbox?, lead? }]
 *
 * A form with a `lead` block is a Summit lead form (Standard Lead Adapter v1,
 * src/lib/leads/): its approved fields, consent wording and server-side
 * destination. Its proof mode may be `lead-receipt` (end-to-end receipt
 * through the lead endpoint's QA test sink).
 *
 * A CTA destination is a REFERENCE, never a literal, so client truth is not
 * typed twice: `entity:primaryPhone`, `entity:emails.<n>`, `entity:bookingUrl`,
 * `entity:contactUrl` (all from business-entity.json, and so from facts.md) or
 * `route:<route id>` for an internal page.
 *
 * No keyword research, ranking targets, search volume or content briefs live
 * here, and nothing here is programmatic SEO. Pure functions only.
 */

import { isTemplateEntity } from './entity.mjs';
import { leadFormProblems } from '../leads/contract.mjs';
import { destinationProblems } from '../leads/destinations.mjs';

export const ROUTE_INTENTS = ['convert', 'inform', 'reference'];

/**
 * Route necessity (intent contract 2): every indexable page says why it must
 * exist on its own. A page exists for a distinct user need, never because a
 * template has one or because "more pages rank". A site declares the contract
 * with `"intentContract": 2`; routes then carry
 *
 *   necessity: {
 *     reason          see NECESSITY_REASONS
 *     userIntent      the visitor's problem this page answers
 *     searchIntent    what someone searching would be looking for (or null)
 *     conversionRole  what the page asks the visitor to do, and why here
 *     contentPurpose  what this page contains that no other page does
 *   }
 */
export const INTENT_CONTRACT_VERSION = 2;
export const NECESSITY_REASONS = ['entry', 'distinct-service', 'distinct-geography', 'distinct-conversion', 'trust-support-legal', 'distinct-information'];
const REASONS_BY_KIND = {
  home: ['entry'],
  service: ['distinct-service'],
  location: ['distinct-geography'],
  contact: ['distinct-conversion', 'trust-support-legal'],
  about: ['trust-support-legal', 'distinct-information'],
  legal: ['trust-support-legal'],
  content: ['distinct-information', 'distinct-conversion', 'trust-support-legal'],
};
const CONVENTION_RE = /\b(template|starter|boilerplate|convention|seo likes|for seo|more pages|page count|one page per (keyword|service|city)|keyword (page|variation)|we always|every site has|standard page|rank(ing)? (better|higher))\b/i;
export const CTA_KINDS = ['tel', 'sms', 'mailto', 'external-scheduler', 'internal'];
export const FORM_MODES = ['inspect', 'intercepted-submit', 'sandbox-receipt', 'lead-receipt'];
export const VIEWPORTS = ['desktop', 'mobile'];

/**
 * The semantic markers the starter renders (BaseLayout, SiteHeader, Button,
 * StickyMobileCTA, EntityFact, MediaFrame, and the form convention). A site QA
 * config that names this convention needs no CSS selectors: Stage 4 resolves
 * them from ids. Ids are slugs, so no escaping is needed.
 */
export const MARKER_CONVENTION = 'summit-markers-v1';
export const MARKERS = Object.freeze({
  navigation: '[data-nav="primary"]',
  navigationToggle: '[data-nav-toggle]',
  landmark: (routeId) => `main[data-route-landmark="${routeId}"]`,
  cta: (ctaId) => `[data-cta="${ctaId}"]`,
  form: (formId) => `form[data-form="${formId}"]`,
  imageSlot: (slotId) => `[data-slot="${slotId}"] img`,
});

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const TARGET_KINDS = {
  'entity:primaryPhone': ['tel', 'sms'],
  'entity:bookingUrl': ['external-scheduler'],
  'entity:contactUrl': ['external-scheduler', 'internal'],
};

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const originOf = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

/** The conversion block with defaults applied (arrays always present). */
export function conversionOf(site) {
  const conversion = isObject(site) && isObject(site.conversion) ? site.conversion : {};
  return {
    ctas: (Array.isArray(conversion.ctas) ? conversion.ctas : []).filter(isObject),
    forms: (Array.isArray(conversion.forms) ? conversion.forms : []).filter(isObject),
  };
}

/**
 * Resolve a CTA target against the entity and routes.
 * Returns { expected, providerOrigin, problem }. `expected` is what Stage 4
 * compares the rendered href with: a phone, an email, a URL prefix or a path.
 */
export function resolveCtaTarget(cta, { entity, routes }) {
  const target = String(cta.target || '');
  const none = (problem) => ({ expected: null, providerOrigin: null, problem });
  const route = /^route:(.+)$/.exec(target);
  if (route) {
    if (cta.kind !== 'internal') return none(`target "${target}" is an internal page; kind must be "internal"`);
    const found = routes.find((entry) => entry.id === route[1]);
    if (!found) return none(`target "${target}" names no route in site.json`);
    if (found.kind === 'error') return none(`target "${target}" is an error page`);
    return { expected: found.path, providerOrigin: null, problem: null };
  }
  const email = /^entity:emails\.(\d+)$/.exec(target);
  if (email) {
    if (cta.kind !== 'mailto') return none(`target "${target}" is an email; kind must be "mailto"`);
    const value = Array.isArray(entity && entity.emails) ? entity.emails[Number(email[1])] : null;
    return value ? { expected: value, providerOrigin: null, problem: null } : none(`target "${target}": business-entity.json records no such email`);
  }
  if (!TARGET_KINDS[target]) return none(`target "${target}" must be entity:primaryPhone, entity:emails.<n>, entity:bookingUrl, entity:contactUrl or route:<id>`);
  if (!TARGET_KINDS[target].includes(cta.kind)) return none(`target "${target}" cannot be a "${cta.kind}" CTA (allowed: ${TARGET_KINDS[target].join(', ')})`);
  const field = target.slice('entity:'.length);
  const value = entity ? entity[field] : null;
  if (!isText(value)) return none(`target "${target}": business-entity.json records no ${field}`);
  if (cta.kind === 'internal') {
    const siteOriginValue = originOf(entity.url);
    if (!siteOriginValue || originOf(value) !== siteOriginValue) return none(`target "${target}" is not on the website origin, so it cannot be an internal CTA`);
    return { expected: new URL(value).pathname, providerOrigin: null, problem: null };
  }
  if (cta.kind === 'external-scheduler') return { expected: value, providerOrigin: originOf(value), problem: null };
  return { expected: value, providerOrigin: null, problem: null };
}

/**
 * Problems with route intent and the conversion block. `routes` are
 * normalized site.json routes. Reference resolution against the entity runs
 * only for a client entity (a template entity records no destinations).
 * Returns { problems, warnings }.
 */
export function intentProblems(site, entity, routes) {
  const problems = [];
  const warnings = [];
  const template = isTemplateEntity(entity);
  const routeIds = new Set(routes.map((route) => route.id));
  const conversion = isObject(site) ? site.conversion : undefined;

  if (conversion !== undefined && conversion !== null) {
    if (!isObject(conversion)) problems.push('conversion must be { ctas, forms }');
    else for (const key of Object.keys(conversion)) if (!['ctas', 'forms'].includes(key)) problems.push(`conversion: unknown key "${key}"`);
  }
  const { ctas, forms } = conversionOf(site);
  const ctaIds = new Set();
  for (const [index, cta] of ctas.entries()) {
    const where = `conversion.ctas[${index}]`;
    for (const key of Object.keys(cta)) if (!['id', 'kind', 'target', 'routes', 'viewports', 'handoff'].includes(key)) problems.push(`${where}: unknown key "${key}"`);
    if (!SLUG_RE.test(cta.id || '')) problems.push(`${where}.id must be a slug (it is the data-cta marker)`);
    else if (ctaIds.has(cta.id)) problems.push(`${where}: duplicate CTA id "${cta.id}"`);
    ctaIds.add(cta.id);
    if (!CTA_KINDS.includes(cta.kind)) problems.push(`${where}.kind must be one of ${CTA_KINDS.join(', ')}`);
    if (!isText(cta.target)) problems.push(`${where}.target is required (a reference such as entity:primaryPhone, never a literal)`);
    else if (!template && CTA_KINDS.includes(cta.kind)) {
      const resolved = resolveCtaTarget(cta, { entity, routes });
      if (resolved.problem) problems.push(`${where}: ${resolved.problem}`);
    }
    if (cta.routes !== undefined && !Array.isArray(cta.routes)) problems.push(`${where}.routes must be a list of route ids`);
    for (const routeId of Array.isArray(cta.routes) ? cta.routes : []) if (!routeIds.has(routeId)) problems.push(`${where}.routes names unknown route "${routeId}"`);
    if (cta.viewports !== undefined && (!Array.isArray(cta.viewports) || cta.viewports.some((viewport) => !VIEWPORTS.includes(viewport)))) problems.push(`${where}.viewports must list ${VIEWPORTS.join(' and/or ')}`);
    if (cta.handoff !== undefined && typeof cta.handoff !== 'boolean') problems.push(`${where}.handoff must be true or false`);
    if (cta.handoff === true && cta.kind !== 'external-scheduler') problems.push(`${where}.handoff applies only to an external-scheduler CTA`);
  }

  const formIds = new Set();
  for (const [index, form] of forms.entries()) {
    const where = `conversion.forms[${index}]`;
    for (const key of Object.keys(form)) if (!['id', 'route', 'mode', 'sandbox', 'lead'].includes(key)) problems.push(`${where}: unknown key "${key}"`);
    if (!SLUG_RE.test(form.id || '')) problems.push(`${where}.id must be a slug (it is the form[data-form] marker)`);
    else if (formIds.has(form.id)) problems.push(`${where}: duplicate form id "${form.id}"`);
    formIds.add(form.id);
    if (!routeIds.has(form.route)) problems.push(`${where}.route must name a route id`);
    if (!FORM_MODES.includes(form.mode)) problems.push(`${where}.mode must be one of ${FORM_MODES.join(', ')}`);
    if (form.mode === 'sandbox-receipt') {
      const sandbox = isObject(form.sandbox) ? form.sandbox : {};
      if (!Array.isArray(sandbox.allowedOrigins) || sandbox.allowedOrigins.length === 0 || sandbox.allowedOrigins.some((origin) => !originOf(origin)) || !originOf(sandbox.receiptUrl)) {
        problems.push(`${where}: sandbox-receipt mode needs sandbox.allowedOrigins and sandbox.receiptUrl (a Summit-owned QA destination, never the client's live endpoint)`);
      }
    } else if (form.sandbox !== undefined) problems.push(`${where}.sandbox applies only to mode "sandbox-receipt"`);
    if (form.lead !== undefined) {
      problems.push(...leadFormProblems(form, { entity, template }));
      if (isObject(form.lead)) problems.push(...destinationProblems(form.lead.destination, `${where}.lead.destination`));
    } else if (form.mode === 'lead-receipt') problems.push(`${where}: mode "lead-receipt" proves a Summit lead form; add its lead block`);
  }

  problems.push(...necessityProblems(site, routes, forms, template));

  for (const route of routes) {
    if (route.intent !== null && !ROUTE_INTENTS.includes(route.intent)) problems.push(`route "${route.id}": intent must be one of ${ROUTE_INTENTS.join(', ')}`);
    if (route.primaryCta !== null) {
      if (!ctaIds.has(route.primaryCta)) problems.push(`route "${route.id}": primaryCta "${route.primaryCta}" is not a conversion.ctas id`);
      if (route.kind === 'error') problems.push(`route "${route.id}": an error page has no primaryCta`);
    }
    if (route.intent === 'convert' && route.primaryCta === null && !forms.some((form) => form.route === route.id)) {
      problems.push(`route "${route.id}": intent "convert" needs a primaryCta or a conversion form on the route`);
    }
  }
  for (const cta of ctas) {
    const onRoutes = new Set([...(Array.isArray(cta.routes) ? cta.routes : []), ...routes.filter((route) => route.primaryCta === cta.id).map((route) => route.id)]);
    if (SLUG_RE.test(cta.id || '') && onRoutes.size === 0) problems.push(`conversion CTA "${cta.id}" is required on no route (list it in routes, or name it as a route's primaryCta)`);
  }
  return { problems, warnings };
}

const normIntent = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Route necessity problems (intent contract 2). Warnings only for a site that has not adopted it. */
function necessityProblems(site, routes, forms, template) {
  const problems = [];
  const adopted = isObject(site) && site.intentContract === INTENT_CONTRACT_VERSION;
  if (isObject(site) && site.intentContract !== undefined && site.intentContract !== INTENT_CONTRACT_VERSION) problems.push(`intentContract must be ${INTENT_CONTRACT_VERSION}`);
  if (!adopted) return problems;
  const indexable = routes.filter((route) => route.indexable && !['error', 'utility'].includes(route.kind));
  const seenUser = new Map();
  const seenSearch = new Map();
  const seenService = new Map();
  for (const route of indexable) {
    const where = `route "${route.id}"`;
    const need = route.necessity;
    if (!isObject(need)) {
      problems.push(`${where}: an indexable page must say why it exists on its own (necessity: reason, userIntent, conversionRole, contentPurpose)`);
      continue;
    }
    for (const key of Object.keys(need)) if (!['reason', 'userIntent', 'searchIntent', 'conversionRole', 'contentPurpose'].includes(key)) problems.push(`${where}.necessity: unknown key "${key}"`);
    if (!NECESSITY_REASONS.includes(need.reason)) problems.push(`${where}.necessity.reason must be one of ${NECESSITY_REASONS.join(', ')}`);
    else if (REASONS_BY_KIND[route.kind] && !REASONS_BY_KIND[route.kind].includes(need.reason)) problems.push(`${where}: a ${route.kind} page cannot exist for "${need.reason}" (allowed: ${REASONS_BY_KIND[route.kind].join(', ')})`);
    for (const key of ['userIntent', 'conversionRole', 'contentPurpose']) {
      if (!isText(need[key]) || need[key].trim().length < 12) problems.push(`${where}.necessity.${key} must say it specifically`);
    }
    if (need.searchIntent !== undefined && need.searchIntent !== null && !isText(need.searchIntent)) problems.push(`${where}.necessity.searchIntent must be text or null`);
    const said = [need.userIntent, need.searchIntent, need.conversionRole, need.contentPurpose].filter(isText).join(' ');
    if (!template && CONVENTION_RE.test(said)) problems.push(`${where}: "${CONVENTION_RE.exec(said)[0]}" is a convention, not a reason for a page to exist — a page exists for a distinct visitor need`);
    if (need.reason === 'distinct-conversion' && route.primaryCta === null && !forms.some((form) => form.route === route.id)) problems.push(`${where}: a page that exists for its conversion journey needs a primaryCta or a form`);
    if (!template && isText(need.userIntent)) {
      const key = normIntent(need.userIntent);
      if (seenUser.has(key)) problems.push(`${where} answers the same visitor need as route "${seenUser.get(key)}"; merge them or state what differs`);
      else seenUser.set(key, route.id);
    }
    if (!template && isText(need.searchIntent)) {
      const key = normIntent(need.searchIntent);
      if (seenSearch.has(key)) problems.push(`${where} targets the same search intent as route "${seenSearch.get(key)}"; one page should own it`);
      else seenSearch.set(key, route.id);
    }
    if (route.kind === 'service' && isText(route.service)) {
      if (seenService.has(route.service)) problems.push(`${where} is a second page for service "${route.service}" (already route "${seenService.get(route.service)}"); one service, one page`);
      else seenService.set(route.service, route.id);
    }
  }
  return problems;
}
