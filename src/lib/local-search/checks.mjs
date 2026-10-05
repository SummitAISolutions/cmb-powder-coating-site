/**
 * Local Search Foundation v1 — deterministic analyzers.
 *
 * PURE functions from observed page data to violations. The same functions
 * judge a static build (`npm run search:verify`, fed by extractHtml below) and
 * a deployed preview (Stage 4, fed by Playwright observations). They never
 * fetch, never read files and never write.
 *
 * A violation is { rule_id, subject, expected, actual, route_id?, remediation? }.
 * `subject` is structural (a route, a field, a channel) so Stage 4 can
 * fingerprint it. A hidden address is never written into a violation.
 *
 * Page observation shape:
 *   { route_id, primary, text, html?, title, h1[], main_text, first_paragraph,
 *     meta: { description[], robots[], canonical[], site_env },
 *     x_robots_tag, jsonld: [{ parse_error, data }],
 *     entity_values: [{ field, text, href }], links: [{ href, text }] }
 *
 * No semantic hallucination detection happens here; Stage 4's independent
 * reviewer handles nuanced claims.
 */

import {
  isTemplateEntity, normalizeText, normalizePhone, normalizeEmail, hiddenAddressNeedles, publicAddress,
  addressLine, hoursText, serviceAreaNames, urlKey,
} from './entity.mjs';
import { breadcrumbTrail, canonicalUrl, crawlerAccess, routesOf, sitemapRoutes, siteOrigin } from './site.mjs';
import { findAgent } from './crawlers.mjs';

/**
 * Gate of every rule. Rules named facts-* and meta-* are also Stage 4 policy
 * rules with the same gate (npm run validate checks that they agree);
 * search-* rules exist only in the build check.
 */
export const LOCAL_SEARCH_RULES = {
  'facts-entity-source-conflict': 'hard',
  'facts-entity-address-leak': 'hard',
  'facts-entity-rendered-mismatch': 'hard',
  'facts-entity-schema-mismatch': 'hard',
  'facts-entity-unapproved-area': 'hard',
  'facts-entity-schema-rating': 'hard',
  'meta-jsonld-invalid': 'hard',
  'meta-canonical-wrong': 'hard',
  'meta-index-preview-indexable': 'hard',
  'meta-index-production-noindex': 'hard',
  'meta-sitemap-invalid': 'hard',
  'meta-index-build-env-mismatch': 'review',
  'meta-robots-policy-mismatch': 'review',
  'meta-location-similarity': 'review',
  'meta-index-preview-header-only': 'advisory',
  'search-route-missing': 'hard',
  'search-route-uninventoried': 'hard',
  'search-link-broken': 'hard',
  'search-404-missing': 'hard',
  'search-heading-anomaly': 'advisory',
  'search-weak-metadata': 'advisory',
  'search-orphan-route': 'advisory',
  'search-schema-optional-missing': 'advisory',
  'search-answer-first-opportunity': 'advisory',
  'search-origin-unknown': 'advisory',
};

export const LOCATION_SIMILARITY_THRESHOLD = 0.8;

const v = (ruleId, subject, expected, actual, extra = {}) => ({ rule_id: ruleId, subject, expected, actual, ...extra });
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const asList = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const hasNoindex = (value) => /\b(noindex|none)\b/i.test(String(value || ''));
const normPath = (value) => {
  const text = String(value || '/');
  return text.length > 1 ? text.replace(/\/+$/, '') || '/' : text;
};
const pathOf = (href, base = 'https://site.invalid') => {
  try {
    return new URL(href, base).pathname;
  } catch {
    return null;
  }
};

/** Every object node of a JSON-LD document, following @graph and arrays. */
export function jsonLdNodes(data) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (isObject(node)) {
      out.push(node);
      for (const [key, value] of Object.entries(node)) if (key !== '@context') walk(value);
    }
  };
  walk(data);
  return out;
}
const typesOf = (node) => asList(node['@type']).map(String);

// ------------------------------------------------------------ entity / NAP

const PHONE_TEXT_RE = /(?<![\d])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}(?![\d])/g;

/**
 * Rendered values against the entity: the hidden address never appears
 * (text, raw HTML or JSON-LD), every [data-entity] value equals the entity,
 * tel:/mailto: links and written phone numbers are the entity's, and the
 * primary page names the business.
 */
export function analyzeEntityConsistency({ entity, pages, checkContactText = true }) {
  const out = [];
  if (isTemplateEntity(entity)) return out;
  const needles = hiddenAddressNeedles(entity);
  const phone = entity.primaryPhone ? normalizePhone(entity.primaryPhone) : null;
  const emails = new Set((entity.emails || []).map(normalizeEmail));
  const areas = serviceAreaNames(entity).map(normalizeText);
  const services = (entity.services || []).map((service) => normalizeText(service.name));
  const hidden = isObject(entity.address) && entity.address.public !== true && isObject(entity.address.value);

  for (const page of pages) {
    const at = (ruleId, subject, expected, actual, extra) => out.push(v(ruleId, subject, expected, actual, { route_id: page.route_id, ...extra }));
    const leak = (channel) => at('facts-entity-address-leak', `address-leak:${channel}`, 'a hidden address (address.public false) never appears on the site', `the hidden street address appears in the ${channel} of this page (value withheld from this report)`, {
      remediation: 'Remove the address from the page and its structured data. A service-area business shows its service areas, not its private address.',
    });
    const text = ` ${normalizeText(page.text)} `;
    const html = page.html ? ` ${normalizeText(page.html)} ` : null;
    for (const needle of needles) {
      if (text.includes(` ${needle} `)) leak('rendered text');
      else if (html && html.includes(` ${needle} `)) leak('HTML source');
    }
    if (hidden) {
      for (const block of page.jsonld || []) {
        if (block.parse_error) continue;
        // Any street address in structured data while the address is hidden.
        if (jsonLdNodes(block.data).some((node) => node.streetAddress !== undefined)) leak('JSON-LD');
      }
    }

    for (const item of page.entity_values || []) {
      const got = String(item.text || '');
      const mismatch = (expected) => at('facts-entity-rendered-mismatch', `entity:${item.field}`, expected, `rendered "${got.trim().slice(0, 120)}"`);
      switch (item.field) {
        case 'publicName':
          if (normalizeText(got) !== normalizeText(entity.publicName)) mismatch(`publicName "${entity.publicName}"`);
          break;
        case 'primaryPhone':
          if (!phone || normalizePhone(got) !== phone || (item.href && normalizePhone(String(item.href).replace(/^tel:/i, '')) !== phone)) mismatch(`primaryPhone ${entity.primaryPhone || '(none recorded)'}`);
          break;
        case 'email':
          if (!emails.has(normalizeEmail(got)) || (item.href && !emails.has(normalizeEmail(decodeURIComponent(String(item.href).replace(/^mailto:/i, '').split('?')[0]))))) mismatch(`one of the entity emails (${[...emails].join(', ') || 'none recorded'})`);
          break;
        case 'address': {
          const address = publicAddress(entity);
          if (!address) {
            if (hidden) leak('address element');
            else mismatch('no address (the entity records none)');
          } else if (normalizeText(got) !== normalizeText(addressLine(address))) mismatch(`address "${addressLine(address)}"`);
          break;
        }
        case 'hours':
          if (normalizeText(got) !== normalizeText(hoursText(entity))) mismatch(`hours "${hoursText(entity) || '(none recorded)'}"`);
          break;
        case 'serviceAreas': {
          // Approved names are matched first, so an area that itself contains
          // "and" ("Utah and surrounding states") is never split apart; only
          // what remains is treated as further, unapproved areas (Pilot 1A).
          let rest = ` ${normalizeText(got)} `;
          for (const name of [...areas].sort((a, b) => b.length - a.length)) rest = rest.split(` ${name} `).join(' , ');
          const listed = rest.split(/[,;]|\band\b/).map(normalizeText).filter(Boolean);
          const unknown = listed.filter((name) => !areas.includes(name));
          if (unknown.length > 0) at('facts-entity-unapproved-area', `entity:serviceAreas:${unknown.join(',')}`, `only approved service areas (${serviceAreaNames(entity).join(', ')})`, `rendered "${got.trim().slice(0, 160)}"`);
          break;
        }
        case 'serviceArea':
          if (!areas.includes(normalizeText(got))) at('facts-entity-unapproved-area', `entity:serviceArea:${normalizeText(got)}`, `an approved service area (${serviceAreaNames(entity).join(', ')})`, `rendered "${got.trim()}"`);
          break;
        case 'service':
          if (!services.includes(normalizeText(got))) mismatch(`a service from the entity (${(entity.services || []).map((s) => s.name).join(', ')})`);
          break;
        default:
          at('facts-entity-rendered-mismatch', `entity:${item.field}`, 'a known data-entity field', `unknown field "${item.field}"`);
      }
    }

    if (checkContactText) {
      for (const link of page.links || []) {
        const href = String(link.href || '');
        if (/^(tel|sms):/i.test(href)) {
          const number = normalizePhone(href.slice(4).split(/[?&;]/)[0]);
          if (number !== phone) at('facts-entity-rendered-mismatch', `phone-link:${number}`, `the entity phone (${entity.primaryPhone || 'none recorded'})`, href);
        } else if (/^mailto:/i.test(href)) {
          const email = normalizeEmail(decodeURIComponent(href.slice(7).split('?')[0]));
          if (!emails.has(email)) at('facts-entity-rendered-mismatch', `email-link:${email}`, `an entity email (${[...emails].join(', ') || 'none recorded'})`, href);
        }
      }
      for (const match of String(page.text || '').matchAll(PHONE_TEXT_RE)) {
        const number = normalizePhone(match[0]);
        if (number.length === 10 && number !== phone) at('facts-entity-rendered-mismatch', `phone-text:${number}`, `only the entity phone (${entity.primaryPhone || 'none recorded'})`, `"${match[0]}"`);
      }
    }
    // Stage 4 already reports a missing business name (facts-business-name-missing).
    if (checkContactText && page.primary && !` ${normalizeText(`${page.title || ''} ${(page.h1 || []).join(' ')} ${page.text || ''}`)} `.includes(` ${normalizeText(entity.publicName)} `)) {
      at('facts-entity-rendered-mismatch', 'entity:publicName:missing', `"${entity.publicName}" on the primary page`, 'not present in title, h1 or text');
    }
  }
  return out;
}

// ----------------------------------------------------------------- JSON-LD

const businessTypes = (entity) => new Set([entity.schemaType, 'LocalBusiness', 'Organization'].filter(Boolean));

/** JSON-LD parses, and every business value in it is the entity's. */
export function analyzeJsonLd({ entity, pages }) {
  const out = [];
  const template = isTemplateEntity(entity);
  const origin = siteOrigin(entity);
  const types = template ? new Set() : businessTypes(entity);
  const areas = serviceAreaNames(entity).map(normalizeText);
  for (const page of pages) {
    const at = (ruleId, subject, expected, actual) => out.push(v(ruleId, subject, expected, actual, { route_id: page.route_id }));
    for (const [index, block] of (page.jsonld || []).entries()) {
      if (block.parse_error) {
        at('meta-jsonld-invalid', `jsonld:${index}`, 'JSON-LD parses as JSON', String(block.parse_error).slice(0, 200));
        continue;
      }
      if (template) continue;
      for (const node of jsonLdNodes(block.data)) {
        const nodeTypes = typesOf(node);
        const isBusiness = (typeof node['@id'] === 'string' && node['@id'].endsWith('#business')) || nodeTypes.some((type) => types.has(type));
        // Self-serving ratings: rating or review markup ABOUT the business
        // (on the business node, or a Review/AggregateRating whose itemReviewed
        // is the business). The entity holds no rating, so any such value is
        // unsupported. Rating or review markup about something else is not
        // judged here: visible rating claims stay under Stage 4's facts checks.
        const refersToBusiness = (item) => isObject(item) && ((typeof item['@id'] === 'string' && item['@id'].endsWith('#business')) || (item.name !== undefined && normalizeText(item.name) === normalizeText(entity.publicName)));
        const selfRating = refersToBusiness(node) && (node.aggregateRating !== undefined || node.review !== undefined);
        const aboutBusiness = (nodeTypes.includes('AggregateRating') || nodeTypes.includes('Review')) && asList(node.itemReviewed).some(refersToBusiness);
        if (selfRating || aboutBusiness) {
          at('facts-entity-schema-rating', `jsonld:rating:${selfRating ? (node.aggregateRating !== undefined ? 'aggregateRating' : 'review') : nodeTypes.join('+')}`, 'no self-serving AggregateRating/Review about the business (the entity records no rating; review stars for LocalBusiness/Organization are not a Summit goal)', `${selfRating ? 'the business node carries' : 'a node about the business is'} ${selfRating ? (node.aggregateRating !== undefined ? 'aggregateRating' : 'review') : nodeTypes.join('+')} markup`);
        }
        if (isBusiness) {
          const mismatch = (field, expected, actual) => at('facts-entity-schema-mismatch', `jsonld:business:${field}`, expected, actual);
          if (node.name !== undefined && normalizeText(node.name) !== normalizeText(entity.publicName)) mismatch('name', `name "${entity.publicName}"`, `"${node.name}"`);
          if (node.telephone !== undefined && normalizePhone(node.telephone) !== normalizePhone(entity.primaryPhone)) mismatch('telephone', `telephone ${entity.primaryPhone || '(none recorded)'}`, `"${node.telephone}"`);
          const emails = (entity.emails || []).map(normalizeEmail);
          for (const email of asList(node.email)) if (!emails.includes(normalizeEmail(String(email).replace(/^mailto:/i, '')))) mismatch('email', `an entity email (${emails.join(', ') || 'none recorded'})`, `"${email}"`);
          if (node.url !== undefined && origin) {
            try {
              if (new URL(node.url).origin !== origin) mismatch('url', `url on ${origin}`, `"${node.url}"`);
            } catch {
              mismatch('url', `url on ${origin}`, `"${node.url}"`);
            }
          }
          if (node.address !== undefined) {
            const address = publicAddress(entity);
            if (address) {
              const got = asList(node.address)[0] || {};
              const same = ['streetAddress', 'addressLocality', 'postalCode'].every((key) => !address[key] || normalizeText(got[key]) === normalizeText(address[key]));
              if (!same) mismatch('address', `address "${addressLine(address)}"`, `"${addressLine(got) || JSON.stringify(got).slice(0, 80)}"`);
            } else if (!(isObject(entity.address) && entity.address.public !== true && isObject(entity.address.value))) {
              mismatch('address', 'no address (the entity records none)', 'an address is published');
            }
          }
          for (const area of asList(node.areaServed)) {
            const name = typeof area === 'string' ? area : isObject(area) ? area.name : null;
            if (!name || !areas.includes(normalizeText(name))) at('facts-entity-unapproved-area', `jsonld:areaServed:${normalizeText(name)}`, `only approved service areas (${serviceAreaNames(entity).join(', ') || 'none recorded'})`, `"${name}"`);
          }
          if (node.openingHoursSpecification !== undefined) {
            const key = (days, opens, closes) => asList(days).map((day) => `${String(day).replace(/^https?:\/\/schema\.org\//, '')}|${opens}|${closes}`);
            const expected = new Set((entity.hours || []).flatMap((row) => key(row.days, row.opens, row.closes)));
            const got = new Set(asList(node.openingHoursSpecification).flatMap((row) => (isObject(row) ? key(row.dayOfWeek, row.opens, row.closes) : [])));
            if (expected.size !== got.size || [...got].some((item) => !expected.has(item))) mismatch('openingHours', `hours "${hoursText(entity) || '(none recorded)'}"`, `${got.size} opening-hours row(s) that differ`);
          }
          const profiles = new Set((entity.sameAs || []).map(urlKey));
          for (const link of asList(node.sameAs)) if (!profiles.has(urlKey(link))) mismatch('sameAs', 'only confirmed profiles from the entity', `"${link}"`);
        }
        if (nodeTypes.includes('Service') && node.name !== undefined && !(entity.services || []).some((service) => normalizeText(service.name) === normalizeText(node.name))) {
          at('facts-entity-schema-mismatch', `jsonld:service:${normalizeText(node.name)}`, 'a service from the entity', `"${node.name}"`);
        }
      }
    }
  }
  return out;
}

// ------------------------------------------------------------- indexability

/** Parse robots.txt into user-agent groups: [{ agents: [lowercase], rules: [{ type, path }] }]. */
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (field === 'allow' || field === 'disallow')) current.rules.push({ type: field, path: value });
    }
  }
  return groups;
}
const blocksAll = (group) => Boolean(group) && group.rules.some((rule) => rule.type === 'disallow' && rule.path === '/') && !group.rules.some((rule) => rule.type === 'allow' && rule.path === '/');
const groupFor = (groups, agent) => groups.find((group) => group.agents.includes(agent.toLowerCase())) || null;

/**
 * Preview must be noindex. Production must be indexable where intended; a
 * stray noindex (meta or X-Robots-Tag) or a robots.txt that blocks the site is
 * a launch failure. A page built for the other mode is a review item.
 */
export function analyzeIndexability({ siteEnv, site = null, pages, robots = null }) {
  const out = [];
  const routes = site ? routesOf(site) : [];
  for (const page of pages) {
    const at = (ruleId, subject, expected, actual) => out.push(v(ruleId, subject, expected, actual, { route_id: page.route_id }));
    const metaNoindex = asList(page.meta && page.meta.robots).some(hasNoindex);
    const headerNoindex = hasNoindex(page.x_robots_tag);
    const route = routes.find((entry) => entry.id === page.route_id);
    if (siteEnv === 'preview') {
      if (!metaNoindex && !headerNoindex) at('meta-index-preview-indexable', `index:${page.route_id}`, 'a preview page is noindex (robots meta and/or X-Robots-Tag)', `robots meta ${JSON.stringify(asList(page.meta && page.meta.robots))}, X-Robots-Tag ${JSON.stringify(page.x_robots_tag || null)}`);
      else if (!metaNoindex && headerNoindex) at('meta-index-preview-header-only', `index:${page.route_id}:header-only`, 'the build itself marks preview pages noindex', 'noindex comes only from the X-Robots-Tag header');
    } else if (siteEnv === 'production') {
      const intended = route ? Boolean(route.indexable && route.kind !== 'error' && site.indexing && site.indexing.production === 'index') : true;
      if (intended && metaNoindex) at('meta-index-production-noindex', `index:${page.route_id}:meta`, 'an indexable production page carries no noindex', `robots meta ${JSON.stringify(asList(page.meta.robots))}`);
      if (intended && headerNoindex) at('meta-index-production-noindex', `index:${page.route_id}:header`, 'an indexable production page is not served with X-Robots-Tag: noindex', `X-Robots-Tag ${JSON.stringify(page.x_robots_tag)}`);
    }
    if (page.meta && page.meta.site_env && siteEnv && page.meta.site_env !== siteEnv) {
      at('meta-index-build-env-mismatch', `index:${page.route_id}:build-env`, `a ${siteEnv} build on a ${siteEnv} deployment`, `the page was built for ${page.meta.site_env}`);
    }
  }
  if (siteEnv === 'production' && robots !== null && (!site || (site.indexing && site.indexing.production === 'index'))) {
    if (blocksAll(groupFor(parseRobots(robots), '*'))) out.push(v('meta-index-production-noindex', 'index:robots.txt', 'robots.txt does not block the whole production site', 'User-agent: * / Disallow: /'));
  }
  return out;
}

/**
 * Whether robots.txt lets one user agent crawl the site root: its own group
 * when one names it, otherwise the `User-agent: *` group (RFC 9309 group
 * selection; tokens compare case-insensitively). "allowed" | "blocked".
 */
export function robotsAccess(robots, token) {
  const groups = parseRobots(robots);
  const group = groupFor(groups, token) || groupFor(groups, '*');
  return blocksAll(group) ? 'blocked' : 'allowed';
}

/** robots.txt reflects the crawler policy for every registry agent with a decision. */
export function analyzeRobotsPolicy({ robots, site }) {
  const out = [];
  if (!site || !isObject(site.crawlers)) return out;
  for (const [token, access] of Object.entries(crawlerAccess(site))) {
    if (access === 'unset') continue;
    const actual = robotsAccess(robots, token);
    const expected = access === 'allow' ? 'allowed' : 'blocked';
    if (actual !== expected) {
      const agent = findAgent(token);
      out.push(v('meta-robots-policy-mismatch', `robots:${agent.category}:${token.toLowerCase()}`, `robots.txt ${expected === 'allowed' ? 'allows' : 'disallows'} ${token} (${agent.category} policy)`, `it is ${actual}`));
    }
  }
  return out;
}

// ----------------------------------------------------------------- sitemap

export function parseSitemapXml(xml) {
  const text = String(xml || '');
  return { valid: /<urlset[\s>]/i.test(text) && /<\/urlset>/i.test(text), locs: [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) => match[1].replace(/&amp;/g, '&')) };
}

/**
 * The sitemap lists exactly the intended canonical routes: indexable in
 * production, on the canonical origin, once each. Without site.json only the
 * origin and duplicates can be judged.
 */
export function analyzeSitemap({ status = 200, xml, site = null, entity }) {
  const out = [];
  if (status !== 200 || xml === null || xml === undefined) return [v('meta-sitemap-invalid', 'sitemap:missing', '/sitemap.xml answers 200 with a urlset', status === null ? 'not fetched' : `HTTP ${status}`)];
  const parsed = parseSitemapXml(xml);
  if (!parsed.valid) return [v('meta-sitemap-invalid', 'sitemap:not-urlset', 'a <urlset> sitemap', 'not a urlset document')];
  const origin = siteOrigin(entity);
  const seen = new Set();
  for (const loc of parsed.locs) {
    if (seen.has(loc)) out.push(v('meta-sitemap-invalid', `sitemap:duplicate:${pathOf(loc)}`, 'each URL listed once', `${loc} listed more than once`));
    seen.add(loc);
    let url = null;
    try {
      url = new URL(loc);
    } catch {
      out.push(v('meta-sitemap-invalid', `sitemap:invalid-url:${loc.slice(0, 60)}`, 'absolute URLs', loc));
      continue;
    }
    if (!origin || url.origin !== origin) out.push(v('meta-sitemap-invalid', `sitemap:origin:${url.origin}`, origin ? `URLs on the canonical origin ${origin}` : 'no URLs until the entity records the website origin', loc));
  }
  if (site && origin) {
    const expected = new Set(sitemapRoutes(site).map((route) => `${origin}${route.path}`));
    for (const loc of parsed.locs) if (loc.startsWith(origin) && !expected.has(loc)) out.push(v('meta-sitemap-invalid', `sitemap:unintended:${pathOf(loc)}`, 'only indexable routes from search/site.json', `${loc} is not an intended indexable route`));
    for (const loc of expected) if (!seen.has(loc)) out.push(v('meta-sitemap-invalid', `sitemap:missing-route:${pathOf(loc)}`, `${loc} listed (an indexable route)`, 'absent'));
  }
  return out;
}

// -------------------------------------------------------------- canonical

export function analyzeCanonical({ entity, route, canonicals }) {
  const list = asList(canonicals);
  const expected = canonicalUrl(entity, route);
  if (route.kind === 'error') return [];
  if (!expected) return list.length === 0 ? [] : [v('meta-canonical-wrong', `canonical:${route.id}:unsourced`, 'no canonical until the entity records the website origin', list.join(' '), { route_id: route.id })];
  if (list.length === 0) return [v('meta-canonical-wrong', `canonical:${route.id}:missing`, expected, 'missing', { route_id: route.id })];
  if (list.length > 1) return [v('meta-canonical-wrong', `canonical:${route.id}:multiple`, 'exactly one canonical link', `${list.length} canonical links`, { route_id: route.id })];
  if (list[0] !== expected) return [v('meta-canonical-wrong', `canonical:${route.id}:value`, expected, list[0], { route_id: route.id })];
  return [];
}

// --------------------------------------------------------- location pages

function shingles(words, size = 5) {
  const set = new Set();
  for (let i = 0; i + size <= words.length; i += 1) set.add(words.slice(i, i + size).join(' '));
  return set;
}

/**
 * "Swap-the-town" heuristic. Location pages whose wording is nearly identical
 * once area and business names are removed become a REVIEW item for a person:
 * the pages may still be legitimate. It is never an automatic spam verdict,
 * and prior local jobs, reviews or photos are never required.
 */
export function analyzeLocationPages({ site, entity, pages, threshold = LOCATION_SIMILARITY_THRESHOLD }) {
  const out = [];
  if (!site || isTemplateEntity(entity)) return out;
  const names = [...serviceAreaNames(entity), entity.publicName].map(normalizeText).filter(Boolean).sort((a, b) => b.length - a.length);
  const locations = routesOf(site).filter((route) => route.kind === 'location');
  const prepared = locations
    .map((route) => {
      const page = pages.find((entry) => entry.route_id === route.id);
      if (!page) return null;
      let text = ` ${normalizeText(page.main_text || page.text)} `;
      for (const name of names) text = text.split(` ${name} `).join(' ');
      const words = text.trim().split(/\s+/).filter(Boolean);
      return words.length >= 30 ? { route, set: shingles(words) } : null;
    })
    .filter(Boolean);
  for (let i = 0; i < prepared.length; i += 1) {
    for (let j = i + 1; j < prepared.length; j += 1) {
      const a = prepared[i];
      const b = prepared[j];
      const shared = [...a.set].filter((item) => b.set.has(item)).length;
      const similarity = shared / (a.set.size + b.set.size - shared || 1);
      if (similarity >= threshold) {
        const signals = [a.route, b.route].map((route) => `${route.id}: ${route.localSignals.length ? route.localSignals.join(', ') : 'no local signals recorded'}`).join('; ');
        out.push(v('meta-location-similarity', `location-similarity:${[a.route.id, b.route.id].sort().join(',')}`, 'each location page offers genuinely local, distinct usefulness (not only a different place name)', `${Math.round(similarity * 100)}% of the wording is shared once area names are removed (${signals})`, {
          route_id: b.route.id,
          remediation: 'A person decides. Keep the page if it is truthful and useful for that area; strengthen it with real local detail (jobs, photos, reviews, case studies, area-specific information) or merge it. This is a heuristic, not a spam verdict.',
        }));
      }
    }
  }
  return out;
}

// ------------------------------------------------------ build-only checks

/**
 * Static build checks that need the whole dist/: inventory, internal links,
 * the 404 page, canonical links, headings, metadata and optional schema.
 * `builtPaths` are the directory-style paths of every built HTML page;
 * `fileExists(path)` answers for any other site path (assets, sitemap).
 */
export function analyzeBuiltSite({ site, entity, pages, builtPaths, fileExists = () => false, has404 }) {
  const out = [];
  const routes = routesOf(site);
  const built = new Set(builtPaths.map(normPath));
  if (!has404) out.push(v('search-404-missing', 'route:404', 'dist/404.html (a real 404 page, so unknown paths are not answered with the home page)', 'missing'));
  if (!siteOrigin(entity)) out.push(v('search-origin-unknown', 'entity:url', 'the website origin in business-entity.json url (needed for canonical links and the sitemap)', 'unknown'));
  const inventory = new Set(routes.filter((route) => route.kind !== 'error').map((route) => normPath(route.path)));
  for (const route of routes.filter((r) => r.kind !== 'error')) {
    if (!built.has(normPath(route.path))) out.push(v('search-route-missing', `route:${route.id}`, `${route.path} is built (listed in search/site.json)`, 'no built page', { route_id: route.id }));
  }
  for (const path of built) if (!inventory.has(path)) out.push(v('search-route-uninventoried', `path:${path}`, 'every built page is listed in search/site.json', `${path} is built but not inventoried`));

  const linkedFrom = new Map();
  for (const page of pages) {
    const route = routes.find((entry) => entry.id === page.route_id);
    for (const link of page.links || []) {
      const href = String(link.href || '');
      if (!href.startsWith('/') || href.startsWith('//')) continue;
      const target = normPath(pathOf(href));
      if (target === null) continue;
      if (!built.has(target) && !fileExists(target)) out.push(v('search-link-broken', `link:${target}`, 'internal links resolve to a built page or file', `${href} (from ${page.route_id})`, { route_id: page.route_id }));
      if (route && normPath(route.path) !== target) linkedFrom.set(target, [...(linkedFrom.get(target) || []), page.route_id]);
    }
    if (!route) continue;
    const at = (ruleId, subject, expected, actual) => out.push(v(ruleId, subject, expected, actual, { route_id: route.id }));
    out.push(...analyzeCanonical({ entity, route, canonicals: page.meta.canonical }));
    const h1 = page.h1 || [];
    if (h1.length !== 1) at('search-heading-anomaly', `heading:${route.id}:count`, 'exactly one h1', `${h1.length} h1 element(s)`);
    else if (normalizeText(h1[0]) !== normalizeText(route.heading)) at('search-heading-anomaly', `heading:${route.id}:text`, `h1 "${route.heading}" (search/site.json)`, `h1 "${h1[0]}"`);
    if (normalizeText(page.title) !== normalizeText(route.title)) at('search-weak-metadata', `title:${route.id}`, `title "${route.title}"`, `"${page.title}"`);
    if (route.kind !== 'error' && normalizeText(asList(page.meta.description)[0]) !== normalizeText(route.description)) at('search-weak-metadata', `description:${route.id}`, 'the description from search/site.json', `"${asList(page.meta.description)[0] || ''}"`);

    const client = !isTemplateEntity(entity) && siteOrigin(entity);
    if (client && route.kind !== 'error') {
      const nodes = (page.jsonld || []).filter((block) => !block.parse_error).flatMap((block) => jsonLdNodes(block.data));
      const trail = breadcrumbTrail(site, route.id);
      if (nodes.length === 0) at('search-schema-optional-missing', `schema:${route.id}`, 'JSON-LD built from business-entity.json', 'none');
      if (trail.length > 1 && !nodes.some((node) => typesOf(node).includes('BreadcrumbList'))) at('search-schema-optional-missing', `schema:${route.id}:breadcrumb`, 'BreadcrumbList', 'none');
      if (trail.length > 1 && !page.has_breadcrumb_nav) at('search-schema-optional-missing', `breadcrumbs:${route.id}`, 'visible breadcrumbs (Breadcrumbs primitive) matching the BreadcrumbList', 'none rendered');
      if (route.kind === 'service' && !nodes.some((node) => typesOf(node).includes('Service'))) at('search-schema-optional-missing', `schema:${route.id}:service`, 'a Service node for this service page', 'none');
      const subject = route.kind === 'service' ? ((entity.services || []).find((service) => service.id === route.service) || {}).name : route.kind === 'location' ? route.area : null;
      if (subject && !` ${normalizeText(page.first_paragraph)} `.includes(` ${normalizeText(subject)} `)) {
        at('search-answer-first-opportunity', `answer-first:${route.id}`, `the opening paragraph answers directly and names "${subject}"`, page.first_paragraph ? `opening paragraph: "${page.first_paragraph.slice(0, 120)}"` : 'no opening paragraph in <main>');
      }
    }
  }
  for (const route of routes.filter((r) => !['home', 'error'].includes(r.kind))) {
    if (!linkedFrom.has(normPath(route.path))) out.push(v('search-orphan-route', `orphan:${route.id}`, `${route.path} is linked from another page`, 'no internal link points to it', { route_id: route.id }));
  }
  return out;
}

// ------------------------------------------------------------ HTML extract

const decodeEntities = (text) => String(text)
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const stripTags = (html) => decodeEntities(String(html).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
function attributes(tag) {
  const attrs = {};
  for (const match of String(tag).matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

/**
 * A page observation from static HTML the starter produced. This is a small
 * extractor for known, well-formed build output — not a general HTML parser.
 */
export function extractHtml(html) {
  const source = String(html || '');
  const body = source.replace(/<!--[\s\S]*?-->/g, ' ');
  const visible = body.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<head\b[\s\S]*?<\/head>/i, ' ');
  const metas = [...body.matchAll(/<meta\b([^>]*)>/gi)].map((match) => attributes(match[1]));
  const linksRel = [...body.matchAll(/<link\b([^>]*)>/gi)].map((match) => attributes(match[1]));
  const mainMatch = /<main\b([^>]*)>([\s\S]*?)<\/main>/i.exec(visible);
  const firstParagraph = mainMatch ? /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(mainMatch[2]) : null;
  const markers = (name) => [...body.matchAll(new RegExp(`<([a-zA-Z0-9]+)\\b([^>]*\\b${name}(?:="([^"]*)")?[^>]*)>`, 'gi'))].map((match) => ({ tag: match[1].toLowerCase(), value: attributes(match[2])[name] ?? '' }));
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body);
  return {
    title: titleMatch ? stripTags(titleMatch[1]) : '',
    meta: {
      description: metas.filter((m) => m.name === 'description').map((m) => m.content || ''),
      robots: metas.filter((m) => m.name === 'robots').map((m) => m.content || ''),
      site_env: (metas.find((m) => m.name === 'summit-site-env') || {}).content || null,
      canonical: linksRel.filter((l) => String(l.rel || '').split(/\s+/).includes('canonical')).map((l) => l.href || ''),
      icons: linksRel.filter((l) => String(l.rel || '').split(/\s+/).includes('icon')).map((l) => l.href || ''),
      og: Object.fromEntries(metas.filter((m) => /^og:/.test(m.property || '')).map((m) => [m.property.slice(3), m.content || ''])),
    },
    jsonld: [...body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter((match) => /application\/ld\+json/i.test(attributes(match[1]).type || ''))
      .map((match) => {
        try {
          return { parse_error: null, data: JSON.parse(match[2]) };
        } catch (error) {
          return { parse_error: String(error.message), data: null };
        }
      }),
    h1: [...visible.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => stripTags(match[1])),
    text: stripTags(visible),
    main_text: mainMatch ? stripTags(mainMatch[2]) : '',
    first_paragraph: firstParagraph ? stripTags(firstParagraph[1]) : '',
    route_landmark: mainMatch ? attributes(mainMatch[1])['data-route-landmark'] || null : null,
    links: [...visible.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((match) => {
      const attrs = attributes(match[1]);
      return { href: attrs.href || '', text: stripTags(match[2]), cta: attrs['data-cta'] || null };
    }),
    entity_values: [...visible.matchAll(/<([a-zA-Z0-9]+)\b([^>]*\bdata-entity="[^"]*"[^>]*)>([\s\S]*?)<\/\1>/gi)].map((match) => {
      const attrs = attributes(match[2]);
      return { field: attrs['data-entity'], text: stripTags(match[3]), href: attrs.href || null };
    }),
    markers: {
      nav: markers('data-nav'),
      nav_toggle: markers('data-nav-toggle'),
      cta: markers('data-cta'),
      form: markers('data-form'),
      slot: markers('data-slot'),
    },
    has_breadcrumb_nav: /<nav\b[^>]*\bdata-nav="breadcrumb"/i.test(visible),
  };
}
