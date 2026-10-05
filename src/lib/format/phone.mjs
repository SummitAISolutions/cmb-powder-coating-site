/**
 * Phone numbers: one canonical value, a human display, a dial link.
 *
 *   canonical  +12088809362      what data, JSON-LD and QA carry (E.164)
 *   display    (208) 880-9362    what a visitor reads
 *   link       tel:+12088809362  what a tap dials — always the canonical value
 *
 * Pilot 0 (P1-07): the starter rendered the canonical E.164 value as visible
 * text. The display is derived here and nowhere else; the canonical value is
 * never rewritten by it.
 *
 * North American numbers (+1, NANP) are formatted. Anything else is shown as
 * its canonical value — correct, just not prettified — rather than guessed at.
 * Dependency-free ESM; pure functions only.
 */

const NANP_AREA_OR_EXCHANGE = /^[2-9]\d{2}$/;

/**
 * The E.164 form of a written number, or null when it is not a phone number.
 * 10 digits (or 11 starting with 1) are North American; a number written with
 * a leading "+" keeps its own country code. Nothing else is guessed.
 */
export function canonicalPhone(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, '');
  if (raw.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** Whether a canonical number is a North American number this module formats. */
export function isNanp(e164) {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(String(e164 ?? ''));
  return Boolean(match && NANP_AREA_OR_EXCHANGE.test(match[1]) && NANP_AREA_OR_EXCHANGE.test(match[2]));
}

/**
 * The visitor-facing form. NANP → "(208) 880-9362". Any other valid number →
 * its canonical value unchanged. Unparseable input → returned as written, so
 * a display never corrupts or drops what the source said.
 */
export function displayPhone(value) {
  const canonical = canonicalPhone(value);
  if (!canonical) return String(value ?? '').trim();
  if (!isNanp(canonical)) return canonical;
  const digits = canonical.slice(2);
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** The dial link: built from the canonical value only, or null when there is none. */
export function telHref(value) {
  const canonical = canonicalPhone(value);
  return canonical ? `tel:${canonical}` : null;
}
