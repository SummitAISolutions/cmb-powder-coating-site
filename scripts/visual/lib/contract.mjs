/**
 * Summit Visual System v1 — artifact contract.
 *
 * Pure functions only. No filesystem, no network, no third-party imports (only
 * node:crypto): YAML is parsed by the caller and handed in, so this module can
 * be exercised from the orchestration repository's offline validation without
 * this starter's node_modules being installed.
 *
 * What is checked here is the Summit layer on top of Google's DESIGN.md format:
 * which token roles the starter's primitives depend on, which rationale
 * sections a design must argue for, the human approval gate, and the
 * authenticity rules for imagery. Google's own linter still runs separately
 * (see design-md.mjs); nothing here re-implements it.
 */

import { createHash } from 'node:crypto';

export const CONTRACT_VERSION = 1;

// ------------------------------------------------------------------ parsing

/**
 * Split a Markdown file into its YAML front matter (raw string) and body.
 * Returns { frontMatter: string|null, body: string }.
 */
export function splitFrontMatter(text) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { frontMatter: null, body: normalized };
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) return { frontMatter: null, body: normalized };
  const after = normalized.indexOf('\n', end + 4);
  return {
    frontMatter: normalized.slice(4, end + 1),
    body: after === -1 ? '' : normalized.slice(after + 1),
  };
}

/** Headings of one level, ignoring fenced code blocks. */
export function headings(body, level = 2) {
  const prefix = `${'#'.repeat(level)} `;
  const found = [];
  let fenced = false;
  for (const line of String(body ?? '').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    if (line.startsWith(prefix)) found.push(line.slice(prefix.length).trim());
  }
  return found;
}

/**
 * Map of `## Heading` -> section text (up to the next heading of the same or a
 * higher level). Code fences are respected.
 */
export function sections(body, level = 2) {
  const map = new Map();
  let current = null;
  let fenced = false;
  const isBoundary = (line) => {
    const match = /^(#{1,6}) /.exec(line);
    return match && match[1].length <= level;
  };
  for (const line of String(body ?? '').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (!fenced && isBoundary(line)) {
      const match = /^(#{1,6}) (.*)$/.exec(line);
      current = match[1].length === level ? match[2].trim() : null;
      if (current !== null) map.set(current, '');
      continue;
    }
    if (current !== null) map.set(current, `${map.get(current)}${line}\n`);
  }
  return map;
}

// Unfilled-template markers. A visible gap is always better than a guess, but
// an approved artifact may not still contain one.
const FILL_MARKER_RE = /\[(?:FILL|TEMPLATE|NEEDS FACT)[^\]]*\]/;

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ------------------------------------------------------------------ colour

/** WCAG 2.x relative luminance of a #rgb / #rrggbb colour, or null. */
export function relativeLuminance(hex) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!match) return null;
  let digits = match[1];
  if (digits.length === 3) digits = digits.split('').map((c) => c + c).join('');
  const channel = (offset) => {
    const value = parseInt(digits.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio between two hex colours, or null when either is invalid. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

// ------------------------------------------------------------------ DESIGN.md

/**
 * Token roles the starter's base CSS and primitives read. These are ROLES, not
 * a look: every client fills them with its own values. Renaming one is a
 * breaking change to the starter.
 */
export const REQUIRED_TOKENS = {
  colors: ['surface', 'on-surface', 'on-surface-muted', 'primary', 'on-primary', 'accent'],
  typography: ['display', 'heading', 'body', 'label'],
  spacing: ['gutter', 'stack', 'section'],
};

/** Pairs that must stay legible whatever the palette. [fg, bg, minimum ratio]. */
export const REQUIRED_CONTRAST = [
  ['on-surface', 'surface', 4.5],
  ['on-surface-muted', 'surface', 4.5],
  ['on-primary', 'primary', 4.5],
  ['accent', 'surface', 4.5],
];

/**
 * `##` sections a DESIGN.md must argue for. The first group is Google's
 * canonical set (kept in Google's order); the second is Summit's art-direction
 * layer, which Google's linter preserves as unknown sections.
 */
export const DESIGN_SECTIONS_GOOGLE = ['Overview', 'Colors', 'Typography', 'Layout', 'Components', "Do's and Don'ts"];
export const DESIGN_SECTIONS_SUMMIT = ['Composition', 'Signature Element', 'Image Direction'];

/** CSS custom properties the exporter must emit for the required roles. */
export function requiredThemeVariables() {
  return [
    ...REQUIRED_TOKENS.colors.map((name) => `--color-${name}`),
    ...REQUIRED_TOKENS.typography.flatMap((name) => [`--font-${name}`, `--text-${name}`]),
    ...REQUIRED_TOKENS.spacing.map((name) => `--spacing-${name}`),
  ];
}

export const isTemplateDesign = (tokens) => isObject(tokens) && typeof tokens.name === 'string' && tokens.name.startsWith('[TEMPLATE]');

/**
 * Summit problems and warnings for a parsed DESIGN.md.
 * `tokens` is the parsed front matter; `body` the Markdown after it.
 */
export function designProblems(tokens, body) {
  const problems = [];
  const warnings = [];

  if (!isObject(tokens)) {
    return { problems: ['DESIGN.md: YAML front matter is missing or is not a map'], warnings };
  }
  if (!nonEmpty(tokens.name)) problems.push('DESIGN.md: front matter "name" is required');

  for (const [group, names] of Object.entries(REQUIRED_TOKENS)) {
    const defined = isObject(tokens[group]) ? tokens[group] : {};
    for (const name of names) {
      if (defined[name] === undefined) {
        problems.push(`DESIGN.md: ${group}.${name} is required (the starter primitives read this role)`);
      }
    }
  }

  const typography = isObject(tokens.typography) ? tokens.typography : {};
  for (const name of REQUIRED_TOKENS.typography) {
    const entry = typography[name];
    if (entry === undefined) continue;
    if (!isObject(entry) || !nonEmpty(entry.fontFamily) || entry.fontSize === undefined) {
      problems.push(`DESIGN.md: typography.${name} needs at least fontFamily and fontSize`);
    }
  }

  const colors = isObject(tokens.colors) ? tokens.colors : {};
  for (const [fg, bg, minimum] of REQUIRED_CONTRAST) {
    if (colors[fg] === undefined || colors[bg] === undefined) continue;
    const ratio = contrastRatio(colors[fg], colors[bg]);
    if (ratio === null) {
      problems.push(`DESIGN.md: colors.${fg} / colors.${bg} must be hex colours to be contrast-checked`);
    } else if (ratio < minimum) {
      problems.push(
        `DESIGN.md: colors.${fg} on colors.${bg} has contrast ${ratio.toFixed(2)}:1, below the required ${minimum}:1`
      );
    }
  }

  const present = headings(body, 2);
  for (const name of [...DESIGN_SECTIONS_GOOGLE, ...DESIGN_SECTIONS_SUMMIT]) {
    if (!present.includes(name)) problems.push(`DESIGN.md: "## ${name}" section is required`);
  }
  const bySection = sections(body, 2);
  const dos = bySection.get("Do's and Don'ts") || '';
  if (dos && (!/^### Do\s*$/m.test(dos) || !/^### Don't\s*$/m.test(dos))) {
    problems.push(`DESIGN.md: "## Do's and Don'ts" needs both a "### Do" and a "### Don't" list`);
  }

  if (!isTemplateDesign(tokens)) {
    if (FILL_MARKER_RE.test(body)) {
      problems.push('DESIGN.md: unfilled [FILL: ...] / [TEMPLATE] markers remain in a non-template design');
    }
    const families = Object.values(typography)
      .filter(isObject)
      .map((entry) => String(entry.fontFamily || '').trim());
    if (families.some((family) => /^PLACEHOLDER/i.test(family))) {
      problems.push('DESIGN.md: placeholder font families remain in a non-template design');
    }
    if (families.length > 0 && families.every((family) => /^inter$/i.test(family))) {
      warnings.push(
        'DESIGN.md: every typography role uses Inter — a prohibited generic default unless visual-direction.md argues for it'
      );
    }
  }

  return { problems, warnings };
}

// ------------------------------------------------------------ visual direction

export const DIRECTION_STATUSES = ['template', 'draft', 'in-review', 'changes-requested', 'approved'];

export const DIRECTION_SECTIONS = [
  'Design Thesis',
  'Subject Grounding',
  'Visual Personality',
  'Typography Direction',
  'Palette Concept',
  'Composition Strategy',
  'Density and Rhythm',
  'Signature Visual Device',
  'Image Treatment',
  'References Used',
  'Prohibited Defaults',
  'Approval',
];

/**
 * Front-matter keys that record the approval itself. They are volatile
 * metadata, so they are never part of the approved content hash — otherwise
 * recording the approval would invalidate it.
 */
export const APPROVAL_METADATA_KEYS = ['status', 'approved_by', 'approved_at', 'approved_hash'];
export const APPROVAL_HASH_PREFIX = 'sha256:';
const APPROVAL_HASH_RE = /^sha256:[0-9a-f]{64}$/;
// Bumping this string deliberately invalidates every existing approval.
const APPROVAL_HASH_DOMAIN = 'summit-visual-direction/approval/v1';

/** JSON with object keys sorted at every level: stable across key order. */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * The approval-controlled content of visual-direction.md, normalised:
 *   - every front-matter key except the approval metadata, as canonical JSON
 *   - the body WITHOUT its "## Approval" section (reviewer notes are metadata)
 *   - line endings as LF, trailing whitespace stripped, runs of blank lines
 *     collapsed to one, leading/trailing blank lines removed
 * Formatting noise therefore never invalidates an approval; any change to the
 * words of the direction does.
 */
/**
 * The direction body without its "## Approval" section. That section is
 * reviewer metadata: it is excluded from the approval hash, and — for the same
 * reason — from the "[FILL]" completeness rule, so a direction a person
 * approved is never rejected because the reviewer-notes block is still the
 * template's.
 */
export function bodyWithoutApproval(body) {
  const kept = [];
  let skipping = false;
  let fenced = false;
  for (const raw of String(body ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) fenced = !fenced;
    if (!fenced && /^#{1,2} /.test(raw)) skipping = /^## Approval\s*$/.test(raw);
    if (!skipping) kept.push(raw);
  }
  return kept.join('\n');
}

export function approvalContent(meta, body) {
  const controlled = Object.fromEntries(
    Object.entries(isObject(meta) ? meta : {}).filter(([key]) => !APPROVAL_METADATA_KEYS.includes(key))
  );
  const bySection = bodyWithoutApproval(body).split('\n').map((raw) => raw.replace(/[ \t]+$/, ''));
  const normalizedBody = bySection.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return `${APPROVAL_HASH_DOMAIN}\n${canonicalJson(controlled)}\n${normalizedBody}\n`;
}

/** Deterministic approval hash, e.g. "sha256:3f5a…". */
export function directionContentHash(meta, body) {
  return `${APPROVAL_HASH_PREFIX}${createHash('sha256').update(approvalContent(meta, body), 'utf8').digest('hex')}`;
}

/**
 * Is the recorded approval still valid for the content as it is now?
 * Returns { approved: boolean, reason: string|null, expectedHash }.
 */
export function approvalState(meta, body) {
  const expectedHash = directionContentHash(meta, body);
  if (!isObject(meta) || meta.status !== 'approved') {
    return { approved: false, reason: `status is ${JSON.stringify(meta?.status ?? null)}, not "approved"`, expectedHash };
  }
  if (!nonEmpty(meta.approved_by)) return { approved: false, reason: 'approved_by is empty', expectedHash };
  if (!(typeof meta.approved_at === 'string' && ISO_DATE_RE.test(meta.approved_at))) {
    return { approved: false, reason: 'approved_at is not YYYY-MM-DD', expectedHash };
  }
  if (!(typeof meta.approved_hash === 'string' && APPROVAL_HASH_RE.test(meta.approved_hash))) {
    return { approved: false, reason: 'approved_hash is missing or malformed', expectedHash };
  }
  if (meta.approved_hash !== expectedHash) {
    return {
      approved: false,
      reason:
        'the direction was edited after approval (approved_hash no longer matches its content) — ' +
        'it must be re-reviewed and re-approved',
      expectedHash,
    };
  }
  return { approved: true, reason: null, expectedHash };
}

export function directionProblems(meta, body) {
  const problems = [];
  if (!isObject(meta)) return ['visual-direction.md: YAML front matter is missing or is not a map'];

  if (!DIRECTION_STATUSES.includes(meta.status)) {
    problems.push(`visual-direction.md: status must be one of ${DIRECTION_STATUSES.join(', ')} (got ${JSON.stringify(meta.status)})`);
  }
  const present = headings(body, 2);
  for (const name of DIRECTION_SECTIONS) {
    if (!present.includes(name)) problems.push(`visual-direction.md: "## ${name}" section is required`);
  }

  if (meta.status === 'approved') {
    if (!nonEmpty(meta.approved_by)) {
      problems.push('visual-direction.md: an approved direction must name the human approver in approved_by');
    }
    if (!(typeof meta.approved_at === 'string' && ISO_DATE_RE.test(meta.approved_at))) {
      problems.push('visual-direction.md: an approved direction needs approved_at as YYYY-MM-DD');
    }
    if (FILL_MARKER_RE.test(bodyWithoutApproval(body))) {
      problems.push('visual-direction.md: an approved direction may not contain [FILL: ...] markers (the ## Approval reviewer notes are exempt)');
    }
    const state = approvalState(meta, body);
    if (!(typeof meta.approved_hash === 'string' && APPROVAL_HASH_RE.test(meta.approved_hash))) {
      problems.push(
        'visual-direction.md: an approved direction needs approved_hash (sha256:<64 hex>) binding the approval to its content — ' +
          'the approver records the value printed by `npm run visual:hash`'
      );
    } else if (meta.approved_hash !== state.expectedHash) {
      problems.push(`visual-direction.md: approval invalidated — ${state.reason}`);
    }
  } else if (nonEmpty(meta.approved_by) || nonEmpty(meta.approved_at) || nonEmpty(meta.approved_hash)) {
    problems.push('visual-direction.md: approved_by/approved_at/approved_hash are set but status is not "approved"');
  }
  return problems;
}

// ---------------------------------------------------------- reference analysis

export const REFERENCE_STATUSES = ['template', 'draft', 'complete'];
export const REFERENCE_FIELDS = ['Source', 'Typography', 'Layout / Composition', 'Color', 'Imagery', 'Interaction / Motion', 'KEEP', 'DIFFER', 'Fit'];
export const REFERENCE_COUNT = { min: 3, max: 6 };

export function referenceProblems(meta, body) {
  const problems = [];
  if (!isObject(meta)) return ['reference-analysis.md: YAML front matter is missing or is not a map'];
  if (!REFERENCE_STATUSES.includes(meta.status)) {
    problems.push(`reference-analysis.md: status must be one of ${REFERENCE_STATUSES.join(', ')}`);
  }

  const references = [...sections(body, 2).entries()].filter(([name]) => /^Reference\b/.test(name));
  if (meta.status === 'template') {
    if (references.length === 0) problems.push('reference-analysis.md: the template must show at least one reference block');
  } else if (references.length < REFERENCE_COUNT.min || references.length > REFERENCE_COUNT.max) {
    problems.push(
      `reference-analysis.md: expected ${REFERENCE_COUNT.min}-${REFERENCE_COUNT.max} "## Reference ..." sections, found ${references.length}`
    );
  }

  for (const [name, text] of references) {
    const fields = headings(text, 3);
    for (const field of REFERENCE_FIELDS) {
      if (!fields.includes(field)) problems.push(`reference-analysis.md: "${name}" is missing "### ${field}"`);
    }
  }
  if (meta.status === 'complete' && FILL_MARKER_RE.test(body)) {
    problems.push('reference-analysis.md: a complete analysis may not contain [FILL: ...] markers');
  }
  return problems;
}

// ------------------------------------------------------------------ image plan

export const IMAGE_PLAN_STATUSES = ['template', 'draft', 'active', 'complete'];
export const SLOT_PRIORITIES = ['P1', 'P2'];
export const SLOT_SOURCES = ['real-client', 'real-brand', 'ai-generated', 'none-yet'];
export const SLOT_STATUSES = ['planned', 'needs-asset', 'generating', 'in-review', 'approved', 'placed', 'dropped'];

/**
 * What a slot depicts. The PROTECTED categories are things that only a real
 * photograph of the real business can honestly show. Generating any of them
 * would fabricate proof: employees, customers, finished work, premises, fleet.
 */
export const DEPICTS = {
  protected: ['client-work', 'staff', 'customers', 'facility', 'fleet', 'client-product', 'documentary-proof'],
  open: ['place-context', 'atmosphere', 'material-texture', 'illustration', 'abstract'],
};

const ASPECT_RE = /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const SLOT_TEXT_FIELDS = ['page', 'section', 'role', 'subject', 'focal_point', 'crop_notes', 'authenticity_constraints'];

/**
 * Image-plan contract v2 (Summit Repair Pass 4).
 *
 * A visual earns a slot only by COMMUNICATING something: explaining better than
 * copy, showing a real part of the service or process, establishing useful
 * context, materially improving comprehension or composition, or carrying a
 * brand signal without pretending to be evidence. Empty space, the existence of
 * an image stage, a template slot or a reviewer saying "little imagery" are not
 * reasons. Zero slots is a valid plan.
 *
 * Every slot therefore states:
 *   communication_need  the problem the visual solves, in plain words
 *   medium              real-asset | generated-image | diagram | svg-illustration
 *   evidence_class      authentic-evidence       only a real asset may fill it
 *                       generated-communication  may be generated; never proof
 *                       decorative               allowed sparingly, with a reason
 *
 * v1 plans (no `contract_version`) still validate under the v1 rules, with a
 * warning; nothing already approved breaks.
 */
export const IMAGE_PLAN_CONTRACT_VERSION = 2;
export const SLOT_MEDIA = ['real-asset', 'generated-image', 'diagram', 'svg-illustration'];
export const EVIDENCE_CLASSES = ['authentic-evidence', 'generated-communication', 'decorative'];
/** Decorative slots allowed before the plan is told to justify having so many. */
export const DECORATIVE_SOFT_LIMIT = 2;

/**
 * A "communication need" that is really a reason to fill space. Refused: the
 * slot either states what it communicates or it does not exist.
 */
const FILLER_NEED = [
  /\b(?:add|adds|adding|more|extra)\s+(?:some\s+)?(?:visual\s+)?(?:interest|richness|polish|flair|texture|appeal)\b/i,
  /\bfill(?:s|ing)?\s+(?:the\s+)?(?:empty\s+)?(?:space|area|gap|column|right side|left side)\b/i,
  /\b(?:empty|blank|white)\s*space\b/i,
  /\b(?:premium|abstract|nice|beautiful|modern|generic)\s+(?:abstract\s+)?(?:image|visual|graphic|background)\s*(?:here)?\s*\.?$/i,
  /\bevery\s+(?:section|page|route)\s+(?:should|must|needs to)\s+have\b/i,
  /\b(?:reviewer|critique)\s+(?:said|says|flagged|noted)\b.*\b(?:imagery|images|visuals)\b/i,
  /\b(?:template|layout)\s+has\s+(?:an?\s+)?(?:image\s+)?slot\b/i,
  /\bmake\s+(?:it|the page|the section)\s+(?:look\s+)?(?:richer|fuller|less\s+empty|more\s+visual)\b/i,
];

export function fillerNeedProblem(need) {
  const text = String(need ?? '').trim();
  if (text.length < 20) return 'communication_need must say what the visual communicates (one specific sentence)';
  const hit = FILLER_NEED.find((pattern) => pattern.test(text));
  return hit ? `communication_need "${text.slice(0, 80)}" is a reason to fill space, not a communication need` : null;
}

export function imagePlanProblems(meta) {
  const problems = [];
  const warnings = [];
  if (!isObject(meta)) return { problems: ['image-plan.md: YAML front matter is missing or is not a map'], warnings };
  if (!IMAGE_PLAN_STATUSES.includes(meta.status)) {
    problems.push(`image-plan.md: status must be one of ${IMAGE_PLAN_STATUSES.join(', ')}`);
  }
  if (!Array.isArray(meta.slots)) {
    problems.push('image-plan.md: "slots" must be a list (it may be empty)');
    return { problems, warnings };
  }

  const v2 = meta.contract_version === IMAGE_PLAN_CONTRACT_VERSION;
  if (meta.contract_version !== undefined && !v2) {
    problems.push(`image-plan.md: contract_version must be ${IMAGE_PLAN_CONTRACT_VERSION}`);
  }
  if (!v2 && meta.status !== 'template') {
    warnings.push(`image-plan.md: upgrade to contract_version ${IMAGE_PLAN_CONTRACT_VERSION} — every slot then states its communication need, medium and evidence class`);
  }
  let decorative = 0;

  const seen = new Set();
  meta.slots.forEach((slot, index) => {
    const where = `image-plan.md: slots[${index}]`;
    if (!isObject(slot)) {
      problems.push(`${where} must be a map`);
      return;
    }
    const id = slot.id;
    const label = nonEmpty(id) ? `${where} (${id})` : where;
    if (!nonEmpty(id) || !SLUG_RE.test(id)) problems.push(`${where}.id must be a lowercase slug`);
    else if (seen.has(id)) problems.push(`${label}: duplicate slot id`);
    else seen.add(id);

    for (const field of SLOT_TEXT_FIELDS) {
      if (!nonEmpty(slot[field])) problems.push(`${label}.${field} is required`);
    }
    if (!SLOT_PRIORITIES.includes(slot.priority)) problems.push(`${label}.priority must be P1 or P2`);
    if (!SLOT_SOURCES.includes(slot.source)) problems.push(`${label}.source must be one of ${SLOT_SOURCES.join(', ')}`);
    if (!SLOT_STATUSES.includes(slot.status)) problems.push(`${label}.status must be one of ${SLOT_STATUSES.join(', ')}`);
    if (!nonEmpty(slot.aspect_ratio) || !ASPECT_RE.test(slot.aspect_ratio)) {
      problems.push(`${label}.aspect_ratio must look like "16:9"`);
    }
    if (typeof slot.real_asset_available !== 'boolean') problems.push(`${label}.real_asset_available must be true or false`);
    if (typeof slot.generate_if_needed !== 'boolean') problems.push(`${label}.generate_if_needed must be true or false`);
    const allDepicts = [...DEPICTS.protected, ...DEPICTS.open];
    if (!allDepicts.includes(slot.depicts)) problems.push(`${label}.depicts must be one of ${allDepicts.join(', ')}`);

    // Real assets first.
    if (slot.real_asset_available === true) {
      if (!nonEmpty(slot.real_asset_path)) problems.push(`${label}: real_asset_available is true but real_asset_path is empty`);
      if (slot.source === 'ai-generated') problems.push(`${label}: a real asset is available, so the slot may not use an AI-generated image`);
      if (slot.generate_if_needed === true) problems.push(`${label}: a real asset is available, so generate_if_needed must be false`);
    }

    // Never fabricate documentary proof.
    if (DEPICTS.protected.includes(slot.depicts)) {
      if (slot.source === 'ai-generated' || slot.generate_if_needed === true) {
        problems.push(
          `${label}: depicts "${slot.depicts}", which only a real photograph can honestly show — ` +
            'it may never be AI-generated. Leave it as needs-asset.'
        );
      }
      if (slot.real_asset_available === false && slot.priority === 'P1' && !['needs-asset', 'dropped'].includes(slot.status)) {
        warnings.push(`${label}: P1 slot with no real asset should be marked needs-asset so the gap stays visible`);
      }
    }

    if (['approved', 'placed'].includes(slot.status) && !nonEmpty(slot.final_path)) {
      problems.push(`${label}: status "${slot.status}" requires final_path`);
    }
    if (slot.source === 'ai-generated' && !nonEmpty(slot.prompt_notes)) {
      problems.push(`${label}: AI-generated slots must record prompt_notes`);
    }

    if (!v2 || slot.status === 'dropped') return;
    // ---- contract v2: a slot exists because it communicates something.
    const filler = fillerNeedProblem(slot.communication_need);
    if (filler) problems.push(`${label}: ${filler}`);
    if (!SLOT_MEDIA.includes(slot.medium)) problems.push(`${label}.medium must be one of ${SLOT_MEDIA.join(', ')}`);
    if (!EVIDENCE_CLASSES.includes(slot.evidence_class)) problems.push(`${label}.evidence_class must be one of ${EVIDENCE_CLASSES.join(', ')}`);

    // Authentic evidence comes from the real business, or it does not appear.
    const generated = slot.source === 'ai-generated' || slot.generate_if_needed === true || slot.medium === 'generated-image';
    if (slot.evidence_class === 'authentic-evidence') {
      if (generated) problems.push(`${label}: authentic evidence can never be generated — it must be a real asset or stay a visible gap`);
      if (slot.medium !== 'real-asset') problems.push(`${label}: authentic evidence must use medium real-asset`);
    }
    if (DEPICTS.protected.includes(slot.depicts) && slot.evidence_class !== 'authentic-evidence') {
      problems.push(`${label}: depicts "${slot.depicts}", which is evidence by nature — evidence_class must be authentic-evidence`);
    }
    // Generated communication is never passed off as proof, or as a real asset.
    if (slot.evidence_class === 'generated-communication' && slot.medium === 'real-asset') {
      problems.push(`${label}: generated communication cannot be medium real-asset`);
    }
    if (slot.medium === 'real-asset' && generated) {
      problems.push(`${label}: a real-asset slot may not be generated`);
    }
    if (slot.evidence_class === 'decorative') {
      decorative += 1;
      if (!nonEmpty(slot.decorative_justification) || String(slot.decorative_justification).trim().length < 20) {
        problems.push(`${label}: a decorative slot must justify how it improves the composition or brand experience (decorative_justification)`);
      }
    }
  });

  if (v2 && decorative > DECORATIVE_SOFT_LIMIT) {
    warnings.push(`image-plan.md: ${decorative} decorative slots — default toward fewer; each must earn its place`);
  }
  return { problems, warnings };
}

// ------------------------------------------------------------------ critique

export const CRITIQUE_STATUSES = ['template', 'draft', 'final'];
export const CRITIQUE_AXES = [
  'hierarchy',
  'composition',
  'typography',
  'spacing',
  'rhythm',
  'density',
  'image-treatment',
  'reference-alignment',
  'brand-differentiation',
];
export const CRITIQUE_SEVERITIES = ['blocker', 'major', 'minor', 'note'];
export const CRITIQUE_VIEWPORTS = ['desktop', 'tablet', 'mobile', 'all'];
const FINDING_FIELDS = ['id', 'axis', 'severity', 'page', 'viewport', 'screenshot', 'location', 'observation', 'anchor', 'recommendation'];

// Critique is finding-based on purpose. A numeric aesthetic score invites
// optimising the number instead of the page.
// Any key that is, or ends/starts with, a score word: "score", "overall_score", "aesthetic-rating"…
const SCORE_KEY_RE = /^(overall|(?:.*[_-])?(?:score|scores|rating|ratings|grade|grades|points)(?:[_-].*)?)$/i;

function findScoreKeys(value, trail = []) {
  if (Array.isArray(value)) return value.flatMap((item, i) => findScoreKeys(item, [...trail, i]));
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(SCORE_KEY_RE.test(key) ? [[...trail, key].join('.')] : []),
    ...findScoreKeys(child, [...trail, key]),
  ]);
}

export function critiqueProblems(meta) {
  const problems = [];
  if (!isObject(meta)) return ['critique.md: YAML front matter is missing or is not a map'];
  if (!CRITIQUE_STATUSES.includes(meta.status)) {
    problems.push(`critique.md: status must be one of ${CRITIQUE_STATUSES.join(', ')}`);
  }
  for (const key of findScoreKeys(meta)) {
    problems.push(`critique.md: "${key}" looks like a numeric aesthetic score — critique is finding-based only`);
  }
  if (!Array.isArray(meta.findings)) {
    problems.push('critique.md: "findings" must be a list');
    return problems;
  }
  if (meta.status === 'final') {
    if (meta.direction_status_at_review !== 'approved') {
      problems.push('critique.md: a final critique must be made against an approved visual direction');
    }
    if (!nonEmpty(meta.screenshots_manifest)) problems.push('critique.md: a final critique must cite screenshots_manifest');
    if (!nonEmpty(meta.reviewed_commit)) problems.push('critique.md: a final critique must record reviewed_commit');
  }

  const seen = new Set();
  meta.findings.forEach((finding, index) => {
    const where = `critique.md: findings[${index}]`;
    if (!isObject(finding)) {
      problems.push(`${where} must be a map`);
      return;
    }
    for (const field of FINDING_FIELDS) {
      if (!nonEmpty(finding[field])) problems.push(`${where}.${field} is required`);
    }
    if (nonEmpty(finding.id)) {
      if (seen.has(finding.id)) problems.push(`${where}: duplicate finding id ${finding.id}`);
      seen.add(finding.id);
    }
    if (finding.axis !== undefined && !CRITIQUE_AXES.includes(finding.axis)) {
      problems.push(`${where}.axis must be one of ${CRITIQUE_AXES.join(', ')}`);
    }
    if (finding.severity !== undefined && !CRITIQUE_SEVERITIES.includes(finding.severity)) {
      problems.push(`${where}.severity must be one of ${CRITIQUE_SEVERITIES.join(', ')}`);
    }
    if (finding.viewport !== undefined && !CRITIQUE_VIEWPORTS.includes(finding.viewport)) {
      problems.push(`${where}.viewport must be one of ${CRITIQUE_VIEWPORTS.join(', ')}`);
    }
  });
  return problems;
}

// ------------------------------------------------------------------ lifecycle

/**
 * The human approval gate, as one pure decision.
 *
 *   direction approved AND approval valid     -> DESIGN.md may be exported
 *   direction "approved" but approval invalid -> refuse (e.g. edited after
 *                                                approval: hash mismatch)
 *   direction template AND DESIGN.md template -> the starter's neutral
 *                                                placeholder theme may be exported
 *   anything else                             -> refuse: a real DESIGN.md
 *                                                without an approved direction
 *
 * `approval` is the result of approvalState(); a status of "approved" without
 * a valid approval is never treated as approved. There is deliberately no
 * override. Approval is a human decision recorded in visual-direction.md,
 * never a flag.
 */
export function exportGate({ directionStatus, designIsTemplate, approval }) {
  if (directionStatus === 'approved') {
    if (!approval || approval.approved !== true) {
      return {
        allowed: false,
        mode: null,
        reason: `visual-direction.md is marked approved but the approval is not valid: ${approval?.reason ?? 'approval was not verified'}. There is no override.`,
      };
    }
    if (designIsTemplate) {
      return { allowed: false, mode: null, reason: 'the visual direction is approved but DESIGN.md is still the starter template — write DESIGN.md from the approved direction first' };
    }
    return { allowed: true, mode: 'approved', reason: 'visual direction approved (content hash verified)' };
  }
  if (directionStatus === 'template' && designIsTemplate) {
    return { allowed: true, mode: 'placeholder', reason: 'starter placeholder theme (no client direction yet)' };
  }
  if (designIsTemplate) {
    return { allowed: true, mode: 'placeholder', reason: `visual direction is "${directionStatus}"; the placeholder theme stays in place until it is approved` };
  }
  return {
    allowed: false,
    mode: null,
    reason:
      `visual-direction.md is "${directionStatus}", not "approved". A client DESIGN.md is only ` +
      'exported after a human approves the visual direction. There is no override.',
  };
}

// ------------------------------------------------------------- source literals

/**
 * Raw visual values in implementation source. Client identity belongs in
 * DESIGN.md and reaches code only through the generated theme, so colour
 * literals and named font families in src/ are a contract violation.
 *
 * Returns [{ line, match, kind }].
 */
const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
  'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert',
]);

export function visualLiteralFindings(text) {
  const findings = [];
  const lines = String(text ?? '').split('\n');
  lines.forEach((raw, index) => {
    // Strip comments that merely mention a value.
    const line = raw.replace(/\/\*.*?\*\//g, '').replace(/<!--.*?-->/g, '').replace(/(^|\s)\/\/.*$/, '$1');
    for (const match of line.matchAll(/(^|[^&\w-])(#[0-9a-fA-F]{3,8})\b/g)) {
      if (/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{4}$|^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{8}$/.test(match[2])) {
        findings.push({ line: index + 1, match: match[2], kind: 'color-literal' });
      }
    }
    for (const match of line.matchAll(/\b(rgba?|hsla?|oklch|oklab|lab|lch|color)\(\s*[\d.]/g)) {
      findings.push({ line: index + 1, match: match[0], kind: 'color-function' });
    }
    for (const match of line.matchAll(/font-family\s*:\s*([^;}"'`]+|["'][^"']+["'][^;}]*)/g)) {
      const families = match[1].split(',').map((part) => part.trim().replace(/^["']|["']$/g, ''));
      for (const family of families) {
        if (family && !family.startsWith('var(') && !GENERIC_FAMILIES.has(family.toLowerCase())) {
          findings.push({ line: index + 1, match: family, kind: 'named-font' });
        }
      }
    }
    if (/fonts\.(googleapis|gstatic)\.com|use\.typekit\.net/.test(line)) {
      findings.push({ line: index + 1, match: 'hosted font import', kind: 'font-import' });
    }
  });
  return findings;
}
