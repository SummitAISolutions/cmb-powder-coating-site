/**
 * Lead adapters — SERVER-SIDE. The adapter contract:
 *
 *   adapter.kind           'test-sink' | 'webhook'
 *   adapter.production     may this adapter receive real leads in production?
 *   adapter.reconcilable   can it answer "did you already receive this submission?"
 *   adapter.submitLead(lead, context) → Promise<AdapterResult>
 *   adapter.reconcile(lead, context)  → Promise<{ found, receipt }>   (reconcilable only)
 *
 *   AdapterResult = { outcome: 'success' | 'retryable' | 'permanent', code,
 *                     delivery_uncertain, http_status, receipt }
 *
 *   retryable   the destination did not take the lead, but a later attempt may
 *               succeed: a timeout, a network failure, HTTP 408/425/429/5xx
 *   permanent   retrying cannot help: invalid configuration, a rejected payload
 *               (other 4xx), a redirect (unless the destination declares
 *               redirects: "accept"), an invalid destination
 *   delivery_uncertain  the destination may have received it anyway (timeout,
 *               connection lost after sending). The server never resends such a
 *               lead unless the adapter reconciles or the destination is
 *               declared to de-duplicate (see server.mjs).
 *
 * `context` = { env, fetch, now, sink, idempotencyKey, destination }.
 * An adapter never returns a secret, a destination URL, a response body or
 * lead content in its result: results reach logs and, in preview, QA evidence.
 */

import { LEAD_CONTRACT, canonicalJson, leadContent, sha256Hex } from './contract.mjs';
import { resolveWebhook, withDestinationDefaults } from './destinations.mjs';

export const OUTCOMES = ['success', 'retryable', 'permanent'];

const result = (outcome, code, extra = {}) => ({ outcome, code, delivery_uncertain: false, http_status: null, receipt: null, ...extra });

/** HTTP status → outcome. 2xx success; 408/425/429/5xx retryable; everything else permanent. */
export function classifyHttpStatus(status) {
  if (status >= 200 && status < 300) return 'success';
  if ([408, 425, 429].includes(status) || (status >= 500 && status < 600)) return 'retryable';
  return 'permanent';
}

// Errors that prove the request never reached the destination.
const NOT_SENT_CODES = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ERR_INVALID_URL', 'UND_ERR_CONNECT_TIMEOUT'];

/**
 * The deterministic local/test sink: Summit-owned, contacts nothing, and keeps
 * a receipt per submission in the lead store so a QA run (or a developer) can
 * prove receipt. It never receives real production leads.
 */
export const testSinkAdapter = Object.freeze({
  kind: 'test-sink',
  production: false,
  reconcilable: true,
  async submitLead(lead, context) {
    const receipt = {
      adapter: 'test-sink',
      contract: LEAD_CONTRACT,
      submission_id: lead.submission_id,
      form_id: lead.source.form_id,
      route_id: lead.source.route_id,
      environment: lead.environment,
      qa_marker: lead.qa ? lead.qa.marker : null,
      content_sha256: await sha256Hex(canonicalJson(leadContent(lead))),
      received_at: new Date(context.now()).toISOString(),
      store_durable: Boolean(context.sink && context.sink.durable),
    };
    // The lead itself is kept only by a local development store (keepLeads).
    await context.sink.put(`sink:${lead.submission_id}`, context.sink.keepLeads ? { receipt, lead } : { receipt });
    return result('success', 'received', { receipt });
  },
  async reconcile(lead, context) {
    const found = await context.sink.get(`sink:${lead.submission_id}`);
    return found ? { found: true, receipt: found.receipt } : { found: false, receipt: null };
  },
});

/**
 * Generic webhook: POST the canonical lead as JSON to a URL held in the server
 * environment. Headers: content-type, Idempotency-Key (the submission id),
 * X-Summit-Lead-Contract, plus configured secret headers from the environment.
 * Redirects are not followed; the response body is never read into a result.
 * Google Sheets (Apps Script), Make, Zapier or a custom endpoint sit behind it.
 */
export const webhookAdapter = Object.freeze({
  kind: 'webhook',
  production: true,
  reconcilable: false,
  async submitLead(lead, context) {
    const destination = withDestinationDefaults(context.destination);
    const resolved = resolveWebhook(destination, context.env);
    if (resolved.problems.length > 0) return result('permanent', 'destination-misconfigured', { problems: resolved.problems });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), destination.timeoutMs);
    try {
      const response = await context.fetch(resolved.url, {
        method: 'POST',
        headers: { ...resolved.headers, 'content-type': 'application/json', 'idempotency-key': lead.submission_id, 'x-summit-lead-contract': LEAD_CONTRACT },
        body: JSON.stringify(lead),
        redirect: 'manual',
        signal: controller.signal,
      });
      try {
        await response.arrayBuffer();
      } catch {
        /* the body is discarded either way */
      }
      const outcome = classifyHttpStatus(response.status);
      if (response.status >= 300 && response.status < 400) {
        // Never followed: the lead is not re-sent to the Location target.
        // "accept" says this destination redirects AFTER taking the lead.
        if (destination.redirects === 'accept') return result('success', 'accepted-redirect', { http_status: response.status });
        return result('permanent', 'destination-redirected', { http_status: response.status });
      }
      return result(outcome, outcome === 'success' ? 'accepted' : `http-${response.status}`, { http_status: response.status });
    } catch (error) {
      if (controller.signal.aborted) return result('retryable', 'timeout', { delivery_uncertain: true });
      const code = error && error.cause && error.cause.code;
      if (NOT_SENT_CODES.includes(code)) return result('retryable', 'network-unreachable', { delivery_uncertain: false });
      return result('retryable', 'network-error', { delivery_uncertain: true });
    } finally {
      clearTimeout(timer);
    }
  },
});

export const ADAPTERS = Object.freeze({ 'test-sink': testSinkAdapter, webhook: webhookAdapter });

/** Problems with an adapter object supplied by a caller (tests, future adapters). */
export function adapterProblems(adapter) {
  const problems = [];
  if (!adapter || typeof adapter !== 'object') return ['adapter must be an object'];
  if (typeof adapter.kind !== 'string' || !adapter.kind) problems.push('adapter.kind is required');
  if (typeof adapter.production !== 'boolean') problems.push('adapter.production must be true or false');
  if (typeof adapter.submitLead !== 'function') problems.push('adapter.submitLead(lead, context) is required');
  if (adapter.reconcilable === true && typeof adapter.reconcile !== 'function') problems.push('a reconcilable adapter needs reconcile(lead, context)');
  return problems;
}
