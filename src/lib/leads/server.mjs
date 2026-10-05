/**
 * The Summit lead endpoint — SERVER-SIDE, Web-standard Request → Response.
 *
 * One handler, two hosts: the Cloudflare Pages Function (functions/api/lead.js)
 * and the local development server (scripts/leads/local-server.mjs). The
 * browser only ever talks to this endpoint; it never learns the destination.
 *
 *   POST /api/lead          application/json (the LeadForm script) or
 *                           application/x-www-form-urlencoded (no JavaScript)
 *     1. method, content type and body size
 *     2. the form: an approved lead form in search/site.json
 *     3. contract shape: unknown keys refused, route and form bound
 *     4. abuse: honeypot and fill-time trap (ignored, never delivered)
 *     5. authoritative field validation (the same code the browser runs)
 *     6. environment: preview / QA → test sink only; production → destination
 *     7. idempotency: one record per submission id (store.mjs)
 *     8. adapter, bounded retries, structured outcome, redacted log
 *   GET /api/lead?probe=qa                    is this endpoint in QA test-sink mode?
 *   GET /api/lead?receipt=<submission id>     a test-sink receipt (preview only)
 *
 * QA safety: a request carrying X-Summit-QA-Marker is a QA submission. It is
 * delivered only to the test sink, and refused outright by a production lead
 * environment. In preview, the configured destination is never contacted.
 */

import {
  LEAD_CONTRACT, LEAD_ENDPOINT, HONEYPOT_FIELD, QA_MARKER_HEADER, LIMITS,
  canonicalJson, sha256Hex, isSubmissionId, isQaMarker, findLeadForm, leadFormProblems, publicFormContract,
  validateFields, normalizeAttribution, splitSubmission, buildCanonicalLead, leadContent,
} from './contract.mjs';
import { destinationProblems, resolveLeadEnv, withDestinationDefaults } from './destinations.mjs';
import { ADAPTERS, adapterProblems } from './adapters.mjs';
import { DELIVERY_RULES, planDelivery, recordKey } from './store.mjs';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const iso = (ms) => new Date(ms).toISOString();

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

async function readLimited(request, limit) {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      try {
        await reader.cancel();
      } catch {
        /* nothing to release */
      }
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseFormEncoded(text) {
  const out = {};
  for (const [key, value] of new URLSearchParams(text)) {
    if (Object.prototype.hasOwnProperty.call(out, key)) return null;
    out[key] = value;
  }
  return out;
}

const siteOriginOf = (entity) => {
  if (!isObject(entity) || entity.status !== 'client' || typeof entity.url !== 'string') return null;
  try {
    return new URL(entity.url).origin;
  } catch {
    return null;
  }
};

/**
 * handleLeadRequest(request, options) → Promise<Response>
 *
 * options:
 *   env       server environment (SUMMIT_LEAD_ENV, destination secrets)
 *   site      parsed search/site.json
 *   entity    parsed search/business-entity.json
 *   store     idempotency store (store.mjs; KV or a file store in real use)
 *   adapters  adapter registry (default ADAPTERS)
 *   fetch, now, sleep   injectable for tests
 *   log       receives one structured, PII-free event per request outcome
 *   hooks     { afterPerform(result) } — proof-suite crash hook, never set in a site
 */
export async function handleLeadRequest(request, options) {
  const { env = {}, site, entity = null, store, adapters = ADAPTERS, fetch = globalThis.fetch, now = () => Date.now(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = () => {}, hooks = {} } = options;
  const started = now();
  const method = String(request.method || 'GET').toUpperCase();
  const url = new URL(request.url);
  const event = { event: 'summit.lead', method, form_id: null, submission_id: null, environment: null, qa: false, adapter: null, state: null, code: null, attempts: 0 };
  const finish = (response, fields = {}) => {
    Object.assign(event, fields, { http_status: response.status, duration_ms: now() - started });
    try {
      log(event);
    } catch {
      /* logging never breaks a submission */
    }
    return response;
  };

  const leadEnv = resolveLeadEnv(env);
  if (leadEnv.problem) return finish(jsonResponse(500, { ok: false, status: 'failed', retryable: false, code: 'lead-env-invalid' }), { state: 'refused', code: 'lead-env-invalid' });
  if (!store || typeof store.get !== 'function') return finish(jsonResponse(500, { ok: false, status: 'failed', retryable: false, code: 'store-missing' }), { state: 'refused', code: 'store-missing' });

  if (method === 'GET' || method === 'HEAD') return finish(await handleGet(url, { leadEnv, store }), { state: 'read' });
  if (method !== 'POST') return finish(jsonResponse(405, { ok: false, status: 'failed', retryable: false, code: 'method-not-allowed' }, { allow: 'GET, POST' }), { state: 'refused', code: 'method-not-allowed' });

  const contentType = String(request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const encoding = contentType === 'application/json' ? 'json' : contentType === 'application/x-www-form-urlencoded' ? 'form' : null;
  const wantsJson = encoding === 'json' || String(request.headers.get('accept') || '').includes('application/json');
  if (!encoding) return finish(jsonResponse(415, { ok: false, status: 'failed', retryable: false, code: 'unsupported-content-type' }), { state: 'refused', code: 'unsupported-content-type' });
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > LIMITS.bodyBytes) return finish(jsonResponse(413, { ok: false, status: 'failed', retryable: false, code: 'payload-too-large' }), { state: 'refused', code: 'payload-too-large' });
  const bytes = await readLimited(request, LIMITS.bodyBytes);
  if (bytes === null) return finish(jsonResponse(413, { ok: false, status: 'failed', retryable: false, code: 'payload-too-large' }), { state: 'refused', code: 'payload-too-large' });
  let body = null;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    body = encoding === 'json' ? JSON.parse(text) : parseFormEncoded(text);
  } catch {
    body = null;
  }
  if (!isObject(body)) return finish(jsonResponse(400, { ok: false, status: 'invalid', retryable: false, code: 'invalid-payload' }), { state: 'refused', code: 'invalid-payload' });

  // --- the approved form
  const form = typeof body.form_id === 'string' ? findLeadForm(site, body.form_id) : null;
  if (!form) return finish(jsonResponse(404, { ok: false, status: 'invalid', retryable: false, code: 'unknown-form' }), { state: 'refused', code: 'unknown-form' });
  event.form_id = form.id;
  const configProblems = [...leadFormProblems(form, { entity, template: !isObject(entity) || entity.status !== 'client' }), ...destinationProblems(form.lead.destination, `conversion.forms "${form.id}" lead.destination`)];
  if (configProblems.length > 0) return finish(jsonResponse(500, { ok: false, status: 'failed', retryable: false, code: 'lead-config-invalid' }), { state: 'refused', code: 'lead-config-invalid', problems: configProblems });
  const routes = Array.isArray(site.routes) ? site.routes : [];
  const contract = publicFormContract(form, { entity, routes });
  const redirect = (outcome) => new Response(null, { status: 303, headers: { location: `${contract.page_path || '/'}#${form.id}-lead-${outcome}`, 'cache-control': 'no-store' } });
  const respond = (status, payload, fields) => finish(wantsJson ? jsonResponse(status, payload, status === 503 ? { 'retry-after': '2' } : {}) : redirect(payload.ok ? 'received' : 'error'), fields);

  // --- contract shape
  const split = splitSubmission(body, contract, { encoding });
  const contractErrors = [...split.errors];
  const meta = split.meta;
  if (meta.contract !== undefined && meta.contract !== LEAD_CONTRACT) contractErrors.push({ field: 'contract', code: 'contract_mismatch' });
  if (meta.route_id !== contract.route_id) contractErrors.push({ field: 'route_id', code: 'route_mismatch' });
  if (meta.page_path !== undefined && meta.page_path !== contract.page_path) contractErrors.push({ field: 'page_path', code: 'route_mismatch' });
  if (meta.site_env !== undefined && !['preview', 'production'].includes(meta.site_env)) contractErrors.push({ field: 'site_env', code: 'invalid_type' });
  const suppliedId = typeof meta.submission_id === 'string' ? meta.submission_id.trim() : '';
  if (suppliedId !== '' && !isSubmissionId(suppliedId)) contractErrors.push({ field: 'submission_id', code: 'invalid_submission_id' });
  if (encoding === 'json' && suppliedId === '') contractErrors.push({ field: 'submission_id', code: 'invalid_submission_id' });
  const headerKey = request.headers.get('idempotency-key');
  if (headerKey && headerKey !== suppliedId) contractErrors.push({ field: 'submission_id', code: 'idempotency_key_mismatch' });
  const qaMarker = request.headers.get(QA_MARKER_HEADER);
  if (qaMarker !== null && !isQaMarker(qaMarker)) contractErrors.push({ field: QA_MARKER_HEADER, code: 'invalid_qa_marker' });
  const attribution = normalizeAttribution(split.attributionInput);
  contractErrors.push(...attribution.errors);
  if (contractErrors.length > 0) return respond(400, { ok: false, status: 'invalid', retryable: false, code: 'contract-invalid', errors: contractErrors }, { state: 'refused', code: 'contract-invalid' });
  event.qa = qaMarker !== null;

  // --- abuse: honeypot and fill time. Answered like a success, never delivered.
  const honeypot = meta[HONEYPOT_FIELD];
  const startedAt = Number(meta.started_at);
  const tooFast = Number.isFinite(startedAt) && startedAt > 0 && started - startedAt >= -300000 && started - startedAt < LIMITS.minFillMs;
  if ((typeof honeypot === 'string' && honeypot.trim() !== '') || tooFast) {
    return respond(200, { ok: true, status: 'received', submission_id: isSubmissionId(suppliedId) ? suppliedId : null }, { state: 'spam_ignored', code: tooFast ? 'filled-too-fast' : 'honeypot' });
  }

  // --- authoritative field validation (the same function the browser runs)
  const checked = validateFields(split.fields, contract);
  const fieldErrors = [...checked.errors];
  let consent = null;
  if (contract.consent) {
    const granted = meta.consent === true || ['on', 'true', 'yes'].includes(meta.consent);
    if (contract.consent.required && !granted) fieldErrors.push({ field: 'consent', code: 'consent_required' });
    consent = { id: contract.consent.id, granted, label_sha256: await sha256Hex(contract.consent.label) };
  } else if (meta.consent !== undefined) fieldErrors.push({ field: 'consent', code: 'unknown_field' });
  if (fieldErrors.length > 0) return respond(422, { ok: false, status: 'invalid', retryable: false, code: 'fields-invalid', errors: fieldErrors }, { state: 'refused', code: 'fields-invalid' });

  // --- environment and adapter: preview and QA reach the test sink only
  const pageEnv = meta.site_env === undefined ? null : meta.site_env;
  if (qaMarker !== null && leadEnv.environment === 'production') {
    return respond(403, { ok: false, status: 'failed', retryable: false, code: 'qa-not-allowed-in-production' }, { state: 'refused', code: 'qa-not-allowed-in-production' });
  }
  if (leadEnv.environment === 'preview' && pageEnv === 'production') {
    return respond(500, { ok: false, status: 'failed', retryable: false, code: 'lead-env-mismatch' }, { state: 'refused', code: 'lead-env-mismatch' });
  }
  const environment = leadEnv.environment === 'production' && pageEnv !== 'preview' ? 'production' : 'preview';
  event.environment = environment;
  const destination = withDestinationDefaults(form.lead.destination);
  const adapterKind = environment === 'production' ? destination.adapter : 'test-sink';
  if (environment === 'production' && adapterKind === 'test-sink') {
    return respond(500, { ok: false, status: 'failed', retryable: false }, { state: 'refused', code: 'test-sink-in-production' });
  }
  const adapter = adapters[adapterKind];
  if (!adapter || adapterProblems(adapter).length > 0) return respond(500, { ok: false, status: 'failed', retryable: false }, { state: 'refused', code: 'adapter-unavailable' });
  if (environment !== 'production' && (adapter.kind !== 'test-sink' || adapter.production !== false)) {
    return respond(500, { ok: false, status: 'failed', retryable: false, code: 'qa-adapter-not-sandbox' }, { state: 'refused', code: 'qa-adapter-not-sandbox' });
  }
  if (environment === 'production' && !store.durable) {
    return respond(500, { ok: false, status: 'failed', retryable: false }, { state: 'refused', code: 'idempotency-store-not-durable' });
  }
  event.adapter = adapter.kind;

  // --- the canonical lead and its idempotency key
  const submittedAt = typeof meta.submitted_at === 'string' && !Number.isNaN(Date.parse(meta.submitted_at)) ? iso(Date.parse(meta.submitted_at)) : null;
  const base = { contract, submittedAt, receivedAt: iso(started), values: checked.values, consent, attribution: attribution.attribution, siteOrigin: siteOriginOf(entity), environment, qaMarker };
  const submissionId = suppliedId || `fp_${(await sha256Hex(canonicalJson(leadContent(buildCanonicalLead({ ...base, submissionId: 'pending', receivedAt: null }))))).slice(0, 40)}`;
  const lead = buildCanonicalLead({ ...base, submissionId });
  const contentSha256 = await sha256Hex(canonicalJson(leadContent(lead)));
  event.submission_id = submissionId;
  const key = recordKey(form.id, submissionId);
  const preview = environment === 'preview';
  const success = (record, duplicate) => respond(200, { ok: true, status: 'received', submission_id: submissionId, duplicate, ...(preview ? { receipt: record.receipt } : {}) }, { state: 'delivered', code: duplicate ? 'duplicate' : record.code, attempts: record.attempts });
  const failure = (record) => (record.state === 'retryable_failure'
    ? respond(503, { ok: false, status: 'retry', retryable: true, submission_id: submissionId, ...(preview ? { code: record.code } : {}) }, { state: record.state, code: record.code, attempts: record.attempts })
    : respond(502, { ok: false, status: 'failed', retryable: false, submission_id: submissionId, ...(preview ? { code: record.code } : {}) }, { state: record.state, code: record.code, attempts: record.attempts }));

  let record = await store.get(key);
  if (record && record.content_sha256 !== contentSha256) {
    return respond(409, { ok: false, status: 'invalid', retryable: false, code: 'idempotency-key-reused', submission_id: submissionId }, { state: 'refused', code: 'idempotency-key-reused' });
  }
  // Adapters call context.fetch(...). Workers (workerd) throws "Illegal
  // invocation" when fetch runs with any `this` other than globalThis, so the
  // context carries a plain wrapper, never the fetch function itself. Node
  // does not care, which is why this only fails on Cloudflare.
  const context = { env, fetch: (...args) => fetch(...args), now, sink: store, idempotencyKey: submissionId, destination };
  const write = (fields) => store.put(key, { ...record, ...fields, updated_at: iso(now()) });
  let plan = planDelivery(record, { now: now() });

  if (plan === 'replay') return success(record, true);
  if (plan === 'replay-failed') return failure(record.state === 'permanent_failure' ? record : { ...record, state: 'permanent_failure', code: record.code || 'attempts-exhausted' });
  if (plan === 'in-progress') return respond(202, { ok: false, status: 'in_progress', retryable: true, submission_id: submissionId }, { state: 'in_progress', attempts: record.attempts });
  if (plan === 'uncertain') {
    if (adapter.reconcilable) {
      const found = await adapter.reconcile(lead, context);
      if (found.found) {
        await write({ state: 'delivered', code: 'reconciled', receipt: found.receipt, delivery_uncertain: false });
        record = await store.get(key);
        return success(record, true);
      }
      plan = 'perform';
    } else if (environment === 'production' && destination.dedupe === 'destination') {
      plan = 'perform';
    } else {
      await write({ state: 'pending_reconciliation', code: record.code || 'outcome-unknown' });
      return respond(202, { ok: false, status: 'pending', retryable: false, submission_id: submissionId }, { state: 'pending_reconciliation', code: record.code || 'outcome-unknown', attempts: record.attempts });
    }
  }

  // --- perform: intent first, then the adapter, then the receipt
  const createdAt = record ? record.created_at : iso(now());
  let attempts = record ? record.attempts : 0;
  const intent = { form_id: form.id, adapter: adapter.kind, content_sha256: contentSha256, state: 'intent', attempts, delivery_uncertain: false, code: null, receipt: null, created_at: createdAt, updated_at: iso(now()) };
  if (!record) {
    if (!(await store.create(key, intent))) return respond(202, { ok: false, status: 'in_progress', retryable: true, submission_id: submissionId }, { state: 'in_progress' });
  }
  record = intent;
  const perRequest = environment === 'production' ? destination.attempts : 1;
  let outcome = null;
  for (let index = 0; index < perRequest; index += 1) {
    attempts += 1;
    await store.put(key, { ...intent, attempts, updated_at: iso(now()) });
    try {
      outcome = await adapter.submitLead(lead, context);
    } catch {
      outcome = { outcome: 'retryable', code: 'adapter-error', delivery_uncertain: true, receipt: null };
    }
    if (hooks.afterPerform) await hooks.afterPerform(outcome);
    if (outcome.outcome !== 'retryable' || outcome.delivery_uncertain || attempts >= DELIVERY_RULES.maxAttempts) break;
    if (index < perRequest - 1) await sleep(250 * (index + 1));
  }
  // Configuration problems name environment variables, never their values.
  if (Array.isArray(outcome.problems)) event.problems = outcome.problems;
  const state = outcome.outcome === 'success' ? 'delivered' : outcome.outcome === 'permanent' ? 'permanent_failure' : 'retryable_failure';
  record = { ...intent, state, attempts, delivery_uncertain: Boolean(outcome.delivery_uncertain), code: outcome.code, receipt: outcome.receipt || null, updated_at: iso(now()) };
  await store.put(key, record);
  if (state === 'delivered') return success(record, false);
  return failure(record);
}

async function handleGet(url, { leadEnv, store }) {
  if (url.searchParams.get('probe') === 'qa') {
    return jsonResponse(200, { contract: LEAD_CONTRACT, endpoint: LEAD_ENDPOINT, environment: leadEnv.environment, qa_sink: leadEnv.environment === 'preview', store_durable: Boolean(store.durable) });
  }
  const receipt = url.searchParams.get('receipt');
  if (receipt !== null) {
    if (leadEnv.environment !== 'preview' || !isSubmissionId(receipt)) return jsonResponse(404, { ok: false, status: 'not_found' });
    const found = await store.get(`sink:${receipt}`);
    return found ? jsonResponse(200, { ok: true, receipt: found.receipt }) : jsonResponse(404, { ok: false, status: 'not_found' });
  }
  return jsonResponse(405, { ok: false, status: 'failed', retryable: false, code: 'method-not-allowed' }, { allow: 'GET, POST' });
}
