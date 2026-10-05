/**
 * Summit Standard Lead Contract v1 (`summit-lead-v1`) — the provider-independent
 * shape every Summit website form submits, and the validation both the browser
 * and the server run.
 *
 *   website form → Summit lead contract → adapter → destination
 *
 * This module is SHARED with the browser (src/lib/leads/client.mjs imports it),
 * so it must never name a destination, an adapter, an environment variable or
 * anything else server-side. Destination configuration lives in
 * destinations.mjs and is validated there.
 *
 * A form is approved in search/site.json, `conversion.forms[]`, with a `lead`
 * block (camelCase, like the rest of site.json):
 *
 *   { "id": "contact", "route": "contact", "mode": "lead-receipt",
 *     "lead": {
 *       "fields": [ { "name": "name", "label": "Name", "required": true }, … ],
 *       "consent": { "id": "contact-consent-v1", "label": "…", "required": true },   optional
 *       "destination": { … }                                                           server-only
 *     } }
 *
 * Standard fields (name, email, phone, service, message) have fixed types and
 * limits. Any other field is an operator-approved extra with an explicit type.
 * Nothing is invented: a form collects exactly the approved fields, and an
 * unknown value stays null.
 *
 * Pure functions only; no Node or browser API beyond the standard library.
 */

export const LEAD_CONTRACT = 'summit-lead-v1';
export const LEAD_ENDPOINT = '/api/lead';
export const HONEYPOT_FIELD = 'hp_website';
export const QA_MARKER_HEADER = 'x-summit-qa-marker';

export const LIMITS = Object.freeze({
  bodyBytes: 16 * 1024,
  minFillMs: 1500,
  attributionLength: 300,
  labelLength: 300,
  fields: 20,
});

const SUBMISSION_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const QA_MARKER_RE = /^[A-Za-z0-9_.:-]{8,128}$/;
const EXTRA_NAME_RE = /^[a-z][a-z0-9_]{1,39}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Standard fields: fixed type, limit and autocomplete. A form may not change them. */
export const STANDARD_FIELDS = Object.freeze({
  name: { type: 'text', maxLength: 120, autocomplete: 'name' },
  email: { type: 'email', maxLength: 254, autocomplete: 'email' },
  phone: { type: 'tel', maxLength: 40, autocomplete: 'tel' },
  service: { type: 'select', maxLength: 120, autocomplete: null },
  message: { type: 'textarea', maxLength: 4000, autocomplete: null },
});
export const EXTRA_FIELD_TYPES = ['text', 'textarea', 'select', 'checkbox'];
const EXTRA_MAX_LENGTH = { text: 200, textarea: 4000, select: 120, checkbox: null };

/** Straightforward attribution only. No first/multi-touch model. */
export const ATTRIBUTION_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'referrer', 'landing_page'];

/** Keys a submission may carry besides the approved fields. */
export const META_FIELDS = ['contract', 'form_id', 'route_id', 'page_path', 'site_env', 'submission_id', 'submitted_at', 'started_at', 'consent', HONEYPOT_FIELD];
const RESERVED_NAMES = new Set([...META_FIELDS, ...ATTRIBUTION_FIELDS, 'fields', 'attribution', 'qa', 'source', 'contact']);

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;

/** Stable JSON: object keys sorted at every depth. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value === undefined ? null : value);
}

/** sha256 hex of a string, with Web Crypto (Node >= 20, browsers, Workers). */
export async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const isSubmissionId = (value) => typeof value === 'string' && SUBMISSION_ID_RE.test(value);
export const isQaMarker = (value) => typeof value === 'string' && QA_MARKER_RE.test(value);

/** The forms in site.json that are Summit lead forms. */
export function leadFormsOf(site) {
  const conversion = isObject(site) && isObject(site.conversion) ? site.conversion : {};
  return (Array.isArray(conversion.forms) ? conversion.forms : []).filter((form) => isObject(form) && isObject(form.lead));
}

export function findLeadForm(site, formId) {
  return leadFormsOf(site).find((form) => form.id === formId) || null;
}

/** Options for a select: a literal list, or `entity:services` (names from business-entity.json). */
function resolveOptions(options, entity) {
  if (options === 'entity:services') return Array.isArray(entity && entity.services) ? entity.services.map((service) => service.name).filter(isText) : [];
  return Array.isArray(options) ? options.filter(isText) : [];
}

/**
 * Problems with one form's `lead` block, excluding the destination (see
 * destinations.mjs). `entity` resolves `entity:services`; a template entity
 * records no services, so the reference is only checked for a client entity.
 */
export function leadFormProblems(form, { entity = null, template = false } = {}) {
  const problems = [];
  const where = `conversion.forms "${isObject(form) ? form.id : '?'}" lead`;
  const lead = isObject(form) ? form.lead : null;
  if (!isObject(lead)) return [`${where} must be { fields, consent?, destination }`];
  for (const key of Object.keys(lead)) if (!['fields', 'consent', 'destination'].includes(key)) problems.push(`${where}: unknown key "${key}"`);
  if (form.mode === 'sandbox-receipt') problems.push(`${where}: a Summit lead form submits to ${LEAD_ENDPOINT}; prove it with mode "lead-receipt", not an external sandbox`);
  const fields = Array.isArray(lead.fields) ? lead.fields : null;
  if (!fields || fields.length === 0) problems.push(`${where}.fields must list the approved fields`);
  else if (fields.length > LIMITS.fields) problems.push(`${where}.fields: at most ${LIMITS.fields} fields`);
  const names = new Set();
  for (const [index, field] of (fields || []).entries()) {
    const at = `${where}.fields[${index}]`;
    if (!isObject(field)) {
      problems.push(`${at} must be an object`);
      continue;
    }
    for (const key of Object.keys(field)) if (!['name', 'label', 'required', 'type', 'maxLength', 'options', 'hint', 'phoneCheck'].includes(key)) problems.push(`${at}: unknown key "${key}"`);
    const standard = STANDARD_FIELDS[field.name];
    if (!standard && !EXTRA_NAME_RE.test(field.name || '')) problems.push(`${at}.name must be a standard field (${Object.keys(STANDARD_FIELDS).join(', ')}) or an extra field name (lower_snake_case)`);
    else if (RESERVED_NAMES.has(field.name)) problems.push(`${at}.name "${field.name}" is reserved by the lead contract`);
    else if (names.has(field.name)) problems.push(`${at}: duplicate field "${field.name}"`);
    names.add(field.name);
    if (!isText(field.label) || field.label.length > LIMITS.labelLength) problems.push(`${at}.label is required (the visible label)`);
    if (field.required !== undefined && typeof field.required !== 'boolean') problems.push(`${at}.required must be true or false`);
    if (field.hint !== undefined && !isText(field.hint)) problems.push(`${at}.hint must be text`);
    const type = standard ? standard.type : field.type;
    if (standard && field.type !== undefined && field.type !== standard.type) problems.push(`${at}: "${field.name}" is a standard ${standard.type} field; its type cannot change`);
    if (!standard && !EXTRA_FIELD_TYPES.includes(field.type)) problems.push(`${at}.type must be one of ${EXTRA_FIELD_TYPES.join(', ')}`);
    if (field.maxLength !== undefined) {
      const ceiling = standard ? standard.maxLength : EXTRA_MAX_LENGTH[field.type];
      if (!Number.isInteger(field.maxLength) || field.maxLength < 1 || ceiling === null || field.maxLength > ceiling) problems.push(`${at}.maxLength must be an integer from 1 to ${ceiling}`);
    }
    if (type === 'select') {
      if (field.options === 'entity:services') {
        if (!template && resolveOptions(field.options, entity).length === 0) problems.push(`${at}.options "entity:services": business-entity.json records no services`);
      } else if (!Array.isArray(field.options) || field.options.length === 0 || field.options.some((option) => !isText(option))) {
        problems.push(`${at}.options must be a list of option labels or "entity:services"`);
      }
    } else if (field.options !== undefined) problems.push(`${at}.options applies only to a select`);
    if (field.phoneCheck !== undefined && (field.name !== 'phone' || typeof field.phoneCheck !== 'boolean')) problems.push(`${at}.phoneCheck applies only to the phone field (true or false)`);
    if (type === 'checkbox' && field.required === true) problems.push(`${at}: a required checkbox is consent; use lead.consent`);
  }
  if (lead.consent !== undefined && lead.consent !== null) {
    const consent = lead.consent;
    if (!isObject(consent)) problems.push(`${where}.consent must be { id, label, required }`);
    else {
      for (const key of Object.keys(consent)) if (!['id', 'label', 'required'].includes(key)) problems.push(`${where}.consent: unknown key "${key}"`);
      if (!SLUG_RE.test(consent.id || '')) problems.push(`${where}.consent.id must be a slug; change it whenever the consent wording changes`);
      if (!isText(consent.label) || consent.label.length > 1000) problems.push(`${where}.consent.label is the exact consent wording shown to the visitor`);
      if (typeof consent.required !== 'boolean') problems.push(`${where}.consent.required must be true or false`);
    }
  }
  if (lead.destination === undefined) problems.push(`${where}.destination is required (the server-side adapter; see destinations)`);
  return problems;
}

/**
 * The browser-safe projection of a lead form: everything the page and its
 * validation need, and nothing about where the lead goes. Swapping the
 * destination never changes this value.
 */
export function publicFormContract(form, { entity = null, routes = [] } = {}) {
  const route = routes.find((entry) => entry.id === form.route) || null;
  return {
    contract: LEAD_CONTRACT,
    form_id: form.id,
    route_id: form.route,
    page_path: route ? route.path : null,
    endpoint: LEAD_ENDPOINT,
    honeypot: HONEYPOT_FIELD,
    min_fill_ms: LIMITS.minFillMs,
    fields: form.lead.fields.map((field) => {
      const standard = STANDARD_FIELDS[field.name];
      const type = standard ? standard.type : field.type;
      return {
        name: field.name,
        type,
        label: field.label,
        hint: field.hint || null,
        required: field.required === true,
        max_length: field.maxLength || (standard ? standard.maxLength : EXTRA_MAX_LENGTH[type]),
        options: type === 'select' ? resolveOptions(field.options, entity) : null,
        phone_check: field.name === 'phone' && field.phoneCheck === true,
        autocomplete: standard ? standard.autocomplete : null,
        standard: Boolean(standard),
      };
    }),
    consent: isObject(form.lead.consent) ? { id: form.lead.consent.id, label: form.lead.consent.label, required: form.lead.consent.required } : null,
  };
}

/**
 * What a site QA config needs to know about a lead form: the contract, the
 * endpoint and the approved field structure. No labels, no options, no
 * destination (a destination change is not material to QA).
 */
export function qaLeadProjection(form, { entity = null, routes = [] } = {}) {
  const contract = publicFormContract(form, { entity, routes });
  return {
    contract: contract.contract,
    endpoint: contract.endpoint,
    fields: contract.fields.map((field) => ({ name: field.name, type: field.type, required: field.required })),
    consent: contract.consent ? { id: contract.consent.id, required: contract.consent.required } : null,
  };
}

/** Basic phone sanity: phone characters only and 7–15 digits. Not a number-plan check. */
export function phoneLooksValid(value) {
  if (!/^[0-9+().\-\s/]+$/.test(value)) return false;
  const digits = value.replace(/[^0-9]/g, '').length;
  return digits >= 7 && digits <= 15;
}

/**
 * Validate approved field values — the SAME function in the browser and on
 * the server. `values` maps field name → raw value. Returns
 * { errors: [{ field, code }], values: { name: normalized } }. Normalisation
 * is trimming only; checkboxes become booleans; empty values become null.
 */
export function validateFields(values, contract) {
  const errors = [];
  const out = {};
  const source = isObject(values) ? values : {};
  for (const field of contract.fields) {
    const raw = source[field.name];
    if (field.type === 'checkbox') {
      if (raw !== undefined && raw !== null && typeof raw !== 'boolean' && !['on', 'true', 'yes', ''].includes(raw)) errors.push({ field: field.name, code: 'invalid_type' });
      out[field.name] = raw === true || ['on', 'true', 'yes'].includes(raw);
      continue;
    }
    if (raw !== undefined && raw !== null && typeof raw !== 'string') {
      errors.push({ field: field.name, code: 'invalid_type' });
      out[field.name] = null;
      continue;
    }
    const value = typeof raw === 'string' ? raw.trim() : '';
    out[field.name] = value === '' ? null : value;
    if (value === '') {
      if (field.required) errors.push({ field: field.name, code: 'required' });
      continue;
    }
    if (value.includes(' ')) errors.push({ field: field.name, code: 'invalid_type' });
    else if (field.max_length && value.length > field.max_length) errors.push({ field: field.name, code: 'too_long' });
    else if (field.type === 'email' && !EMAIL_RE.test(value)) errors.push({ field: field.name, code: 'invalid_email' });
    else if (field.type === 'tel' && field.phone_check && !phoneLooksValid(value)) errors.push({ field: field.name, code: 'invalid_phone' });
    else if (field.type === 'select' && !field.options.includes(value)) errors.push({ field: field.name, code: 'invalid_option' });
  }
  return { errors, values: out };
}

/** An absolute http(s) URL reduced to origin + path (no query, no fragment), or null. */
export function safeReferrer(value) {
  if (!isText(value) || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return `${url.origin}${url.pathname}`.slice(0, LIMITS.attributionLength);
  } catch {
    return null;
  }
}

/**
 * Attribution values: strings, trimmed, bounded. An invalid value becomes null
 * (attribution never blocks a lead); an unknown key is a contract error.
 */
export function normalizeAttribution(input) {
  const errors = [];
  const out = Object.fromEntries(ATTRIBUTION_FIELDS.map((key) => [key, null]));
  if (input === undefined || input === null) return { errors, attribution: out };
  if (!isObject(input)) return { errors: [{ field: 'attribution', code: 'invalid_type' }], attribution: out };
  for (const [key, raw] of Object.entries(input)) {
    if (!ATTRIBUTION_FIELDS.includes(key)) {
      errors.push({ field: `attribution.${key}`, code: 'unknown_field' });
      continue;
    }
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    const value = raw.trim();
    if (key === 'referrer') out.referrer = safeReferrer(value);
    else if (key === 'landing_page') out.landing_page = /^\/[^\s?#]{0,299}$/.test(value) ? value : null;
    else out[key] = value.length <= LIMITS.attributionLength && !value.includes(' ') ? value : null;
  }
  return { errors, attribution: out };
}

/**
 * Split a parsed body into the contract's parts. JSON bodies nest approved
 * values under `fields` and attribution under `attribution`; form-encoded
 * bodies (the no-JavaScript path) are flat. Unknown keys are reported, never
 * silently kept.
 */
export function splitSubmission(body, contract, { encoding }) {
  const errors = [];
  const fieldNames = new Set(contract.fields.map((field) => field.name));
  const meta = {};
  let fields = {};
  let attributionInput = null;
  if (!isObject(body)) return { errors: [{ field: null, code: 'invalid_payload' }], meta, fields, attributionInput };
  if (encoding === 'json') {
    for (const key of Object.keys(body)) {
      if (META_FIELDS.includes(key)) meta[key] = body[key];
      else if (key === 'fields') fields = isObject(body.fields) ? body.fields : null;
      else if (key === 'attribution') attributionInput = body.attribution;
      else errors.push({ field: key, code: 'unknown_field' });
    }
    if (fields === null) {
      errors.push({ field: 'fields', code: 'invalid_type' });
      fields = {};
    }
    for (const key of Object.keys(fields)) if (!fieldNames.has(key)) errors.push({ field: key, code: 'unknown_field' });
  } else {
    const attribution = {};
    for (const [key, value] of Object.entries(body)) {
      if (META_FIELDS.includes(key)) meta[key] = value;
      else if (fieldNames.has(key)) fields[key] = value;
      else if (ATTRIBUTION_FIELDS.includes(key)) attribution[key] = value;
      else errors.push({ field: key, code: 'unknown_field' });
    }
    attributionInput = attribution;
  }
  return { errors, meta, fields, attributionInput };
}

/**
 * The canonical lead (summit-lead-v1). Every key is always present; an unknown
 * value is null. `content` is what identifies the submission for idempotency:
 * the lead minus the server's receive time.
 */
export function buildCanonicalLead({ contract, submissionId, submittedAt, receivedAt, values, consent, attribution, siteOrigin, environment, qaMarker }) {
  const extras = Object.fromEntries(contract.fields.filter((field) => !field.standard).map((field) => [field.name, values[field.name] === undefined ? null : values[field.name]]));
  const lead = {
    contract: LEAD_CONTRACT,
    submission_id: submissionId,
    submitted_at: submittedAt,
    received_at: receivedAt,
    source: { form_id: contract.form_id, route_id: contract.route_id, page_path: contract.page_path, site_origin: siteOrigin },
    contact: { name: values.name ?? null, email: values.email ?? null, phone: values.phone ?? null },
    service: values.service ?? null,
    message: values.message ?? null,
    fields: extras,
    consent,
    attribution,
    environment,
    qa: qaMarker ? { marker: qaMarker } : null,
  };
  return lead;
}

/** The idempotency content of a lead: everything except the server receive time. */
export function leadContent(lead) {
  const { received_at: ignored, ...content } = lead;
  return content;
}
