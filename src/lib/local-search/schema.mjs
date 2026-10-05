/**
 * JSON-LD v1 — small and fact-backed.
 *
 * Every business fact in the graph comes from business-entity.json; pages
 * never repeat those literals. Types used: the business (LocalBusiness or its
 * subtype from `schemaType`), WebSite, WebPage, BreadcrumbList, and Service
 * on a service page. ImageObject appears only for a real logo asset.
 *
 * Never emitted: AggregateRating or Review about the business (self-serving
 * ratings), FAQPage or HowTo (their rich results are retired or deprecated;
 * no rich-result promise), Person (no sourced people in v1), a hidden address,
 * or any value the entity does not hold. No schema is "for AI": Google's AI
 * Overviews and AI Mode use normal Search eligibility.
 *
 * Pure functions only.
 */

import { isTemplateEntity, publicAddress } from './entity.mjs';
import { breadcrumbTrail, canonicalUrl, findRoute, siteOrigin } from './site.mjs';

const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0)));

export const businessId = (origin) => `${origin}/#business`;
export const websiteId = (origin) => `${origin}/#website`;

/** The business node. The address appears only when address.public is true. */
export function businessNode(entity, site) {
  const origin = siteOrigin(entity);
  const address = publicAddress(entity);
  return compact({
    '@type': entity.schemaType || 'LocalBusiness',
    '@id': businessId(origin),
    name: entity.publicName,
    legalName: entity.legalName || null,
    url: `${origin}/`,
    telephone: entity.primaryPhone || null,
    email: entity.emails && entity.emails.length === 1 ? entity.emails[0] : entity.emails && entity.emails.length > 1 ? entity.emails : null,
    address: address ? compact({ '@type': 'PostalAddress', ...address }) : null,
    areaServed: (entity.serviceAreas || []).map((area) => ({ '@type': area.type || 'Place', name: area.name })),
    openingHoursSpecification: (entity.hours || []).map((row) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: row.days, opens: row.opens, closes: row.closes })),
    sameAs: entity.sameAs || [],
    logo: site && site.logo && site.logo.url ? { '@type': 'ImageObject', url: new URL(site.logo.url, `${origin}/`).href } : null,
  });
}

/**
 * The page graph for one route, or null when there is nothing truthful to say
 * yet (a template entity, no website origin, or an error page).
 */
export function buildJsonLd({ entity, site, routeId }) {
  const route = findRoute(site, routeId);
  const origin = siteOrigin(entity);
  if (!route || route.kind === 'error' || isTemplateEntity(entity) || !origin) return null;
  const pageUrl = canonicalUrl(entity, route);
  const graph = [];
  const business = businessNode(entity, site);
  graph.push(business);
  graph.push({ '@type': 'WebSite', '@id': websiteId(origin), url: `${origin}/`, name: entity.publicName, publisher: { '@id': business['@id'] } });

  const trail = breadcrumbTrail(site, route.id);
  const breadcrumbId = `${pageUrl}#breadcrumb`;
  graph.push(compact({
    '@type': 'WebPage',
    '@id': `${pageUrl}#webpage`,
    url: pageUrl,
    name: route.title,
    description: route.description,
    isPartOf: { '@id': websiteId(origin) },
    about: { '@id': business['@id'] },
    breadcrumb: trail.length > 1 ? { '@id': breadcrumbId } : null,
  }));
  if (trail.length > 1) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': breadcrumbId,
      itemListElement: trail.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: `${origin}${item.path}` })),
    });
  }
  if (route.kind === 'service') {
    const service = (entity.services || []).find((entry) => entry.id === route.service);
    if (service) {
      graph.push(compact({
        '@type': 'Service',
        '@id': `${pageUrl}#service`,
        name: service.name,
        description: service.description || null,
        provider: { '@id': business['@id'] },
        areaServed: (entity.serviceAreas || []).map((area) => ({ '@type': area.type || 'Place', name: area.name })),
        url: pageUrl,
      }));
    }
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

/** Serialize for a <script type="application/ld+json"> without letting the text close the tag. */
export function jsonLdText(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
