/**
 * sitemap.xml — the indexable routes of search/site.json on the website origin
 * from search/business-entity.json. Nothing else is listed.
 */
import type { APIRoute } from 'astro';
import { searchContext } from '../lib/local-search/site-context';
import { sitemapXml } from '../lib/local-search/site.mjs';

export const GET: APIRoute = () => {
  const { entity, site } = searchContext();
  return new Response(sitemapXml(site, entity), { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
