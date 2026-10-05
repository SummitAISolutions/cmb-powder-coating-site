/**
 * Crawler registry — the ONE place crawler user-agent tokens live.
 *
 * Versioned and replaceable: when a crawler operator changes its documentation,
 * edit this file and bump CRAWLER_REGISTRY_VERSION. Every site.json pins the
 * version it was reviewed against (`crawlers.registry`); a site pinned to an
 * older version fails validation until a person re-reviews its crawler policy.
 * No other module may name a crawler.
 *
 * Two policy categories, decided separately:
 *
 *   search    search / indexing / retrieval — how the site can appear and be
 *             cited in search and AI search answers
 *   training  model-training / non-search use of the site's content
 *
 * Opting out of training can never opt a site out of search: every agent is in
 * exactly one category, each gets its own robots.txt group, and a robots.txt
 * group for one user agent never applies to another.
 *
 * Verified semantics (Summit Track 6 primary-source verification, 2026-09):
 * - OAI-SearchBot is the documented control for inclusion in ChatGPT search.
 *   Bing is one of several third-party providers OpenAI uses; Bing indexing is
 *   NOT a proxy for ChatGPT visibility.
 * - Perplexity runs PerplexityBot and its own index, plus unnamed third-party
 *   crawlers; Perplexity is NOT "powered by Bing".
 * - Googlebot governs Google Search and, with it, eligibility for AI Overviews
 *   and AI Mode. Google-Extended is a separate token for Google's non-Search
 *   uses and does NOT control inclusion in AI Overviews or AI Mode.
 * - ChatGPT-User, Claude-User and Perplexity-User fetch pages for a user's
 *   request; they are retrieval agents and belong with search.
 */

export const CRAWLER_REGISTRY_VERSION = 'summit-crawlers-2026-09';

export const CRAWLER_CATEGORIES = ['search', 'training'];

export const CRAWLER_AGENTS = Object.freeze([
  { token: 'Googlebot', operator: 'Google', category: 'search', note: 'Google Search indexing; also the eligibility gate for AI Overviews and AI Mode' },
  { token: 'Bingbot', operator: 'Microsoft', category: 'search', note: 'Bing indexing (one of several providers others may use; not a proxy for any AI product)' },
  { token: 'OAI-SearchBot', operator: 'OpenAI', category: 'search', note: 'inclusion in ChatGPT search' },
  { token: 'ChatGPT-User', operator: 'OpenAI', category: 'search', note: 'fetches pages for a ChatGPT user request' },
  { token: 'Claude-SearchBot', operator: 'Anthropic', category: 'search', note: 'search indexing for Claude' },
  { token: 'Claude-User', operator: 'Anthropic', category: 'search', note: 'fetches pages for a Claude user request' },
  { token: 'PerplexityBot', operator: 'Perplexity', category: 'search', note: "Perplexity's own index" },
  { token: 'Perplexity-User', operator: 'Perplexity', category: 'search', note: 'fetches pages for a Perplexity user request' },
  { token: 'GPTBot', operator: 'OpenAI', category: 'training', note: 'model training; does not control ChatGPT search inclusion' },
  { token: 'Google-Extended', operator: 'Google', category: 'training', note: "Google's non-Search uses; does not control Google Search, AI Overviews or AI Mode" },
  { token: 'ClaudeBot', operator: 'Anthropic', category: 'training', note: 'model training; does not control Claude search or user fetches' },
]);

export const agentsIn = (category) => CRAWLER_AGENTS.filter((agent) => agent.category === category);
export const findAgent = (token) => CRAWLER_AGENTS.find((agent) => agent.token.toLowerCase() === String(token).toLowerCase()) || null;
