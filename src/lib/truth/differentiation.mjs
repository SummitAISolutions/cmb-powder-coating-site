/**
 * Route content differentiation — "is this page a different page, or the same
 * page with a different name?"
 *
 * Structural, not a content score and never a word count. Two separately
 * indexable pages of the same kind are compared after masking what is SUPPOSED
 * to differ (the service or area name, the business name):
 *
 *   headings     the h2/h3 outline
 *   body         5-word shingles of the main content
 *   metadata     title and description
 *
 * Near-identical body text under the same outline is a hard finding for
 * service and content pages (they should be one page, or genuinely different
 * ones); for location pages, and for a high overlap, it is a warning to look
 * at. Pure functions only.
 */

import { norm, visibleText } from './claims.mjs';

export const DUPLICATE_SIMILARITY = 0.9;
export const SIMILAR_SIMILARITY = 0.7;
const COMPARED_KINDS = ['service', 'location', 'content'];

const mainOf = (html) => {
  const match = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(String(html));
  return match ? match[1] : String(html);
};

function masked(text, terms) {
  let out = ` ${norm(text)} `;
  for (const term of terms.map(norm).filter((entry) => entry.length > 2).sort((a, b) => b.length - a.length)) {
    out = out.split(` ${term} `).join(' § ');
  }
  return out.trim();
}

function fingerprint(page, terms) {
  const main = mainOf(page.html);
  const headings = [...main.matchAll(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => `${m[1]}:${masked(visibleText(m[2]), terms)}`);
  const words = masked(visibleText(main), terms).split(' ').filter(Boolean);
  const grams = new Set();
  for (let i = 0; i + 5 <= words.length; i += 1) grams.add(words.slice(i, i + 5).join(' '));
  return { headings, grams };
}

const jaccard = (a, b) => {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / (a.size + b.size - shared);
};

/**
 * pages: [{ route_id, kind, indexable, html, terms: [what legitimately differs] }]
 * globalTerms: words masked on every page (the business name).
 * Returns violations [{ rule_id, route_id, subject, expected, actual }].
 */
export function analyzeRouteDifferentiation(pages, { globalTerms = [] } = {}) {
  const candidates = pages.filter((page) => page.indexable && COMPARED_KINDS.includes(page.kind));
  const allTerms = [...globalTerms, ...candidates.flatMap((page) => page.terms || [])];
  const prints = candidates.map((page) => ({ page, print: fingerprint(page, allTerms) }));
  const out = [];
  for (let i = 0; i < prints.length; i += 1) {
    for (let j = i + 1; j < prints.length; j += 1) {
      const a = prints[i];
      const b = prints[j];
      if (a.page.kind !== b.page.kind) continue;
      const similarity = jaccard(a.print.grams, b.print.grams);
      const sameOutline = a.print.headings.join('|') === b.print.headings.join('|');
      const subject = `routes:${a.page.route_id}+${b.page.route_id}`;
      const detail = `${Math.round(similarity * 100)}% of the body text is shared once the ${a.page.kind} names are masked${sameOutline ? ', under the same heading outline' : ''}`;
      // Location-page similarity stays a review heuristic, never a hard verdict
      // (docs/local-search.md); service and content pages are held to it.
      if (similarity >= DUPLICATE_SIMILARITY && sameOutline && a.page.kind !== 'location') {
        out.push({ rule_id: 'route-content-duplicative', route_id: b.page.route_id, subject, expected: `a distinct user problem, details, process, proof or FAQs than "${a.page.route_id}" — or one page instead of two`, actual: detail });
      } else if (similarity >= SIMILAR_SIMILARITY) {
        out.push({ rule_id: 'route-content-similar', route_id: b.page.route_id, subject, expected: `content that differs from "${a.page.route_id}" in substance`, actual: detail });
      }
    }
  }
  return out;
}
