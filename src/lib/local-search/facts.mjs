/**
 * Source precedence, enforced: facts.md → business-entity.json.
 *
 * facts.md stays authoritative. This module reads facts.md (facts contract v2,
 * or a not-yet-migrated v1 file) and reconciles the entity against it:
 *
 *   facts.md knows a value, the entity differs          → problem (conflict)
 *   facts.md does not know a value, the entity has one  → problem (not sourced)
 *   facts.md knows a value, the entity leaves it null   → warning (incomplete)
 *
 * Nothing is merged, and nothing is picked silently. Pure functions only.
 */

import { isTemplateEntity, normalizeEmail, normalizePhone, normalizeText, addressLine, urlKey } from './entity.mjs';
import { parseTruth, businessModelFor } from '../truth/facts.mjs';

/**
 * Parse facts.md (contract v1 or v2) into { contract, isTemplate, text,
 * value(label), services, geography, commitments, … } — see src/lib/truth/facts.mjs.
 */
export const parseFacts = parseTruth;

const containsWords = (haystack, needle) => {
  const h = ` ${normalizeText(haystack)} `;
  const n = normalizeText(needle);
  return n.length > 0 && h.includes(` ${n} `);
};

const phonesIn = (text) => [...String(text).matchAll(/\+?\d[\d\s().-]{5,}\d/g)].map((match) => normalizePhone(match[0])).filter((digits) => digits.length >= 7);
const emailsIn = (text) => [...String(text).matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((match) => normalizeEmail(match[0]));
const urlKeysIn = (text) => [...String(text).matchAll(/https?:\/\/[^\s)>\]`'"|]+/g)].map((match) => urlKey(match[0].replace(/[.,;]+$/, ''))).filter(Boolean);

/** Minutes past midnight for every time written in free text ("8am", "5:30 pm", "17:00"). */
function timesIn(text) {
  const minutes = new Set();
  for (const match of String(text).matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?![\d:])/gi)) {
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = (match[3] || '').toLowerCase().replace(/\./g, '');
    if (!match[2] && !meridiem) continue; // a bare number is not a time
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    if (hour <= 24 && minute < 60) minutes.add(hour * 60 + minute);
  }
  if (/\bnoon\b/i.test(text)) minutes.add(720);
  if (/\bmidnight\b/i.test(text)) minutes.add(0);
  return minutes;
}
const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const QUALIFICATION_LABELS = {
  license: ['Licenses'],
  certification: ['Certifications'],
  insurance: ['Insurance'],
  membership: ['Affiliations / memberships'],
  award: ['Awards'],
};

/**
 * Reconcile an entity with facts.md. `sources` may add RESOURCES.md and
 * RESEARCH.md text (URLs and profile links often live there).
 * Returns { problems, warnings }.
 */
export function reconcileEntityWithFacts(entity, factsMarkdown, { resources = '', research = '', factsSha256 = null } = {}) {
  const problems = [];
  const warnings = [];
  if (isTemplateEntity(entity)) return { problems, warnings: ['business entity is still the template: nothing to reconcile'] };
  const facts = parseFacts(factsMarkdown);
  if (facts.isTemplate) {
    problems.push('facts.md is still the [TEMPLATE]: a client business entity cannot be derived from it');
    return { problems, warnings };
  }
  const conflict = (field, factsValue, entityValue) => problems.push(`${field}: entity says ${JSON.stringify(entityValue)} but facts.md says ${JSON.stringify(factsValue)} — fix one of them; nothing is picked silently`);
  const unsourced = (field, entityValue, where = 'facts.md') => problems.push(`${field}: ${JSON.stringify(entityValue)} is not recorded in ${where} — unknown facts stay null`);
  const incomplete = (field, factsValue) => warnings.push(`${field}: facts.md records ${JSON.stringify(factsValue)} but the entity leaves it empty`);

  if (factsSha256 && entity.source && entity.source.factsSha256 && entity.source.factsSha256 !== factsSha256) {
    warnings.push('facts.md changed since the entity was last reconciled (source.factsSha256 differs); re-check the entity and update the hash');
  }

  // Names.
  for (const [field, label] of [['publicName', 'Trading / display name'], ['legalName', 'Legal name']]) {
    const known = facts.value(label);
    const value = entity[field];
    if (known && value && normalizeText(known) !== normalizeText(value)) conflict(field, known, value);
    else if (!known && value) unsourced(field, value);
    else if (known && !value && field === 'legalName') incomplete(field, known);
  }

  // Phone.
  const factsPhone = facts.value('Primary phone');
  if (entity.primaryPhone) {
    if (factsPhone && normalizePhone(factsPhone) !== normalizePhone(entity.primaryPhone)) conflict('primaryPhone', factsPhone, entity.primaryPhone);
    else if (!factsPhone && !phonesIn(facts.text).includes(normalizePhone(entity.primaryPhone))) unsourced('primaryPhone', entity.primaryPhone);
  } else if (factsPhone) incomplete('primaryPhone', factsPhone);

  // Emails.
  const factsEmails = new Set(emailsIn(facts.text));
  for (const email of entity.emails || []) if (!factsEmails.has(normalizeEmail(email))) unsourced('emails', email);
  const primaryEmail = facts.value('Primary email');
  if (primaryEmail && !(entity.emails || []).map(normalizeEmail).includes(normalizeEmail(primaryEmail))) incomplete('emails', primaryEmail);

  // Address (the value; its public visibility is a separate, explicit decision).
  const geo = facts.geography;
  const value = entity.address && entity.address.value;
  const withheld = !(entity.address && entity.address.public === true);
  if (facts.contract >= 2) {
    const publicState = geo.publicAddress.state;
    if (entity.address && entity.address.public === true && publicState === 'none') problems.push('address.public: the entity publishes an address but facts.md says there is no public customer-facing address');
    if (entity.address && entity.address.public === true && publicState === 'unknown') problems.push('address.public: facts.md does not record a public customer-facing address — visibility is an explicit fact, never assumed');
    if (entity.address && entity.address.public !== true && publicState === 'address') problems.push('address.public: facts.md records a public customer-facing address but the entity hides it');
    if (value && typeof value === 'object') {
      const recorded = withheld ? geo.operatingBase : geo.publicAddress.value;
      const label = withheld ? '(hidden address withheld)' : addressLine(value);
      const where = withheld ? 'facts.md "Operating base"' : 'facts.md "Public customer-facing address"';
      if (!recorded) problems.push(`address.value: ${label} is not recorded in ${where} — unknown facts stay null`);
      else if (![value.streetAddress, value.addressLocality, value.postalCode].filter(Boolean).every((part) => containsWords(recorded, part))) problems.push(`address.value: the entity address ${label} does not match ${where}`);
    } else if (publicState === 'address') warnings.push('address.value: facts.md records a public customer-facing address but the entity leaves it empty');
    const expectedModel = businessModelFor(geo.deliveryModel);
    if (expectedModel && entity.businessModel && entity.businessModel !== expectedModel) conflict('businessModel', `Delivery model: ${geo.deliveryModel}`, entity.businessModel);
    if (entity.deliveryModel && geo.deliveryModel && entity.deliveryModel !== geo.deliveryModel) conflict('deliveryModel', geo.deliveryModel, entity.deliveryModel);
    else if (entity.deliveryModel && !geo.deliveryModel) unsourced('deliveryModel', entity.deliveryModel, 'facts.md "Delivery model"');
    if (entity.operatingBase && entity.operatingBase.name) {
      if (!geo.operatingBase) unsourced('operatingBase', entity.operatingBase.name, 'facts.md "Operating base"');
      else if (!entity.operatingBase.name.split(',').map((part) => part.trim()).filter(Boolean).every((part) => containsWords(geo.operatingBase, part))) conflict('operatingBase', geo.operatingBase, entity.operatingBase.name);
    }
  } else {
    const factsAddress = facts.value('Physical address');
    if (value && typeof value === 'object') {
      const label = withheld ? '(hidden address withheld)' : addressLine(value);
      if (!factsAddress) problems.push(`address.value: ${label} is not recorded in facts.md "Physical address" — unknown facts stay null`);
      else {
        const parts = [value.streetAddress, value.addressLocality, value.postalCode].filter(Boolean);
        if (!parts.every((part) => containsWords(factsAddress, part))) problems.push(`address.value: the entity address ${label} does not match facts.md "Physical address"`);
      }
    } else if (factsAddress) warnings.push('address.value: facts.md records a physical address but the entity leaves it empty');
  }

  // Hours.
  const factsHours = facts.value('Hours of operation');
  if (Array.isArray(entity.hours) && entity.hours.length > 0) {
    if (!factsHours) unsourced('hours', 'opening hours');
    else {
      const known = timesIn(factsHours);
      for (const row of entity.hours) {
        for (const time of [row.opens, row.closes]) if (!known.has(toMinutes(time))) conflict('hours', factsHours, `${row.days.join('/')} ${row.opens}–${row.closes}`);
      }
    }
  } else if (factsHours) incomplete('hours', factsHours);

  // Service areas: only approved areas, never an area facts.md excludes.
  // v2: only the service geography — an operating base is never a service area.
  // v1 (not yet migrated) keeps its original reading.
  const served = facts.contract >= 2
    ? geo.serviceGeography.join('; ')
    : [facts.value('Areas served'), facts.value('Primary location(s)')].filter(Boolean).join('; ');
  const excluded = facts.contract >= 2 ? geo.excludedAreas.join('; ') : facts.value('Areas explicitly not served') || '';
  for (const area of entity.serviceAreas || []) {
    if (excluded && containsWords(excluded, area.name)) problems.push(`serviceAreas: "${area.name}" is listed in facts.md as an area explicitly NOT served`);
    else if (!served) unsourced('serviceAreas', area.name, 'facts.md "Service geography"');
    else if (!containsWords(served, area.name)) problems.push(`serviceAreas: "${area.name}" is not in facts.md "Service geography" — service areas come from approved truth only${facts.contract >= 2 && geo.operatingBase && containsWords(geo.operatingBase, area.name) ? ' (it is the operating base, which is not a service area)' : ''}`);
  }
  if (served && (entity.serviceAreas || []).length === 0) warnings.push('serviceAreas: facts.md records served areas but the entity lists none');

  // Services.
  const factsServices = facts.services.map(normalizeText);
  for (const service of entity.services || []) {
    if (factsServices.length === 0) unsourced('services', service.name, 'the facts.md Services table');
    else if (!factsServices.includes(normalizeText(service.name))) problems.push(`services: "${service.name}" is not a service in the facts.md Services table (names must match exactly)`);
  }

  // Qualifications (licences, certifications, …): sourced, and matching what facts.md records for that kind.
  for (const qualification of entity.qualifications || []) {
    const recorded = (QUALIFICATION_LABELS[qualification.kind] || []).map((label) => facts.value(label)).filter(Boolean).join('; ');
    if (!recorded) unsourced(`qualifications (${qualification.kind})`, qualification.name);
    else {
      if (!containsWords(recorded, qualification.name)) conflict(`qualifications (${qualification.kind})`, recorded, qualification.name);
      if (qualification.identifier && !normalizeText(recorded).includes(normalizeText(qualification.identifier))) conflict(`qualifications (${qualification.kind}) identifier`, recorded, qualification.identifier);
    }
  }

  // URLs and profiles: somewhere in the source package, never invented.
  const packageUrls = new Set([...urlKeysIn(facts.text), ...urlKeysIn(resources)]);
  for (const [field, link] of [['url', entity.url], ['bookingUrl', entity.bookingUrl], ['contactUrl', entity.contactUrl], ...(entity.sameAs || []).map((item) => ['sameAs', item])]) {
    if (!link) continue;
    const key = urlKey(link);
    if (!packageUrls.has(key)) unsourced(field, link, 'facts.md or RESOURCES.md');
  }

  // GBP categories are a category choice, not a literal client fact: warn only.
  const categoryText = `${facts.text}\n${research}`;
  const categories = entity.gbpCategories ? [entity.gbpCategories.primary, ...(entity.gbpCategories.secondary || [])].filter(Boolean) : [];
  for (const category of categories) {
    if (!normalizeText(categoryText).includes(normalizeText(category))) warnings.push(`gbpCategories: "${category}" is not mentioned in facts.md or RESEARCH.md; confirm it matches the client's Google Business Profile`);
  }
  return { problems, warnings };
}
