/**
 * Summit facts contract v2 — facts.md, the human-readable source of truth.
 *
 * v2 keeps facts.md a readable Markdown file and adds what Pilot 0 lacked:
 *
 *   ## Geography                operating base, public customer-facing address,
 *                               service geography, exclusions, delivery model and
 *                               local presence — four different facts, never
 *                               inferred from one another (P1-06)
 *   ## Publishable commitments  promises, policies, offer terms and guarantees,
 *                               each with visibility, source, support and status (P0-09)
 *   ## Prohibited claims        what the site must never say
 *   ## Internal-only notes      strategy and research that must never be published
 *
 * A v1 file (the shared seed template's shape) is still read, through label
 * aliases, and migrates deterministically (`migrateFacts`) without inventing
 * anything. `projectTruth` turns either into the machine-readable
 * truth/truth.json, whose freshness the build checks.
 *
 * Dependency-free ESM; pure functions only.
 */

export const FACTS_CONTRACT_VERSION = 2;
export const FACTS_CONTRACT_MARKER = `<!-- summit-facts-contract: ${FACTS_CONTRACT_VERSION} -->`;
export const TRUTH_PROJECTION_PATH = 'truth/truth.json';
export const TRUTH_PROJECTION_VERSION = 1;

/**
 * The site's own web address (its origin). Pilot 1A: it had no home in facts.md,
 * so a missing address surfaced only after the first deploy. "None yet" is a
 * valid, visible answer.
 */
export const WEBSITE_LABEL = 'Website';

/**
 * Who the business is, by NAME AND ROLE ONLY.
 *
 * Same history as WEBSITE_LABEL, found the same way. A med spa's provider is the
 * most valuable content on its site — Summit's own review analysis found about
 * half of 131 competitor reviews naming an individual injector, with expertise
 * and comfort the dominant satisfaction drivers — and facts.md had nowhere to
 * record a person. The source worker correctly refused to invent a field, so the
 * highest-value fact in the package arrived as an open question instead of truth,
 * and the page that mattered most could not be written from the truth record.
 *
 * A name and a role are ordinary business facts. A credential, licence number,
 * scope of practice or supervision arrangement is a regulated CLAIM: it stays in
 * `Credentials and claims`, under the confirmation that section already demands.
 * Keeping the two apart is the purpose of this field, not an omission in it.
 */
export const PEOPLE_LABELS = Object.freeze({
  owners: 'Owners / principals',
  practitioners: 'Named practitioners',
  responsible: 'Supervising / responsible professional',
});

export const PEOPLE_SECTION = [
  '## People',
  '',
  'Names and roles only, as the client stated them. A credential, licence, scope',
  'of practice or supervision arrangement is a regulated claim and belongs in',
  '`Credentials and claims`, never here.',
  '',
  `- ${PEOPLE_LABELS.owners}: \`[UNKNOWN]\``,
  `- ${PEOPLE_LABELS.practitioners}: \`[UNKNOWN]\``,
  `- ${PEOPLE_LABELS.responsible}: \`[UNKNOWN]\``,
  '',
];

export const DELIVERY_MODELS = ['storefront', 'customer-location', 'mobile-service', 'remote', 'hybrid'];
export const COMMITMENT_KINDS = ['commitment', 'policy', 'offer', 'guarantee'];
export const VISIBILITIES = ['public', 'public-constrained', 'evidence-only', 'internal-only'];
export const PUBLIC_VISIBILITIES = ['public', 'public-constrained'];
export const SUPPORT_LEVELS = ['exact', 'normalized', 'interpreted'];
export const COMMITMENT_STATUSES = ['confirmed', 'conflicting', 'missing', 'deprecated'];

/** v2 geography labels, and the v1 labels a v1 file used for the same fact. */
export const GEOGRAPHY_LABELS = Object.freeze({
  operatingBase: 'Operating base',
  publicAddress: 'Public customer-facing address',
  serviceGeography: 'Service geography',
  excludedAreas: 'Areas explicitly not served',
  deliveryModel: 'Delivery model',
  localPresence: 'Local presence / Google Business Profile',
});

/**
 * v1 → v2 label mapping. `null` means the v1 label has no single v2 meaning
 * (it conflated two facts) and must be answered, never mapped.
 */
export const V1_LABELS = Object.freeze({
  'areas served': 'service geography',
  'physical address': null,
  'primary location(s)': null,
});

const UNKNOWN_RE = /^\s*(\[[^\]]*\]|n\/a|unknown|tbd|-)?\s*$/i;
const NONE_RE = /^\s*(none|no|no public (customer-facing )?address|not public)\.?\s*$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

const labelKey = (label) => String(label).replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const isText = (value) => typeof value === 'string' && value.trim().length > 0;

/** A value with template noise removed, or null when it records nothing. */
export function cleanValue(raw) {
  const text = String(raw ?? '').replace(/`/g, '').trim();
  return UNKNOWN_RE.test(text) || /^\[(UNKNOWN|PLACEHOLDER|TODO|FILL|NEEDS FACT|none recorded)/i.test(text) ? null : text;
}

const splitList = (value) => (value ? value.split(/[;,]|\n/).map((item) => item.trim()).filter(Boolean) : []);

function sectionsOf(text) {
  const sections = [];
  let current = { title: '', lines: [] };
  for (const line of String(text).split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      sections.push(current);
      current = { title: heading[1], lines: [] };
    } else current.lines.push(line);
  }
  sections.push(current);
  return sections;
}

/** Rows of the first Markdown table in a section, keyed by lower-case header. Template rows are dropped. */
function tableRows(section) {
  if (!section) return [];
  const rows = section.lines.filter((line) => /^\s*\|/.test(line)).map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
  if (rows.length < 2) return [];
  const header = rows[0].map((cell) => labelKey(cell));
  return rows.slice(2)
    .map((cells) => Object.fromEntries(header.map((key, index) => [key, cleanValue(cells[index])])))
    .filter((row) => Object.values(row).some((value) => value !== null));
}

export const contractVersionOf = (text) => (String(text ?? '').includes(FACTS_CONTRACT_MARKER) ? 2 : 1);

/**
 * Parse facts.md (v1 or v2).
 *
 * Returns { contract, isTemplate, text, value(label), services, serviceRows,
 * geography, commitments, internalNotes, prohibitedClaims, openQuestions }.
 * `value(label)` answers v2 labels on a v1 file (and v1 labels on a v2 file)
 * through V1_LABELS; a label with no single meaning answers null.
 */
export function parseTruth(markdown) {
  const text = String(markdown ?? '');
  const contract = contractVersionOf(text);
  const sections = sectionsOf(text);
  const values = new Map();
  for (const section of sections) {
    for (const line of section.lines) {
      const bullet = /^\s*[-*]\s+([^:|]+?):\s*(.*)$/.exec(line);
      if (bullet && !values.has(labelKey(bullet[1]))) values.set(labelKey(bullet[1]), cleanValue(bullet[2]));
    }
  }
  const raw = (key) => (values.has(key) ? values.get(key) : null);
  const value = (label) => {
    const key = labelKey(label);
    if (values.has(key)) return values.get(key);
    if (contract === 2 && key in V1_LABELS) return V1_LABELS[key] ? raw(V1_LABELS[key]) : null;
    if (contract === 1) {
      const v1 = Object.entries(V1_LABELS).find(([, v2]) => v2 === key);
      if (v1) return raw(v1[0]);
      if (key === 'operating base' || key === 'public customer-facing address' || key === 'delivery model' || key === 'local presence / google business profile') return null;
    }
    return null;
  };
  const section = (pattern) => sections.find((entry) => pattern.test(entry.title.trim()));

  const serviceRows = tableRows(section(/^services$/i)).filter((row) => row.service).map((row) => ({ name: row.service, description: row.description ?? null, included: row.included ?? null, excluded: row['not included'] ?? null }));

  const publicRaw = value(GEOGRAPHY_LABELS.publicAddress);
  const publicAddress = publicRaw === null
    ? { state: 'unknown', value: null }
    : NONE_RE.test(publicRaw) ? { state: 'none', value: null } : { state: 'address', value: publicRaw };
  const delivery = value(GEOGRAPHY_LABELS.deliveryModel);
  const geography = {
    operatingBase: value(GEOGRAPHY_LABELS.operatingBase),
    publicAddress,
    serviceGeography: splitList(value(GEOGRAPHY_LABELS.serviceGeography)),
    excludedAreas: splitList(value(GEOGRAPHY_LABELS.excludedAreas)),
    deliveryModel: delivery ? delivery.toLowerCase().replace(/\s+/g, '-') : null,
    localPresence: value(GEOGRAPHY_LABELS.localPresence),
    // v1 only: what the two conflated labels said, so migration can ask about them.
    legacy: contract === 1 ? { physicalAddress: raw('physical address'), primaryLocations: raw('primary location(s)') } : null,
  };

  const commitments = tableRows(section(/^publishable commitments$/i)).map((row) => ({
    id: row.id,
    kind: row.kind ? row.kind.toLowerCase() : null,
    statement: row.commitment,
    visibility: row.visibility ? row.visibility.toLowerCase() : null,
    wording: row.wording,
    source: row.source,
    support: row.support ? row.support.toLowerCase() : null,
    status: row.status ? row.status.toLowerCase() : null,
  }));
  const internalNotes = tableRows(section(/^internal-only notes$/i)).map((row) => ({ id: row.id, note: row.note, source: row.source }));
  const bullets = (entry) => (entry ? entry.lines.map((line) => /^\s*[-*]\s+(.*)$/.exec(line)).filter(Boolean).map((match) => cleanValue(match[1])).filter(Boolean) : []);

  return {
    contract,
    isTemplate: /^#\s*\[TEMPLATE\]/m.test(text),
    text,
    value,
    services: serviceRows.map((row) => row.name),
    serviceRows,
    geography,
    commitments,
    internalNotes,
    prohibitedClaims: bullets(section(/^prohibited claims$/i)),
    openQuestions: bullets(section(/^open questions$/i)),
  };
}

// ------------------------------------------------------------ validation

/**
 * Structural problems of a parsed facts.md. Pure.
 * Returns { problems, warnings }. A v1 file gets one warning (migrate it).
 */
export function truthProblems(truth) {
  const problems = [];
  const warnings = [];
  if (truth.contract !== FACTS_CONTRACT_VERSION) warnings.push(`facts.md is contract v${truth.contract}; migrate it to v${FACTS_CONTRACT_VERSION} (Summit does this deterministically, adding no facts)`);
  const geo = truth.geography;
  if (geo.deliveryModel && !DELIVERY_MODELS.includes(geo.deliveryModel)) problems.push(`Delivery model "${geo.deliveryModel}" must be one of ${DELIVERY_MODELS.join(', ')}`);
  if (['storefront', 'hybrid'].includes(geo.deliveryModel) && geo.publicAddress.state === 'none') {
    problems.push(`Delivery model is "${geo.deliveryModel}" (customers visit) but the public customer-facing address is "None" — these contradict`);
  }
  if (geo.deliveryModel === 'remote' && geo.publicAddress.state === 'address') warnings.push('Delivery model is "remote" but a public customer-facing address is recorded; confirm customers really visit it');
  for (const area of geo.serviceGeography) {
    if (geo.excludedAreas.some((excluded) => excluded.toLowerCase() === area.toLowerCase())) problems.push(`"${area}" is listed both as service geography and as an area explicitly not served`);
  }

  const ids = new Set();
  const claimId = (id, where) => {
    if (!SLUG_RE.test(id || '')) problems.push(`${where}: ID must be a slug (got ${JSON.stringify(id)})`);
    else if (ids.has(id)) problems.push(`${where}: duplicate ID "${id}"`);
    ids.add(id);
  };
  for (const [index, item] of truth.commitments.entries()) {
    const where = `Publishable commitments row ${index + 1}${item.id ? ` (${item.id})` : ''}`;
    claimId(item.id, where);
    if (!COMMITMENT_KINDS.includes(item.kind)) problems.push(`${where}: Kind must be one of ${COMMITMENT_KINDS.join(', ')}`);
    if (!isText(item.statement)) problems.push(`${where}: Commitment is required`);
    if (!VISIBILITIES.includes(item.visibility)) problems.push(`${where}: Visibility must be one of ${VISIBILITIES.join(', ')}`);
    if (!SUPPORT_LEVELS.includes(item.support)) problems.push(`${where}: Support must be one of ${SUPPORT_LEVELS.join(', ')}`);
    if (!COMMITMENT_STATUSES.includes(item.status)) problems.push(`${where}: Status must be one of ${COMMITMENT_STATUSES.join(', ')}`);
    if (item.status === 'confirmed' && !isText(item.source)) problems.push(`${where}: a confirmed commitment names its source`);
    if (item.status === 'confirmed' && item.support === 'interpreted') problems.push(`${where}: an interpreted implication is never a confirmed commitment — record it as an open question until a person confirms the wording`);
    if (item.visibility === 'public-constrained' && !isText(item.wording)) problems.push(`${where}: public-constrained needs the exact permitted Wording`);
  }
  for (const [index, note] of truth.internalNotes.entries()) {
    const where = `Internal-only notes row ${index + 1}${note.id ? ` (${note.id})` : ''}`;
    claimId(note.id, where);
    if (!isText(note.note)) problems.push(`${where}: Note is required`);
  }
  for (const item of truth.commitments.filter((entry) => entry.status === 'conflicting')) {
    warnings.push(`commitment "${item.id}" is conflicting: it cannot be published until a person resolves it`);
  }
  return { problems, warnings };
}

/** Commitments that may appear on the public site. */
export const publicCommitments = (truth) => truth.commitments.filter((item) => item.status === 'confirmed' && PUBLIC_VISIBILITIES.includes(item.visibility) && item.support !== 'interpreted');

/** Statements that must never appear in public copy: internal notes and every non-publishable commitment. */
export function nonPublicStatements(truth) {
  const published = new Set(publicCommitments(truth).map((item) => item.id));
  return [
    ...truth.internalNotes.filter((note) => isText(note.note)).map((note) => ({ id: note.id, text: note.note, reason: 'internal-only note' })),
    ...truth.commitments.filter((item) => !published.has(item.id) && isText(item.statement)).map((item) => ({ id: item.id, text: item.statement, reason: `${item.visibility || 'unknown visibility'}, ${item.status || 'unknown status'}` })),
  ];
}

// ------------------------------------------------------------ projection

const DELIVERY_TO_BUSINESS_MODEL = { storefront: 'storefront', hybrid: 'hybrid', 'customer-location': 'service_area', 'mobile-service': 'service_area', remote: 'service_area' };

/** The entity business model a delivery model implies, or null when unknown. */
export const businessModelFor = (deliveryModel) => DELIVERY_TO_BUSINESS_MODEL[deliveryModel] || null;

/**
 * truth/truth.json: the deterministic, machine-readable projection of facts.md.
 * Same input → byte-identical output. Unknown stays null.
 */
export function projectTruth(markdown, { factsSha256 = null } = {}) {
  const truth = parseTruth(markdown);
  const v = (label) => truth.value(label);
  const geo = truth.geography;
  return {
    schemaVersion: TRUTH_PROJECTION_VERSION,
    factsContract: truth.contract,
    status: truth.isTemplate ? 'template' : 'client',
    source: { facts: 'facts.md', factsSha256 },
    identity: { legalName: v('Legal name'), displayName: v('Trading / display name'), tagline: v('Tagline'), description: v('One-line description'), website: websiteOrigin(v(WEBSITE_LABEL)) },
    contact: { primaryPhone: v('Primary phone'), primaryEmail: v('Primary email'), mailingAddress: v('Mailing address (if different)'), hours: v('Hours of operation'), preferredContact: v('Preferred contact method') },
    geography: {
      operatingBase: geo.operatingBase,
      publicAddress: geo.publicAddress,
      serviceGeography: geo.serviceGeography,
      excludedAreas: geo.excludedAreas,
      deliveryModel: geo.deliveryModel,
      localPresence: geo.localPresence,
    },
    services: truth.serviceRows,
    commitments: truth.commitments,
    prohibitedClaims: truth.prohibitedClaims,
    internalNotes: truth.internalNotes,
    claims: {
      yearsInBusiness: v('Years in business'),
      licenses: v('Licenses'),
      insurance: v('Insurance'),
      certifications: v('Certifications'),
      affiliations: v('Affiliations / memberships'),
      awards: v('Awards'),
      guarantees: v('Guarantees / warranties'),
      pricingModel: v('Pricing model'),
      publishablePrices: v('Publishable prices'),
      nonPublishablePrices: v('Explicitly non-publishable'),
      testimonials: v('Supplied testimonials'),
      reviewLinks: v('Review platform links'),
      ratings: v('Ratings/counts authorized for display'),
    },
    openQuestions: truth.openQuestions,
  };
}

/** Canonical JSON text of a projection: the exact bytes truth/truth.json must hold. */
export const truthJsonText = (projection) => `${JSON.stringify(projection, null, 2)}\n`;

/** The origin a Website value names (https://example.com/), or null. */
export function websiteOrigin(value) {
  const match = /https?:\/\/[^\s)>\]"'`]+/.exec(String(value ?? ''));
  if (!match) return null;
  try {
    return `${new URL(match[0]).origin}/`;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ migration

const bulletLine = (label, value) => `- ${label}: ${value === null || value === undefined ? '`[UNKNOWN]`' : value}`;

export const GEOGRAPHY_SECTION_INTRO = [
  'Separate facts. Never infer one from another: an operating base is not a',
  'service area, a remote business can still have an operating base, and having',
  'no public address does not mean having no local presence. Public',
  'customer-facing address is an address or `None`. Delivery model is one of',
  '`storefront`, `customer-location`, `mobile-service`, `remote` or `hybrid`.',
];

export const COMMITMENTS_SECTION = [
  '## Publishable commitments',
  '',
  'Promises, policies, offer terms and guarantees the business makes, recorded',
  'only as the source supports them. Kind: `commitment`, `policy`, `offer` or',
  '`guarantee`. Visibility: `public`, `public-constrained` (only in the stated',
  'Wording), `evidence-only` (supports a claim, never quoted) or `internal-only`.',
  'Support: `exact` (the source says it), `normalized` (the source says it in',
  'other words) or `interpreted` (an implication — never confirmed until a person',
  'confirms the wording). Status: `confirmed`, `conflicting`, `missing` or',
  '`deprecated`. Only confirmed public commitments may appear on the site.',
  '',
  '| ID | Kind | Commitment | Visibility | Wording | Source | Support | Status |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  '| `[UNKNOWN]` | `[UNKNOWN]` | `[UNKNOWN]` | `[UNKNOWN]` | `[UNKNOWN]` | `[UNKNOWN]` | `[UNKNOWN]` | `[UNKNOWN]` |',
  '',
];

export const PROHIBITED_SECTION = [
  '## Prohibited claims',
  '',
  'Claims the site must never make, even when they would sound harmless.',
  '',
  '- `[none recorded yet]`',
  '',
];

export const INTERNAL_SECTION = [
  '## Internal-only notes',
  '',
  'Strategy, future pricing, capacity plans, research and internal mechanics',
  'found in the source material. Recorded so they are never mistaken for public',
  'truth. Never published.',
  '',
  '| ID | Note | Source |',
  '| --- | --- | --- |',
  '| `[none recorded yet]` | | |',
  '',
];

const PUBLIC_FROM_ENTITY = (entity, physical) => {
  if (!entity || typeof entity !== 'object' || !entity.address || typeof entity.address.public !== 'boolean') return null;
  if (entity.address.public === false) return 'None';
  return physical || null;
};

/**
 * Migrate a v1 facts.md to v2. Deterministic, and it invents nothing:
 *
 *   Areas served                → Service geography (same fact, new label)
 *   Areas explicitly not served → unchanged
 *   Physical address            → Operating base (where the business is)
 *   Public customer-facing address ← only the entity's already-approved
 *                                  address.public decision; otherwise unknown
 *   Delivery model               ← only an entity businessModel of storefront or
 *                                  hybrid; otherwise unknown
 *   Local presence               → unknown
 *   Primary location(s)         → an open question (it named either the base or
 *                                  the service area; v1 did not say which)
 *   Publishable commitments, Prohibited claims, Internal-only notes → empty
 *                                  sections: commitments are added only through
 *                                  extraction and reconciliation, never here
 *
 * Returns { text, report: { from, to, changed, carried, unresolved, added_sections } }.
 * A v2 file is returned unchanged.
 */
export function migrateFacts(markdown, { entity = null, date = null, by = 'Summit migration (no facts added)' } = {}) {
  const text = String(markdown ?? '');
  const report = { from: contractVersionOf(text), to: FACTS_CONTRACT_VERSION, changed: false, carried: [], unresolved: [], added_sections: [] };
  if (report.from === FACTS_CONTRACT_VERSION) return { text, report };
  const parsed = parseTruth(text);
  const legacy = parsed.geography.legacy;
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  const sectionEnd = (from) => {
    let end = from + 1;
    while (end < lines.length && !/^##\s/.test(lines[end])) end += 1;
    return end;
  };
  let wroteMarker = false;
  while (i < lines.length) {
    const line = lines[i];
    if (!wroteMarker && /^#\s/.test(line)) {
      out.push(line, '', FACTS_CONTRACT_MARKER);
      wroteMarker = true;
      i += 1;
      continue;
    }
    if (/^\s*[-*]\s+One-line description:/.test(line) && !parsed.value('Website')) {
      out.push(line, bulletLine(WEBSITE_LABEL, null));
      i += 1;
      continue;
    }
    if (/^##\s+Contact\s*$/.test(line)) {
      const end = sectionEnd(i);
      for (const entry of lines.slice(i, end)) if (!/^\s*[-*]\s+Physical address:/i.test(entry)) out.push(entry);
      i = end;
      continue;
    }
    if (/^##\s+Service area\s*$/i.test(line)) {
      const end = sectionEnd(i);
      const publicValue = PUBLIC_FROM_ENTITY(entity, legacy.physicalAddress);
      // Only an unambiguous, already-approved business model carries over:
      // "service_area" could be customer-location, mobile-service or remote.
      const deliveryFromEntity = entity && ['storefront', 'hybrid'].includes(entity.businessModel) ? entity.businessModel : null;
      if (deliveryFromEntity) report.carried.push(`Delivery model from the approved business entity (businessModel ${entity.businessModel})`);
      if (legacy.physicalAddress) report.carried.push('Physical address → Operating base');
      if (parsed.value('Service geography')) report.carried.push('Areas served → Service geography');
      if (publicValue !== null) report.carried.push(`Public customer-facing address from the approved business entity (address.public ${entity.address.public})`);
      out.push(
        '## Geography',
        '',
        ...GEOGRAPHY_SECTION_INTRO,
        '',
        bulletLine(GEOGRAPHY_LABELS.operatingBase, legacy.physicalAddress),
        bulletLine(GEOGRAPHY_LABELS.publicAddress, publicValue),
        bulletLine(GEOGRAPHY_LABELS.serviceGeography, parsed.value('Service geography')),
        bulletLine('Areas explicitly **not** served', parsed.value('Areas explicitly not served')),
        bulletLine(GEOGRAPHY_LABELS.deliveryModel, deliveryFromEntity),
        bulletLine(GEOGRAPHY_LABELS.localPresence, null),
        '',
      );
      if (legacy.primaryLocations) report.unresolved.push(`"Primary location(s)" was "${legacy.primaryLocations}": is that the operating base, the service geography, or both?`);
      i = end;
      continue;
    }
    if (/^##\s+Credentials and claims\s*$/i.test(line)) {
      out.push(...COMMITMENTS_SECTION, ...PEOPLE_SECTION);
      report.added_sections.push('Publishable commitments', 'People');
    }
    if (/^##\s+Open questions\s*$/i.test(line)) {
      out.push(...PROHIBITED_SECTION, ...INTERNAL_SECTION);
      report.added_sections.push('Prohibited claims', 'Internal-only notes');
      const end = sectionEnd(i);
      const section = lines.slice(i, end);
      if (report.unresolved.length > 0) {
        const placeholder = section.findIndex((entry) => /^\s*-\s+`\[none recorded yet\]`\s*$/.test(entry));
        const added = report.unresolved.map((question) => `- ${question}`);
        if (placeholder >= 0) section.splice(placeholder, 1, ...added);
        else {
          let last = section.length - 1;
          while (last > 0 && section[last].trim() === '') last -= 1;
          section.splice(last + 1, 0, ...added);
        }
      }
      out.push(...section);
      i = end;
      continue;
    }
    out.push(line);
    i += 1;
  }
  let result = out.join('\n');
  if (!parsed.isTemplate) {
    const stamp = date || new Date().toISOString().slice(0, 10);
    result = `${result.replace(/\s*$/, '')}\n| ${stamp} | Migrated facts.md to contract v2 (labels only; no facts added) | ${by} |\n`;
  }
  report.changed = result !== text;
  return { text: result, report };
}
