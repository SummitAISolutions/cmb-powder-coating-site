/**
 * Review facts for the page, read from facts.md through truth/truth.json —
 * never typed here.
 *
 * - The Google profile link: facts.md "Review platform links".
 * - The rating and count: facts.md "Ratings/counts authorized for display"
 *   (display authorised by the owner 2026-10-07). Parsed, so a change in
 *   facts.md changes the page; an unparseable record stops the build.
 * - Quotes: TESTIMONIALS below stays empty until facts.md "Supplied
 *   testimonials" records real, authorised quotations. Every entry must appear
 *   verbatim in that field (checked here), and the cards render only then.
 *   Never write, paraphrase or invent a review or a reviewer name.
 */
import truthJson from '../../truth/truth.json';

export interface Testimonial {
  /** The quotation exactly as recorded in facts.md. */
  quote: string;
  /** The name exactly as recorded in facts.md. */
  attribution: string;
  context?: string;
}

/** Add entries only from facts.md "Supplied testimonials". */
export const TESTIMONIALS: Testimonial[] = [];

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

const supplied = typeof claims.testimonials === 'string' ? claims.testimonials : '';
for (const entry of TESTIMONIALS) {
  if (!supplied.includes(entry.quote) || !supplied.includes(entry.attribution)) {
    throw new Error(`reviews: the quote attributed to "${entry.attribution}" is not recorded verbatim in facts.md "Supplied testimonials".`);
  }
}
export const testimonials = (): Testimonial[] => (supplied ? TESTIMONIALS : []);

export const REVIEW_SOURCE = 'facts.md#testimonials-and-reviews';
