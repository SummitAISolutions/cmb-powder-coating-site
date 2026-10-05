/**
 * "Nothing ships that a document does not support" — the deterministic half.
 *
 * Over the rendered pages of a CLIENT build:
 *
 *   truth-internal-leak          an internal-only note, or a commitment that is
 *                                not confirmed-public, appears in public copy
 *   truth-commitment-unsupported a [data-truth] element names no confirmed public
 *                                commitment, or says something other than it
 *   truth-claim-unsupported      a claim-bearing phrase (a price, years in
 *                                business, a rating or review count, a guarantee,
 *                                licensed/insured/certified, a percentage outcome,
 *                                an award) with no support in the truth record
 *   truth-prohibited-claim       a claim facts.md lists as prohibited
 *   truth-placeholder-published  a template/placeholder marker in visible copy
 *                                or accessible text
 *   route-content-duplicative    two separate pages that are the same page with
 *                                a different name (see differentiation.mjs)
 *
 * Generic marketing sentences need no citation; claims do. Semantic judgment
 * stays with the independent reviewer. Pure functions only.
 */

import { publicCommitments, nonPublicStatements } from './facts.mjs';

export const TRUTH_RULES = Object.freeze({
  'truth-internal-leak': 'hard',
  'truth-commitment-unsupported': 'hard',
  'truth-claim-unsupported': 'hard',
  'truth-prohibited-claim': 'hard',
  'truth-placeholder-published': 'hard',
  'route-content-duplicative': 'hard',
  'route-content-similar': 'warning',
});

export const norm = (value) => String(value ?? '')
  .toLowerCase()
  .replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|’/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/[^a-z0-9$%&'.+]+/g, ' ')
  .replace(/\.(?=\s|$)/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const decode = (text) => String(text).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

/** Visible text of an HTML document: no head, scripts, styles or JSON-LD. */
export function visibleText(html) {
  return decode(String(html)
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** The HTML with every element carrying `attribute` removed (its truth is checked separately). */
function withoutMarked(html, attribute) {
  let out = String(html);
  const pattern = new RegExp(`<([a-zA-Z0-9]+)\\b[^>]*\\b${attribute}="[^"]*"[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi');
  for (let pass = 0; pass < 4; pass += 1) out = out.replace(pattern, ' ');
  return out;
}

const shingles = (text, size) => {
  const words = norm(text).split(' ').filter(Boolean);
  if (words.length <= size) return words.length ? [words.join(' ')] : [];
  const out = [];
  for (let i = 0; i + size <= words.length; i += 1) out.push(words.slice(i, i + size).join(' '));
  return out;
};

const contains = (haystack, needle) => ` ${norm(haystack)} `.includes(` ${norm(needle)} `);

/** The claim families, and the truth that can support each. */
const CLAIM_PATTERNS = [
  { family: 'price', re: /\$\s?\d[\d,]*(?:\.\d{2})?/g, supported: (match, s) => s.offerText.some((text) => contains(text, match.replace(/\s/g, ''))) || contains(s.claims.publishablePrices || '', match.replace(/\s/g, '')) },
  { family: 'years-in-business', re: /\b(?:\d{1,3}\+?\s+years?\s+(?:of\s+)?(?:experience|in business|serving|of service)|(?:since|established in|founded in|est\.?)\s+(?:19|20)\d{2})\b/gi, supported: (_m, s) => Boolean(s.claims.yearsInBusiness) },
  { family: 'rating', re: /\b(?:\d(?:\.\d)?\s*(?:-|\s)?stars?|\d(?:\.\d)?\s*\/\s*5|rated\s+\d(?:\.\d)?)\b|★/gi, supported: (_m, s) => Boolean(s.claims.ratings) },
  { family: 'review-count', re: /\b\d[\d,]*\+?\s+(?:(?:five|5)[- ]star\s+)?(?:reviews|customer reviews|ratings)\b/gi, supported: (_m, s) => Boolean(s.claims.ratings) },
  { family: 'guarantee', re: /\b(?:guarantee[ds]?|warrant(?:y|ies|ied))\b/gi, supported: (match, s) => Boolean(s.claims.guarantees) || s.publicText.some((text) => /guarantee|warrant/i.test(text)) },
  { family: 'licensed', re: /\blicensed\b/gi, supported: (_m, s) => Boolean(s.claims.licenses) },
  { family: 'insured', re: /\b(?:insured|bonded)\b/gi, supported: (_m, s) => Boolean(s.claims.insurance) },
  { family: 'certified', re: /\bcertified\b/gi, supported: (_m, s) => Boolean(s.claims.certifications || s.claims.licenses) },
  { family: 'award', re: /\baward[- ]winning\b/gi, supported: (_m, s) => Boolean(s.claims.awards) },
  { family: 'percentage', re: /\b\d{1,3}(?:\.\d+)?\s?%/g, supported: (match, s) => s.publicText.some((text) => contains(text, match.replace(/\s/g, ''))) },
];

export const PLACEHOLDER_PATTERNS = [
  { what: 'a template marker', re: /\[(?:FILL|TEMPLATE|NEEDS FACT|UNKNOWN|PLACEHOLDER|STARTER PLACEHOLDER)\b[^\]]*\]/i },
  { what: 'a TODO', re: /\bTODO\b|\bTBD\b|\bFIXME\b/ },
  { what: 'lorem ipsum', re: /lorem ipsum/i },
  { what: 'a placeholder person', re: /\b(?:John|Jane) (?:Doe|Smith)\b/ },
  { what: 'a generic review', re: /\b(?:Happy|Satisfied) (?:Customer|Client)\b/ },
];
const PLACEHOLDER_ALT = /^(?:image|photo|picture|placeholder|todo|alt|img|graphic|untitled)(?:\s*\d*)?$/i;
const EXAMPLE_DOMAIN = /\b(?:[a-z0-9-]+\.)*example\.(?:com|org|net)\b/gi;
const FICTIONAL_PHONE = /\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?555[\s.-]?01\d{2}\b/g;

/**
 * Analyze rendered pages against the truth projection.
 *
 * pages: [{ route_id, html }]; truth: the parsed facts (parseTruth);
 * projection: truth/truth.json; entity: business-entity.json.
 * Returns violations [{ rule_id, route_id, subject, expected, actual }].
 */
export function analyzePublicCopy({ truth, projection, entity, pages }) {
  const violations = [];
  const at = (rule_id, route_id, subject, expected, actual) => violations.push({ rule_id, route_id, subject, expected, actual });
  const published = publicCommitments(truth);
  const byId = new Map(published.map((item) => [item.id, item]));
  const support = {
    claims: (projection && projection.claims) || {},
    publicText: published.flatMap((item) => [item.statement, item.wording].filter(Boolean)),
    offerText: published.filter((item) => ['offer', 'guarantee', 'policy', 'commitment'].includes(item.kind)).flatMap((item) => [item.statement, item.wording].filter(Boolean)),
  };
  const secret = nonPublicStatements(truth).filter((entry) => norm(entry.text).split(' ').length >= 3);
  const entityPhoneDigits = String((entity && entity.primaryPhone) || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const entityUrl = String((entity && entity.url) || '').toLowerCase();

  for (const page of pages) {
    const html = String(page.html || '');
    const text = visibleText(html);
    const route = page.route_id;

    // Internal and non-public truth never reaches public copy.
    const pageShingles = new Set(shingles(text, 5));
    for (const entry of secret) {
      const needle = shingles(entry.text, 5);
      const hit = needle.length === 1 ? contains(text, entry.text) : needle.some((gram) => pageShingles.has(gram));
      if (hit) at('truth-internal-leak', route, `truth:${entry.id}`, `no public copy of "${entry.id}" (${entry.reason})`, 'its wording appears on the page');
    }

    // Marked commitments render exactly what is confirmed.
    for (const match of html.matchAll(/<([a-zA-Z0-9]+)\b[^>]*\bdata-truth="([^"]*)"[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const id = match[2];
      const rendered = visibleText(match[3]);
      const item = byId.get(id);
      if (!item) at('truth-commitment-unsupported', route, `truth:${id}`, 'a confirmed public commitment in facts.md', `"${id}" is not one`);
      else if (![item.wording, item.visibility === 'public' ? item.statement : null].filter(Boolean).some((allowed) => norm(allowed) === norm(rendered))) {
        at('truth-commitment-unsupported', route, `truth:${id}`, item.visibility === 'public-constrained' ? `exactly the permitted wording "${item.wording}"` : `the recorded commitment "${item.statement}"`, `"${rendered}"`);
      }
    }

    // Claims outside marked truth need support.
    const free = visibleText(withoutMarked(withoutMarked(html, 'data-truth'), 'data-entity'));
    for (const pattern of CLAIM_PATTERNS) {
      for (const match of free.matchAll(pattern.re)) {
        if (!pattern.supported(match[0], support)) at('truth-claim-unsupported', route, `claim:${pattern.family}:${norm(match[0])}`, `a ${pattern.family} claim backed by facts.md`, `"${match[0]}" with no supporting truth`);
      }
    }
    for (const claim of truth.prohibitedClaims) {
      if (norm(claim).split(' ').length >= 2 && contains(text, claim)) at('truth-prohibited-claim', route, `prohibited:${norm(claim)}`, 'never stated (facts.md Prohibited claims)', `"${claim}"`);
    }

    // No placeholder in anything a visitor or assistive technology reads.
    const attributes = [...html.matchAll(/\b(alt|title|aria-label|content|placeholder)="([^"]*)"/gi)].map((m) => ({ name: m[1].toLowerCase(), value: decode(m[2]) }));
    for (const pattern of PLACEHOLDER_PATTERNS) {
      const inText = pattern.re.exec(text);
      const inAttribute = attributes.find((attribute) => attribute.name !== 'placeholder' && pattern.re.test(attribute.value));
      if (inText || inAttribute) at('truth-placeholder-published', route, `placeholder:${pattern.what}`, 'no placeholder in published copy', inText ? `"${inText[0]}" in the page text` : `${inAttribute.name}="${inAttribute.value}"`);
    }
    for (const attribute of attributes.filter((entry) => entry.name === 'alt' && PLACEHOLDER_ALT.test(entry.value.trim()))) {
      at('truth-placeholder-published', route, 'placeholder:alt', 'alt text that describes the image (or alt="" for decoration)', `alt="${attribute.value}"`);
    }
    const hrefs = [...html.matchAll(/\bhref="([^"]*)"/gi)].map((m) => m[1]);
    const exampleIn = (value) => [...String(value).matchAll(EXAMPLE_DOMAIN)].map((m) => m[0]);
    for (const value of [...exampleIn(text), ...hrefs.flatMap(exampleIn)]) {
      if (!entityUrl || !entityUrl.includes(value.toLowerCase().replace(/^https?:\/\//, '').split('/')[0])) at('truth-placeholder-published', route, 'placeholder:example-domain', 'no example.com placeholder', `"${value}"`);
    }
    for (const phone of [...text.matchAll(FICTIONAL_PHONE)].map((m) => m[0])) {
      if (phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '') !== entityPhoneDigits) at('truth-placeholder-published', route, 'placeholder:fictional-phone', 'no fictional 555-01xx number except the recorded one', `"${phone}"`);
    }
  }
  const seen = new Set();
  return violations.filter((violation) => {
    const key = `${violation.rule_id}|${violation.route_id}|${violation.subject}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
