/**
 * robots.txt — from the crawler policy in search/site.json and the build mode.
 * A preview never blocks crawling (its pages carry noindex instead).
 */
import type { APIRoute } from 'astro';
import { searchContext } from '../lib/local-search/site-context';
import { robotsTxt } from '../lib/local-search/site.mjs';

export const GET: APIRoute = () => {
  const { entity, site, siteEnv } = searchContext();
  return new Response(robotsTxt(site, entity, siteEnv), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
