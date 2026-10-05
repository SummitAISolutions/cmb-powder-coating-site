/**
 * The local search contract as the Astro build sees it: the business entity,
 * the site inventory and the build mode, validated once. An invalid contract
 * stops the build — `npm run search:check` explains why in detail.
 */
import entityJson from '../../../search/business-entity.json';
import siteJson from '../../../search/site.json';
import { entityProblems } from './entity.mjs';
import { buildSiteEnv, findRoute, siteProblems } from './site.mjs';

let cached: { entity: any; site: any; siteEnv: string } | null = null;

export function searchContext() {
  if (!cached) {
    const entity: any = entityJson;
    const site: any = siteJson;
    const problems = [
      ...entityProblems(entity).problems.map((problem: string) => `search/business-entity.json: ${problem}`),
      ...siteProblems(site, entity).problems.map((problem: string) => `search/site.json: ${problem}`),
    ];
    if (problems.length > 0) {
      throw new Error(`The local search contract is invalid (run npm run search:check):\n  - ${problems.join('\n  - ')}`);
    }
    cached = { entity, site, siteEnv: buildSiteEnv() };
  }
  return cached;
}

/** The context for one page. A page that is not in search/site.json does not build. */
export function routeContext(routeId: string) {
  const context = searchContext();
  const route = findRoute(context.site, routeId);
  if (!route) throw new Error(`Route "${routeId}" is not listed in search/site.json. Every page is inventoried there (title, description, h1, indexability).`);
  return { ...context, route };
}
