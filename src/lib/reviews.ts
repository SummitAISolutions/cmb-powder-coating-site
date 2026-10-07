/**
 * Review facts for the pages, read from facts.md (directly, and through
 * truth/truth.json) — never typed here.
 *
 * - The Google profile link: facts.md "Review platform links".
 * - The rating and count: facts.md "Ratings/counts authorized for display"
 *   (display authorised by the owner 2026-10-07).
 * - The quotations: facts.md "### Google reviews (verbatim, display
 *   authorised)", parsed row by row so every card reproduces the recorded
 *   wording and display name exactly, including the reviewers' own spelling.
 *   Nothing is paraphrased, corrected or added. Review dates and reviewers'
 *   photos are deliberately not used.
 *
 * An unparseable record stops the build rather than rendering a guess. No
 * review or rating structured data is emitted anywhere.
 */
import truthJson from '../../truth/truth.json';
import factsMarkdown from '../../facts.md?raw';

export interface Review {
  id: string;
  /** Display name exactly as recorded in facts.md. */
  name: string;
  rating: number;
  /** The review exactly as recorded in facts.md. */
  quote: string;
}

const claims: any = (truthJson as any).claims || {};

const linkMatch = /https:\/\/[^\s)]+/.exec(String(claims.reviewLinks || ''));
if (!linkMatch) throw new Error('reviews: facts.md records no review platform link.');
export const GOOGLE_PROFILE_URL = linkMatch[0];

const ratingMatch = /Google rating (\d(?:\.\d)?) from (\d+) reviews/.exec(String(claims.ratings || ''));
if (!ratingMatch) throw new Error('reviews: facts.md records no authorised Google rating and count.');
export const GOOGLE_RATING = ratingMatch[1];
export const GOOGLE_REVIEW_COUNT = ratingMatch[2];

const observed = /as observed (\d{4})-(\d{2})-\d{2}/.exec(String(claims.ratings || ''));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "September 2026": when the rating was read, so the page never presents it as live. */
export const RATING_AS_OF = observed ? `${MONTHS[Number(observed[2]) - 1]} ${observed[1]}` : null;

/** The facts.md anchor every quotation cites (Quote / ProofRow `source`). */
export const REVIEW_SOURCE = 'facts.md#google-reviews-verbatim-display-authorised';
export const RATING_SOURCE = 'facts.md#testimonials-and-reviews';

function parseReviews(markdown: string): Review[] {
  const section = /^### Google reviews \(verbatim, display authorised\)\s*$([\s\S]*?)(?=^#{2,3} )/m.exec(markdown);
  if (!section) return [];
  const rows: Review[] = [];
  for (const line of section[1].split('\n')) {
    if (!/^\|\s*review-/.test(line)) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
    if (cells.length !== 4) throw new Error(`reviews: facts.md review row is malformed: ${line.slice(0, 80)}`);
    const [id, name, rating, quote] = cells;
    if (!name || !quote || !/^[1-5]$/.test(rating)) throw new Error(`reviews: facts.md review "${id}" is incomplete.`);
    rows.push({ id, name, rating: Number(rating), quote });
  }
  return rows;
}

const supplied = typeof claims.testimonials === 'string' && claims.testimonials.trim() !== '';
const REVIEWS: Review[] = supplied ? parseReviews(factsMarkdown) : [];

/** Every recorded, authorised review, in facts.md order. */
export const allReviews = (): Review[] => REVIEWS.slice();

/** The curated selection for the shared band, by facts.md id; unknown ids stop the build. */
export function reviewsById(ids: string[]): Review[] {
  if (REVIEWS.length === 0) return [];
  return ids.map((id) => {
    const found = REVIEWS.find((review) => review.id === id);
    if (!found) throw new Error(`reviews: facts.md records no review "${id}".`);
    return found;
  });
}
