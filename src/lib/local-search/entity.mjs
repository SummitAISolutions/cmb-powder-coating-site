/**
 * Business Entity v1 — search/business-entity.json.
 *
 * A minimal, normalized, machine-readable PROJECTION of the approved client
 * truth in facts.md. It is not a second source of truth, not a CRM record and
 * not a marketing database:
 *
 *   facts.md (the source package)  →  business-entity.json  →  site / JSON-LD / QA
 *
 * Every value here must be traceable to the source package. When the entity
 * and facts.md disagree, validation fails (see facts.mjs); nothing silently
 * picks one. Unknown facts are `null` (or an empty list), never guessed.
 *
 * Dependency-free ESM: imported by the Astro build, by the starter's
 * `npm run search:check`, and by the orchestration repository (validation and
 * Stage 4 QA). Pure functions only.
 */

export const ENTITY_SCHEMA_VERSION = 1;
export const ENTITY_PATH = 'search/business-entity.json';
export const ENTITY_STATUSES = ['template', 'client'];

// multi_location is deliberately not supported in v1: one entity describes one
// business with one (optional) address. A multi-location client needs a
// separate, explicit design decision.
export const BUSINESS_MODELS = ['storefront', 'service_area', 'hybrid'];

export const AREA_TYPES = ['City', 'County', 'State', 'PostalCode', 'Neighborhood', 'AdministrativeArea', 'Place', 'Country'];
// facts contract v2 geography (src/lib/truth/facts.mjs). Optional, so a v1 entity stays valid.
export const DELIVERY_MODELS = ['storefront', 'customer-location', 'mobile-service', 'remote', 'hybrid'];
export const QUALIFICATION_KINDS = ['license', 'certification', 'insurance', 'membership', 'award'];
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// schema.org types this v1 knows to be LocalBusiness (or Organization) types.
// Another PascalCase type is accepted with a warning to verify it at schema.org.
export const KNOWN_SCHEMA_TYPES = [
  'LocalBusiness', 'Organization', 'ProfessionalService', 'HomeAndConstructionBusiness',
  'GeneralContractor', 'RoofingContractor', 'Electrician', 'Plumber', 'HVACBusiness', 'HousePainter',
  'Locksmith', 'MovingCompany', 'AutomotiveBusiness', 'AutoRepair', 'AutoBodyShop', 'AutoWash',
  'EmergencyService', 'LegalService', 'Attorney', 'AccountingService', 'FinancialService',
  'MedicalBusiness', 'Dentist', 'HealthAndBeautyBusiness', 'HairSalon', 'DaySpa',
  'FoodEstablishment', 'Restaurant', 'Store', 'AnimalShelter', 'ChildCare',
];

export const PLACEHOLDER_MARKERS = ['[UNKNOWN]', '[PLACEHOLDER]', '[TODO', 'TODO:', 'lorem ipsum', '[FILL', '[TEMPLATE]', '[NEEDS FACT'];

const TOP_KEYS = [
  'schemaVersion', 'status', 'source', 'publicName', 'legalName', 'businessModel', 'schemaType',
  'primaryPhone', 'emails', 'address', 'serviceAreas', 'hours', 'url', 'bookingUrl', 'contactUrl',
  'services', 'gbpCategories', 'sameAs', 'qualifications', 'provenance', 'operatingBase', 'deliveryModel',
];
const ADDRESS_FIELDS = ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry'];
const SOURCE_FILES_RE = /(facts|RESOURCES|RESEARCH|INPUT_MANIFEST)\.md/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;

/** Digits only; a leading US/CA "1" on 11 digits is dropped (same rule as Stage 4). */
export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

export const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

/** Lower-case words and digits only, single-spaced. Used for every text comparison. */
export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9&]+/g, ' ')
    .trim();
}

/** A comparable URL key: host + path, no scheme, no trailing slash, no query. */
export function urlKey(value) {
  try {
    const url = new URL(String(value));
    return `${url.host.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export function isTemplateEntity(entity) {
  return !isObject(entity) || entity.status !== 'client';
}

/** One-line postal address, or null. */
export function addressLine(value) {
  if (!isObject(value)) return null;
  const locality = [value.addressLocality, value.addressRegion].filter(isText).join(', ');
  return [value.streetAddress, [locality, value.postalCode].filter(isText).join(' '), value.addressCountry].filter(isText).join(', ') || null;
}

/** The address that may be shown publicly, or null. A hidden address never leaves this function. */
export function publicAddress(entity) {
  if (!isObject(entity) || !isObject(entity.address) || entity.address.public !== true) return null;
  return isObject(entity.address.value) ? entity.address.value : null;
}

/**
 * Normalized strings that identify a HIDDEN address. Used only to detect a
 * leak; callers must never write them into a finding, report or evidence file.
 */
export function hiddenAddressNeedles(entity) {
  if (!isObject(entity) || !isObject(entity.address) || entity.address.public === true) return [];
  const value = entity.address.value;
  if (!isObject(value) || !isText(value.streetAddress)) return [];
  return [normalizeText(value.streetAddress)].filter((needle) => needle.split(' ').length >= 2);
}

/**
 * Text (e.g. facts.md) with every line that names a HIDDEN address withheld,
 * so the source package can be sealed as evidence or handed to a reviewer.
 * A bullet keeps its label; the value is replaced. The needle never leaves.
 */
export function withholdHiddenAddress(text, entity) {
  const needles = hiddenAddressNeedles(entity);
  if (needles.length === 0) return String(text ?? '');
  return String(text ?? '')
    .split('\n')
    .map((line) => {
      const normalized = ` ${normalizeText(line)} `;
      if (!needles.some((needle) => normalized.includes(` ${needle} `))) return line;
      const bullet = /^(\s*[-*]\s+[^:]+:\s*)/.exec(line);
      return `${bullet ? bullet[1] : ''}[WITHHELD: address.public is false]`;
    })
    .join('\n');
}

/** The entity with a hidden address withheld: safe to seal as evidence or hand to a reviewer. */
export function publicProjection(entity) {
  if (!isObject(entity)) return entity;
  const copy = JSON.parse(JSON.stringify(entity));
  if (isObject(copy.address) && copy.address.public !== true && copy.address.value !== null && copy.address.value !== undefined) {
    copy.address.value = '[WITHHELD: address.public is false]';
  }
  return copy;
}

const DAY_ABBR = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };

/** Deterministic human text for hours, used by the EntityFact primitive and by QA. */
export function hoursText(entity) {
  if (!isObject(entity) || !Array.isArray(entity.hours) || entity.hours.length === 0) return null;
  return entity.hours.map((row) => `${row.days.map((day) => DAY_ABBR[day] || day).join(', ')} ${row.opens}–${row.closes}`).join('; ');
}

export const serviceAreaNames = (entity) => (isObject(entity) && Array.isArray(entity.serviceAreas) ? entity.serviceAreas.map((area) => area.name) : []);

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((child) => collectStrings(child, out));
  else if (isObject(value)) Object.values(value).forEach((child) => collectStrings(child, out));
  return out;
}

function httpUrlProblem(value, label, { httpsOnly = false } = {}) {
  if (value === null || value === undefined) return null;
  try {
    const url = new URL(value);
    if (httpsOnly ? url.protocol !== 'https:' : !['http:', 'https:'].includes(url.protocol)) return `${label} must be an ${httpsOnly ? 'https' : 'http(s)'} URL`;
    return null;
  } catch {
    return `${label} must be an absolute URL (got ${JSON.stringify(value)})`;
  }
}

/**
 * Shape and safety problems of a business entity. Pure.
 * Returns { problems: string[], warnings: string[] }. All problems are
 * collected, never only the first.
 */
export function entityProblems(entity) {
  const problems = [];
  const warnings = [];
  if (!isObject(entity)) return { problems: ['business entity must be a JSON object'], warnings };
  for (const key of Object.keys(entity)) if (!TOP_KEYS.includes(key)) problems.push(`unknown key "${key}"`);
  if (entity.schemaVersion !== ENTITY_SCHEMA_VERSION) problems.push(`schemaVersion must be ${ENTITY_SCHEMA_VERSION}`);
  if (!ENTITY_STATUSES.includes(entity.status)) problems.push(`status must be one of ${ENTITY_STATUSES.join(', ')}`);
  const client = entity.status === 'client';

  if (entity.source !== undefined && entity.source !== null) {
    if (!isObject(entity.source)) problems.push('source must be an object');
    else {
      if (entity.source.facts !== undefined && entity.source.facts !== 'facts.md') problems.push('source.facts must be "facts.md" (the only source of client facts)');
      if (entity.source.factsSha256 !== undefined && entity.source.factsSha256 !== null && !/^sha256:[0-9a-f]{64}$/.test(entity.source.factsSha256)) problems.push('source.factsSha256 must be sha256:<64 hex> or null');
    }
  }

  // Identity.
  if (client && !isText(entity.publicName)) problems.push('publicName is required for a client entity');
  if (entity.publicName !== null && entity.publicName !== undefined && typeof entity.publicName !== 'string') problems.push('publicName must be a string or null');
  if (entity.legalName !== null && entity.legalName !== undefined && !isText(entity.legalName)) problems.push('legalName must be a non-empty string or null');
  if (entity.businessModel === 'multi_location') {
    problems.push('businessModel "multi_location" is not supported in v1: one entity describes one business location (see docs/local-search.md)');
  } else if (client && !BUSINESS_MODELS.includes(entity.businessModel)) {
    problems.push(`businessModel must be one of ${BUSINESS_MODELS.join(', ')}`);
  } else if (!client && entity.businessModel !== null && entity.businessModel !== undefined && !BUSINESS_MODELS.includes(entity.businessModel)) {
    problems.push(`businessModel must be one of ${BUSINESS_MODELS.join(', ')} or null`);
  }
  if (entity.schemaType !== null && entity.schemaType !== undefined) {
    if (typeof entity.schemaType !== 'string' || !/^[A-Z][A-Za-z]+$/.test(entity.schemaType)) problems.push('schemaType must be a schema.org type name such as "RoofingContractor"');
    else if (!KNOWN_SCHEMA_TYPES.includes(entity.schemaType)) warnings.push(`schemaType "${entity.schemaType}" is not in the v1 list; verify it is a LocalBusiness type at schema.org`);
  }

  // Contact.
  if (entity.primaryPhone !== null && entity.primaryPhone !== undefined) {
    const digits = normalizePhone(entity.primaryPhone);
    if (typeof entity.primaryPhone !== 'string' || digits.length < 7 || digits.length > 15) problems.push(`primaryPhone "${entity.primaryPhone}" is not a phone number`);
  }
  if (!Array.isArray(entity.emails)) problems.push('emails must be a list (empty when unknown)');
  else {
    for (const email of entity.emails) if (typeof email !== 'string' || !EMAIL_RE.test(email)) problems.push(`emails: "${email}" is not an email address`);
    if (new Set(entity.emails.map(normalizeEmail)).size !== entity.emails.length) problems.push('emails must not repeat');
  }

  // Address and its public visibility.
  if (!isObject(entity.address)) {
    problems.push('address must be an object { value, public } (value null when unknown, public explicit)');
  } else {
    const { value } = entity.address;
    for (const key of Object.keys(entity.address)) if (!['value', 'public'].includes(key)) problems.push(`address: unknown key "${key}"`);
    if (typeof entity.address.public !== 'boolean') problems.push('address.public must be true or false — visibility is always an explicit decision');
    if (value !== null && value !== undefined) {
      if (!isObject(value)) problems.push('address.value must be a postal address object or null');
      else {
        for (const key of Object.keys(value)) if (!ADDRESS_FIELDS.includes(key)) problems.push(`address.value: unknown key "${key}"`);
        for (const key of ADDRESS_FIELDS) if (value[key] !== undefined && value[key] !== null && !isText(value[key])) problems.push(`address.value.${key} must be a non-empty string or null`);
        if (!isText(value.streetAddress) || !isText(value.addressLocality)) problems.push('address.value needs at least streetAddress and addressLocality');
      }
    }
    if (entity.address.public === true && !isObject(value)) problems.push('address.public is true but address.value is unknown');
    if (client && entity.businessModel === 'storefront') {
      if (!isObject(value)) problems.push('a storefront business needs its customer-facing address in address.value');
      if (entity.address.public !== true) problems.push('a storefront business receives customers at its address: address.public must be true');
    }
    if (client && entity.businessModel === 'service_area' && entity.address.public === true) {
      problems.push('a service_area business has no customer-facing premises: address.public must be false (use "hybrid" only if customers genuinely visit the address)');
    }
    if (client && entity.businessModel === 'hybrid') {
      if (!isObject(value)) problems.push('a hybrid business needs its customer-facing address in address.value');
      else if (entity.address.public !== true) warnings.push('a hybrid business usually shows the address customers visit; address.public is false');
    }
  }

  // Geography (facts contract v2): the operating base is a locality, never a
  // street address (that lives in address.value with its own visibility), and
  // the delivery model must agree with the business model.
  if (entity.operatingBase !== undefined && entity.operatingBase !== null) {
    if (!isObject(entity.operatingBase) || !isText(entity.operatingBase.name)) problems.push('operatingBase must be { name, locality?, region?, country? } or null');
    else for (const key of Object.keys(entity.operatingBase)) if (!['name', 'locality', 'region', 'country'].includes(key)) problems.push(`operatingBase: unknown key "${key}"`);
  }
  if (entity.deliveryModel !== undefined && entity.deliveryModel !== null) {
    if (!DELIVERY_MODELS.includes(entity.deliveryModel)) problems.push(`deliveryModel must be one of ${DELIVERY_MODELS.join(', ')} or null`);
    else if (client && BUSINESS_MODELS.includes(entity.businessModel)) {
      const expected = { storefront: 'storefront', hybrid: 'hybrid' }[entity.deliveryModel] || 'service_area';
      if (entity.businessModel !== expected) problems.push(`deliveryModel "${entity.deliveryModel}" means businessModel "${expected}", not "${entity.businessModel}"`);
    }
  }

  // Service areas.
  if (!Array.isArray(entity.serviceAreas)) problems.push('serviceAreas must be a list (empty when unknown)');
  else {
    const seen = new Set();
    for (const [index, area] of entity.serviceAreas.entries()) {
      if (!isObject(area) || !isText(area.name)) problems.push(`serviceAreas[${index}] needs a name`);
      else {
        const key = normalizeText(area.name);
        if (seen.has(key)) problems.push(`serviceAreas: "${area.name}" is listed twice`);
        seen.add(key);
        for (const field of Object.keys(area)) if (!['name', 'type'].includes(field)) problems.push(`serviceAreas[${index}]: unknown key "${field}"`);
        if (area.type !== undefined && area.type !== null && !AREA_TYPES.includes(area.type)) problems.push(`serviceAreas[${index}].type must be one of ${AREA_TYPES.join(', ')}`);
      }
    }
    if (client && ['service_area', 'hybrid'].includes(entity.businessModel) && entity.serviceAreas.length === 0) {
      problems.push(`a ${entity.businessModel} business needs its approved serviceAreas (from facts.md "Areas served")`);
    }
  }

  // Hours.
  if (entity.hours !== null && entity.hours !== undefined) {
    if (!Array.isArray(entity.hours)) problems.push('hours must be a list of { days, opens, closes } or null when unknown');
    else {
      for (const [index, row] of entity.hours.entries()) {
        if (!isObject(row) || !Array.isArray(row.days) || row.days.length === 0 || row.days.some((day) => !DAYS.includes(day))) problems.push(`hours[${index}].days must list day names (${DAYS.join(', ')})`);
        if (!isObject(row) || !TIME_RE.test(row.opens || '') || !TIME_RE.test(row.closes || '')) problems.push(`hours[${index}] opens/closes must be HH:MM (24h)`);
      }
    }
  }

  // URLs.
  for (const [key, options] of [['url', { httpsOnly: true }], ['bookingUrl', {}], ['contactUrl', {}]]) {
    const problem = httpUrlProblem(entity[key], key, options);
    if (problem) problems.push(problem);
  }
  if (isText(entity.url)) {
    try {
      const url = new URL(entity.url);
      if (url.pathname !== '/' || url.search || url.hash) problems.push('url must be the website origin (e.g. https://www.example.com/), with no path');
    } catch {
      /* reported above */
    }
  }

  // Services.
  if (!Array.isArray(entity.services)) problems.push('services must be a list (empty when unknown)');
  else {
    const ids = new Set();
    const names = new Set();
    for (const [index, service] of entity.services.entries()) {
      if (!isObject(service)) {
        problems.push(`services[${index}] must be an object`);
        continue;
      }
      for (const field of Object.keys(service)) if (!['id', 'name', 'description'].includes(field)) problems.push(`services[${index}]: unknown key "${field}"`);
      if (!SLUG_RE.test(service.id || '')) problems.push(`services[${index}].id must be a slug`);
      else if (ids.has(service.id)) problems.push(`services: duplicate id "${service.id}"`);
      ids.add(service.id);
      if (!isText(service.name)) problems.push(`services[${index}].name is required`);
      else if (names.has(normalizeText(service.name))) problems.push(`services: "${service.name}" is listed twice`);
      else names.add(normalizeText(service.name));
      if (service.description !== undefined && service.description !== null && !isText(service.description)) problems.push(`services[${index}].description must be text or null`);
    }
  }

  // Google Business Profile category concepts.
  if (!isObject(entity.gbpCategories)) problems.push('gbpCategories must be { primary, secondary }');
  else {
    const { primary, secondary } = entity.gbpCategories;
    if (primary !== null && primary !== undefined && !isText(primary)) problems.push('gbpCategories.primary must be text or null');
    if (!Array.isArray(secondary) || secondary.some((item) => !isText(item))) problems.push('gbpCategories.secondary must be a list of category names');
    else if (secondary.length > 0 && !isText(primary)) problems.push('gbpCategories.secondary needs a primary category');
  }

  // Confirmed profiles.
  if (!Array.isArray(entity.sameAs)) problems.push('sameAs must be a list of confirmed profile URLs (empty when none)');
  else {
    for (const link of entity.sameAs) {
      const problem = httpUrlProblem(link, `sameAs "${link}"`, { httpsOnly: true });
      if (problem) problems.push(problem);
    }
    if (new Set(entity.sameAs.map(urlKey)).size !== entity.sameAs.length) problems.push('sameAs must not repeat');
  }

  // Licences, certifications, insurance, memberships, awards: only when sourced.
  // (Named `qualifications`, not `credentials`: evidence and the run ledger refuse credential-like keys.)
  if (!Array.isArray(entity.qualifications)) problems.push('qualifications must be a list (empty when none are sourced)');
  else {
    for (const [index, qualification] of entity.qualifications.entries()) {
      if (!isObject(qualification)) {
        problems.push(`qualifications[${index}] must be an object`);
        continue;
      }
      if (!QUALIFICATION_KINDS.includes(qualification.kind)) problems.push(`qualifications[${index}].kind must be one of ${QUALIFICATION_KINDS.join(', ')}`);
      if (!isText(qualification.name)) problems.push(`qualifications[${index}].name is required`);
      if (typeof qualification.source !== 'string' || !/facts\.md/.test(qualification.source)) problems.push(`qualifications[${index}] has no facts.md source — a qualification that cannot be traced is not published`);
      for (const field of Object.keys(qualification)) if (!['kind', 'name', 'identifier', 'issuer', 'source'].includes(field)) problems.push(`qualifications[${index}]: unknown key "${field}"`);
    }
  }

  // Light provenance.
  if (entity.provenance !== undefined && entity.provenance !== null) {
    if (!isObject(entity.provenance)) problems.push('provenance must map entity fields to source references');
    else {
      for (const [field, ref] of Object.entries(entity.provenance)) {
        if (!TOP_KEYS.includes(field) || ['schemaVersion', 'status', 'source', 'provenance'].includes(field)) problems.push(`provenance: "${field}" is not an entity fact field`);
        if (typeof ref !== 'string' || !SOURCE_FILES_RE.test(ref)) problems.push(`provenance.${field} must reference the source package (facts.md, RESOURCES.md, RESEARCH.md or INPUT_MANIFEST.md)`);
      }
    }
  }

  // A client entity may never carry template placeholders.
  if (client) {
    const strings = collectStrings({ ...entity, provenance: null, source: null });
    for (const marker of PLACEHOLDER_MARKERS) {
      if (strings.some((text) => text.toLowerCase().includes(marker.toLowerCase()))) problems.push(`a client entity contains the placeholder "${marker}" — use null for unknown facts`);
    }
  }
  return { problems, warnings };
}
