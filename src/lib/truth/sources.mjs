/**
 * Summit source manifest — truth/sources.json — and source precedence.
 *
 * Pilot 0 (P1-05) searched the project, then the Desktop, then wider home
 * folders, then a connected Drive before it found the business documents. The
 * manifest says, once, where this project's source material lives and how much
 * each source is trusted, so discovery reads exactly those places and nothing
 * else.
 *
 *   {
 *     "schemaVersion": 1,
 *     "status": "template" | "client",
 *     "sources": [{
 *       "id": "summit-business-docs",          stable slug
 *       "type": "local-package",                see SOURCE_TYPES
 *       "ref": "/abs/path" | "folder:<id>" | "https://…" | "facts.md",
 *       "connector": "google-drive",            connected-* only; any connector name
 *       "role": "canonical-business-source",    see SOURCE_ROLES
 *       "precedence": "canonical",              optional; defaults from the role
 *       "contains": ["business-truth", "assets"],
 *       "access": "read-only" | "read-write",
 *       "verified_at": "2026-09-01" | null
 *     }],
 *     "exclusions": ["/abs/path/Archive"],      never read, even inside a source
 *     "research": { "permitted": false }        public research is opt-in
 *   }
 *
 * No credential ever lives here: a connector is named, never authenticated.
 * Pure functions only; discovery takes an injected filesystem.
 */

export const SOURCES_PATH = 'truth/sources.json';
export const SOURCES_SCHEMA_VERSION = 1;
export const SOURCE_TYPES = ['local-package', 'connected-folder', 'connected-document', 'repository-artifact', 'operator-provided', 'public-web'];
export const SOURCE_ROLES = ['canonical-business-source', 'connected-reference', 'repository-truth', 'operator-facts', 'public-research'];
export const SOURCE_CONTENTS = ['business-truth', 'assets', 'research', 'infrastructure-metadata'];
export const SOURCE_ACCESS = ['read-only', 'read-write'];

/**
 * Precedence, highest first. `inference` exists so it can be ranked — and so
 * it can never win: an inferred value is never publishable truth.
 */
export const PRECEDENCE = ['human-confirmed', 'canonical', 'derived', 'public-secondary', 'inference'];
export const ROLE_PRECEDENCE = Object.freeze({
  'operator-facts': 'human-confirmed',
  'canonical-business-source': 'canonical',
  'connected-reference': 'canonical',
  'repository-truth': 'derived',
  'public-research': 'public-secondary',
});
/** Discovery order of the contract (docs/source-truth.md §1). */
const DISCOVERY_ORDER = ['canonical-business-source', 'connected-reference', 'repository-truth', 'operator-facts', 'public-research'];

const READABLE_EXTENSIONS = /\.(md|markdown|txt|pdf|docx?|rtf|json|csv|ya?ml|html?)$/i;
const MAX_DEPTH = 4;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const SECRET_RE = /(sk-[A-Za-z0-9]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-|AKIA[0-9A-Z]{12,}|[?&](token|key|sig|signature|access_token|auth)=|:\/\/[^/@\s]+:[^/@\s]+@|password|secret|bearer\s)/i;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;

export const precedenceOf = (source) => (source && PRECEDENCE.includes(source.precedence) ? source.precedence : ROLE_PRECEDENCE[source && source.role] || 'inference');
export const rankOf = (precedence) => (PRECEDENCE.includes(precedence) ? PRECEDENCE.indexOf(precedence) : PRECEDENCE.length);

/** The manifest a fresh project starts with: its own facts.md, nothing else. */
export function defaultManifest() {
  return {
    schemaVersion: SOURCES_SCHEMA_VERSION,
    status: 'template',
    sources: [{ id: 'repo-facts', type: 'repository-artifact', ref: 'facts.md', role: 'repository-truth', contains: ['business-truth'], access: 'read-write', verified_at: null }],
    exclusions: [],
    research: { permitted: false },
  };
}

/** Shape and safety problems. Returns { problems, warnings }. */
export function manifestProblems(manifest) {
  const problems = [];
  const warnings = [];
  if (!isObject(manifest)) return { problems: ['truth/sources.json must be a JSON object'], warnings };
  for (const key of Object.keys(manifest)) if (!['schemaVersion', 'status', 'sources', 'exclusions', 'research'].includes(key)) problems.push(`unknown key "${key}"`);
  if (manifest.schemaVersion !== SOURCES_SCHEMA_VERSION) problems.push(`schemaVersion must be ${SOURCES_SCHEMA_VERSION}`);
  if (!['template', 'client'].includes(manifest.status)) problems.push('status must be "template" or "client"');
  if (SECRET_RE.test(JSON.stringify(manifest))) problems.push('truth/sources.json contains something credential-shaped; a source is referenced by location, never authenticated here');
  if (!Array.isArray(manifest.sources)) problems.push('sources must be a list');
  const ids = new Set();
  for (const [index, source] of (Array.isArray(manifest.sources) ? manifest.sources : []).entries()) {
    const where = `sources[${index}]${source && source.id ? ` (${source.id})` : ''}`;
    if (!isObject(source)) {
      problems.push(`${where} must be an object`);
      continue;
    }
    for (const key of Object.keys(source)) if (!['id', 'type', 'ref', 'connector', 'role', 'precedence', 'contains', 'access', 'verified_at', 'notes'].includes(key)) problems.push(`${where}: unknown key "${key}"`);
    if (!SLUG_RE.test(source.id || '')) problems.push(`${where}.id must be a slug`);
    else if (ids.has(source.id)) problems.push(`${where}: duplicate id`);
    ids.add(source.id);
    if (!SOURCE_TYPES.includes(source.type)) problems.push(`${where}.type must be one of ${SOURCE_TYPES.join(', ')}`);
    if (!SOURCE_ROLES.includes(source.role)) problems.push(`${where}.role must be one of ${SOURCE_ROLES.join(', ')}`);
    if (source.precedence !== undefined && !PRECEDENCE.slice(0, -1).includes(source.precedence)) problems.push(`${where}.precedence must be one of ${PRECEDENCE.slice(0, -1).join(', ')} (inference is never a source's precedence)`);
    if (source.role === 'public-research' && source.precedence !== undefined && rankOf(source.precedence) < rankOf('public-secondary')) problems.push(`${where}: public research can never outrank business sources`);
    if (!Array.isArray(source.contains) || source.contains.length === 0 || source.contains.some((item) => !SOURCE_CONTENTS.includes(item))) problems.push(`${where}.contains must list ${SOURCE_CONTENTS.join(', ')}`);
    else if (source.role === 'public-research' && source.contains.includes('business-truth')) problems.push(`${where}: research is not business truth — a public-research source may contain research or assets only`);
    if (!SOURCE_ACCESS.includes(source.access)) problems.push(`${where}.access must be read-only or read-write`);
    if (source.verified_at !== undefined && source.verified_at !== null && !/^\d{4}-\d{2}-\d{2}/.test(source.verified_at)) problems.push(`${where}.verified_at must be an ISO date or null`);
    if (source.type !== 'operator-provided' && !isText(source.ref)) problems.push(`${where}.ref is required`);
    if (source.type === 'repository-artifact' && isText(source.ref) && (source.ref.startsWith('/') || source.ref.includes('..'))) problems.push(`${where}.ref must be a path inside the repository`);
    if (source.type === 'local-package' && isText(source.ref) && (!source.ref.startsWith('/') || source.ref.split('/').includes('..') || source.ref === '/')) problems.push(`${where}.ref must be an absolute path to the package folder (not the filesystem root)`);
    const type = String(source.type || '');
    if (type.startsWith('connected-') && !isText(source.connector)) problems.push(`${where}: a connected source names its connector`);
    if (!type.startsWith('connected-') && source.connector !== undefined) problems.push(`${where}.connector is only for connected sources`);
    if (source.type === 'public-web' && !/^https:\/\//.test(source.ref || '')) problems.push(`${where}.ref must be an https URL`);
  }
  if (manifest.exclusions !== undefined && (!Array.isArray(manifest.exclusions) || manifest.exclusions.some((item) => !isText(item)))) problems.push('exclusions must be a list of references');
  if (manifest.research !== undefined && (!isObject(manifest.research) || typeof manifest.research.permitted !== 'boolean')) problems.push('research must be { permitted: true | false }');
  const sources = Array.isArray(manifest.sources) ? manifest.sources : [];
  if (manifest.status === 'client' && !sources.some((source) => ['canonical-business-source', 'connected-reference'].includes(source.role))) {
    warnings.push('no canonical business source is recorded: truth can only come from facts.md and the operator');
  }
  if (sources.some((source) => source.role === 'public-research') && !(manifest.research && manifest.research.permitted)) {
    warnings.push('a public-research source is listed but research.permitted is false, so it is never read');
  }
  return { problems, warnings };
}

const underExcluded = (target, exclusions) => exclusions.some((excluded) => target === excluded || target.startsWith(`${excluded.replace(/\/+$/, '')}/`));

/**
 * The deterministic reading plan. Only the manifest's own locations are
 * touched: a local package is listed from its root down (bounded depth), and
 * nothing above or beside it is ever read. `fsImpl` is { readdirSync, statSync }.
 *
 * Returns { plan: [{ id, type, role, precedence, action, files?, ref, connector? }], problems }.
 */
export function discoverSources(manifest, { fsImpl, join = (a, b) => `${a.replace(/\/+$/, '')}/${b}` } = {}) {
  const problems = [];
  const plan = [];
  const exclusions = (manifest && Array.isArray(manifest.exclusions) ? manifest.exclusions : []).map((item) => item.replace(/\/+$/, ''));
  const research = Boolean(manifest && manifest.research && manifest.research.permitted);
  const ordered = (manifest && Array.isArray(manifest.sources) ? manifest.sources : [])
    .map((source, index) => ({ source, index }))
    .sort((a, b) => DISCOVERY_ORDER.indexOf(a.source.role) - DISCOVERY_ORDER.indexOf(b.source.role) || a.index - b.index)
    .map((entry) => entry.source);
  for (const source of ordered) {
    const base = { id: source.id, type: source.type, role: source.role, precedence: precedenceOf(source), ref: source.ref || null };
    if (source.role === 'public-research' && !research) continue;
    if (isText(source.ref) && underExcluded(source.ref, exclusions)) continue;
    if (source.type === 'local-package') {
      const files = [];
      const walk = (dir, depth) => {
        let entries;
        try {
          entries = fsImpl.readdirSync(dir).slice().sort();
        } catch {
          problems.push(`source "${source.id}": ${dir} cannot be read`);
          return;
        }
        for (const name of entries) {
          if (name.startsWith('.')) continue;
          const full = join(dir, name);
          if (underExcluded(full, exclusions)) continue;
          let stat;
          try {
            stat = fsImpl.statSync(full);
          } catch {
            continue;
          }
          if (stat.isDirectory()) {
            if (depth < MAX_DEPTH) walk(full, depth + 1);
          } else if (READABLE_EXTENSIONS.test(name)) files.push(full);
        }
      };
      walk(source.ref, 0);
      plan.push({ ...base, action: 'read-files', files });
    } else if (source.type.startsWith('connected-')) {
      plan.push({ ...base, action: 'read-connector', connector: source.connector });
    } else if (source.type === 'repository-artifact') {
      plan.push({ ...base, action: 'read-repo' });
    } else if (source.type === 'public-web') {
      plan.push({ ...base, action: 'read-web' });
    } else {
      plan.push({ ...base, action: 'none' });
    }
  }
  return { plan, problems };
}

// ------------------------------------------------------------ precedence

const norm = (value) => String(value ?? '').toLowerCase().replace(/&amp;/g, '&').replace(/[^a-z0-9&+]+/g, ' ').trim();

/**
 * Decide one fact from candidate values.
 *
 * candidate: { value, source_id, role, precedence?, method: exact|normalized|interpreted, location?, at?, by? }
 *
 *   research candidates count only when research is permitted, and then never
 *     as confirmed truth
 *   interpreted candidates never decide a fact (they become questions)
 *   the highest-precedence non-empty class decides; within it, one normalized
 *     value is a decision and two are a CONFLICT — never a guess
 *   lower-precedence values that differ are kept as `overridden`, with provenance
 *
 * Returns { field, status: resolved|conflict|unconfirmed|unresolved, value,
 *           winner, overridden, interpretations, question }.
 */
export function resolveFact(field, candidates, { researchPermitted = false, label = field } = {}) {
  const usable = [];
  const interpretations = [];
  for (const candidate of candidates || []) {
    if (!candidate || !isText(String(candidate.value ?? ''))) continue;
    const precedence = candidate.precedence || ROLE_PRECEDENCE[candidate.role] || 'inference';
    if (candidate.role === 'public-research' && !researchPermitted) continue;
    if (candidate.method === 'interpreted' || precedence === 'inference') {
      interpretations.push(candidate);
      continue;
    }
    usable.push({ ...candidate, precedence });
  }
  const result = { field, status: 'unresolved', value: null, winner: null, overridden: [], interpretations, question: null };
  if (usable.length === 0) {
    result.question = factQuestion({ label, why: interpretations.length ? 'The source material only implies this; it does not state it.' : 'No approved source records it.', options: [] });
    return result;
  }
  const best = Math.min(...usable.map((candidate) => rankOf(candidate.precedence)));
  const top = usable.filter((candidate) => rankOf(candidate.precedence) === best);
  const values = [...new Map(top.map((candidate) => [norm(candidate.value), candidate])).values()];
  if (values.length > 1) {
    result.status = 'conflict';
    result.question = factQuestion({
      label,
      why: 'Two approved sources disagree.',
      sources: values.map((candidate, index) => ({ name: `Source ${String.fromCharCode(65 + index)}`, source_id: candidate.source_id, value: String(candidate.value) })),
      options: values.map((candidate) => String(candidate.value)),
    });
    return result;
  }
  const winner = values[0];
  result.value = String(winner.value).trim();
  result.winner = winner;
  result.overridden = usable.filter((candidate) => rankOf(candidate.precedence) > best && norm(candidate.value) !== norm(winner.value));
  if (PRECEDENCE[best] === 'public-secondary') {
    result.status = 'unconfirmed';
    result.question = factQuestion({ label, why: 'Only public research mentions this; it is not confirmed by the business.', options: [result.value] });
    return result;
  }
  result.status = 'resolved';
  return result;
}

/** One direct FACT NEEDED question (docs/operator-contract.md §5b). */
export function factQuestion({ label, why, sources = [], options = [] }) {
  return {
    type: 'FACT NEEDED',
    what: sources.length > 1 ? `Two approved sources disagree about ${label}.` : `What is the correct ${label}?`,
    why,
    sources: sources.map(({ name, value }) => ({ name, value })),
    reply_with: [...options, 'Other: <correct value>'],
    after: 'I will update the truth record and continue.',
  };
}

// ------------------------------------------------------------ provenance

export const PROVENANCE_PATH = 'truth/provenance.json';
export const EXTRACTION_METHODS = ['exact', 'normalized', 'interpreted', 'operator'];
const ITEM_RE = /^(fact|service|commitment|note|prohibited|geography):.+/;

/**
 * truth/provenance.json — where each recorded fact came from.
 *
 *   { "schemaVersion": 1, "items": [{
 *       "item": "fact:Primary phone" | "service:<name>" | "commitment:<id>" | …,
 *       "value": "<normalized value as recorded>",
 *       "source_id": "<a manifest source id>" | "operator",
 *       "location": "<file, section or page>" | null,
 *       "method": "exact" | "normalized" | "interpreted" | "operator",
 *       "recorded_at": "<ISO time>",
 *       "extractor": "<role and contract version>" | null,
 *       "confirmed_by": "<person>" | null,
 *       "supersedes": [ { value, source_id, method, recorded_at } ]
 *   }] }
 *
 * No document content beyond the value, and never a credential.
 */
export function provenanceProblems(provenance, { manifest = null } = {}) {
  const problems = [];
  if (!isObject(provenance)) return ['truth/provenance.json must be a JSON object'];
  if (provenance.schemaVersion !== 1) problems.push('provenance schemaVersion must be 1');
  if (!Array.isArray(provenance.items)) return [...problems, 'provenance items must be a list'];
  if (SECRET_RE.test(JSON.stringify(provenance))) problems.push('truth/provenance.json contains something credential-shaped');
  const ids = new Set((manifest && Array.isArray(manifest.sources) ? manifest.sources : []).map((source) => source.id));
  for (const [index, entry] of provenance.items.entries()) {
    const where = `provenance.items[${index}]`;
    if (!isObject(entry)) {
      problems.push(`${where} must be an object`);
      continue;
    }
    if (!ITEM_RE.test(entry.item || '')) problems.push(`${where}.item must be fact:|service:|commitment:|note:|prohibited:|geography: followed by its name`);
    if (!EXTRACTION_METHODS.includes(entry.method)) problems.push(`${where}.method must be one of ${EXTRACTION_METHODS.join(', ')}`);
    if (entry.method === 'operator' ? !isText(entry.confirmed_by) : !isText(entry.source_id)) problems.push(`${where}: ${entry.method === 'operator' ? 'an operator-supplied fact names who confirmed it' : 'an extracted fact names its source'}`);
    if (entry.method !== 'operator' && manifest && isText(entry.source_id) && !ids.has(entry.source_id)) problems.push(`${where}.source_id "${entry.source_id}" is not a source in truth/sources.json`);
    if (typeof entry.value === 'string' && entry.value.length > 600) problems.push(`${where}.value is a document excerpt, not a value (keep provenance small)`);
  }
  return problems;
}
