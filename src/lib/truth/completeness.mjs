/**
 * "Do I have enough truth to build this website without invention?"
 *
 * Requirements follow the project, not a universal intake form:
 *
 *   BLOCKING      the site cannot be published safely without it — autonomous
 *                 work stops and ONE direct question is asked
 *   NON-BLOCKING  the site can be built; the gap stays visible
 *   OPTIONAL      would enrich the site; never asked for during a build
 *
 * The question for a blocking item asks only the missing distinction (a public
 * address is asked about only when the delivery model makes it matter).
 * Pure functions only.
 */

import { parseTruth } from './facts.mjs';

const item = (id, label, level, question = null) => ({ id, label, level, question });

const request = (what, why, replyWith) => ({ type: 'FACT NEEDED', what, why, reply_with: replyWith, after: 'I will record the fact and continue automatically.' });

/**
 * `site` (search/site.json, optional) sharpens the profile: location pages need
 * their areas in the service geography; lead forms make a contact method
 * sufficient without a phone.
 * Returns { blocking, non_blocking, optional, ready }.
 */
export function completeness(factsText, { site = null } = {}) {
  const truth = parseTruth(factsText);
  const out = [];
  if (truth.isTemplate) {
    out.push(item('facts-template', 'facts.md', 'blocking', request('The business facts have not been recorded yet.', 'The site is built only from recorded facts.', ['Point me to the business documents', 'Other: <where the facts are>'])));
    return summarize(out);
  }
  const v = (label) => truth.value(label);
  const geo = truth.geography;
  const routes = site && Array.isArray(site.routes) ? site.routes : [];
  const hasLeadForm = Boolean(site && site.conversion && Array.isArray(site.conversion.forms) && site.conversion.forms.some((form) => form && form.lead));

  // --- blocking ---------------------------------------------------------
  if (!v('Trading / display name')) out.push(item('display-name', 'Trading / display name', 'blocking', request('What name should the website use for the business?', 'Every page names the business, and no source records the public name.', ['<the business name as customers see it>'])));
  if (truth.services.length === 0) out.push(item('services', 'Services', 'blocking', request('Which services should the site offer?', 'No approved source lists the services.', ['<service>, <service>, …'])));
  if (!v('Primary phone') && !v('Primary email') && !hasLeadForm) out.push(item('contact-method', 'Primary phone or Primary email', 'blocking', request('How should customers contact the business?', 'The site needs at least one way to reach you.', ['Phone: <number>', 'Email: <address>'])));
  if (geo.serviceGeography.length === 0) {
    const why = geo.operatingBase
      ? `Your source material records the operating base (${geo.operatingBase}), but that is not the same as where customers are served.`
      : 'No approved source says where customers are served.';
    out.push(item('service-geography', 'Service geography', 'blocking', request('Where does the business serve customers?', why, [...(geo.operatingBase ? [`Only ${geo.operatingBase}`] : []), 'Other: <area, region or country>'])));
  }
  if (!geo.deliveryModel) {
    out.push(item('delivery-model', 'Delivery model', 'blocking', request('How do customers receive the service?', 'This decides whether an address is shown and how the business is described to search engines.', ['At a storefront customers visit', 'At the customer\'s location', 'Remotely', 'Both a storefront and on-site'])));
  } else if (['storefront', 'hybrid'].includes(geo.deliveryModel) && geo.publicAddress.state !== 'address') {
    out.push(item('public-address', 'Public customer-facing address', 'blocking', request('What is the address customers visit?', `The delivery model is ${geo.deliveryModel}, so customers need an address, and none is recorded as public.`, ['Public address: <address>', 'No public customer-facing address'])));
  } else if (geo.publicAddress.state === 'unknown' && geo.operatingBase && geo.deliveryModel !== 'remote') {
    out.push(item('public-address', 'Public customer-facing address', 'blocking', request('Do customers visit a public storefront?', 'Your source material confirms the operating base but does not say whether that address is public.', ['Yes — public address: <address>', 'No public customer-facing address'])));
  }
  for (const route of routes) {
    if (route && route.kind === 'location' && route.area && !geo.serviceGeography.some((area) => area.toLowerCase() === String(route.area).toLowerCase())) {
      out.push(item(`location-${route.id}`, `Service geography: ${route.area}`, 'blocking', request(`Does the business serve ${route.area}?`, `A page for ${route.area} is planned, and the recorded service geography does not include it.`, [`Yes, we serve ${route.area}`, `No — remove the ${route.area} page`])));
    }
  }
  for (const commitment of truth.commitments.filter((entry) => entry.status === 'conflicting' && ['public', 'public-constrained'].includes(entry.visibility))) {
    out.push(item(`commitment-${commitment.id}`, `Commitment: ${commitment.id}`, 'blocking', request(`Is this commitment correct as stated: "${commitment.statement}"?`, 'Approved sources disagree about it, and it would be published.', ['Yes, as stated', 'No — do not publish it', 'Other: <correct wording>'])));
  }

  // --- non-blocking -----------------------------------------------------
  if (!v('Hours of operation')) out.push(item('hours', 'Hours of operation', 'non_blocking'));
  if (!v('Legal name')) out.push(item('legal-name', 'Legal name', 'non_blocking'));
  if (!v('Website')) out.push(item('website', 'Website', 'non_blocking', request('What web address will the site use?', 'Canonical links and the sitemap need the site\'s own address; nothing is connected to it.', ['https://<domain>/', 'No domain yet — use the preview address for now'])));
  if (!v('Primary email') && v('Primary phone')) out.push(item('email', 'Primary email', 'non_blocking'));
  if (!v('One-line description')) out.push(item('description', 'One-line description', 'non_blocking'));
  if (!geo.localPresence) out.push(item('local-presence', 'Local presence / Google Business Profile', 'non_blocking'));
  if (hasLeadForm && !v('Privacy policy source')) out.push(item('privacy', 'Privacy policy source', 'non_blocking'));

  // --- optional enrichment ----------------------------------------------
  for (const label of ['Tagline', 'Colors', 'Typefaces', 'Voice / tone notes', 'Supplied testimonials', 'Review platform links', 'Certifications', 'Awards']) {
    if (!v(label)) out.push(item(label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label, 'optional'));
  }
  if (truth.commitments.length === 0) out.push(item('commitments', 'Publishable commitments', 'optional'));
  return summarize(out);
}

function summarize(items) {
  const blocking = items.filter((entry) => entry.level === 'blocking');
  return {
    blocking,
    non_blocking: items.filter((entry) => entry.level === 'non_blocking'),
    optional: items.filter((entry) => entry.level === 'optional'),
    ready: blocking.length === 0,
  };
}
