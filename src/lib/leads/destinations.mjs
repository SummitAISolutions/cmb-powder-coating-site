/**
 * Lead destinations — SERVER-SIDE configuration only. Never import this module
 * from browser code (client.mjs does not, and the proof suite checks it).
 *
 * search/site.json names WHICH adapter a form uses and WHICH environment
 * variables hold its secrets; the values themselves live only in the server
 * environment (Cloudflare Pages environment variables/secrets, or the local
 * shell). A literal URL, token or header value in site.json is refused.
 *
 *   { "adapter": "test-sink" }
 *   { "adapter": "webhook", "urlEnv": "SUMMIT_LEAD_WEBHOOK_URL",
 *     "headersEnv": { "Authorization": "SUMMIT_LEAD_WEBHOOK_AUTH" },
 *     "timeoutMs": 8000, "attempts": 2, "dedupe": "summit" }
 *
 * Runtime environments (SUMMIT_LEAD_ENV, read at request time on the server):
 *   preview (default when unset)  every submission goes to the test sink; the
 *                                 configured destination is never contacted
 *   production                    real submissions go to the configured
 *                                 destination; QA submissions are refused
 * A production page (summit-site-env=production) served by a preview lead
 * environment is a misconfiguration and fails loudly instead of silently
 * swallowing real leads; see server.mjs.
 */

export const LEAD_ADAPTER_KINDS = ['test-sink', 'webhook'];
export const LEAD_ENVS = ['preview', 'production'];
export const DEDUPE_MODES = ['summit', 'destination'];
/**
 * What a 3xx answer from a webhook destination means:
 *   refuse  (default) a redirect is a permanent failure. The lead is never
 *           re-sent to the redirect target, so lead data can never follow a
 *           Location header to a host the client never approved.
 *   accept  the destination is known to answer a delivered POST with a
 *           redirect (Google Apps Script does: it runs doPost, then redirects
 *           to its result page). The 3xx counts as delivered. Summit still
 *           never follows it — no second request, no lead data anywhere else.
 * Opt in per destination, never by default.
 */
export const REDIRECT_MODES = ['refuse', 'accept'];

const ENV_NAME_RE = /^[A-Z][A-Z0-9_]{2,63}$/;
const HEADER_NAME_RE = /^[A-Za-z][A-Za-z0-9-]{0,63}$/;
const RESERVED_HEADERS = ['content-type', 'content-length', 'host', 'cookie', 'idempotency-key', 'x-summit-lead-contract', 'x-summit-qa-marker', 'transfer-encoding', 'connection'];
const SECRET_LOOKING_KEYS = /^(url|endpoint|href|headers|token|secret|password|apiKey|api_key|key|auth|authorization|webhook)$/i;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const DESTINATION_DEFAULTS = Object.freeze({ timeoutMs: 8000, attempts: 2, dedupe: 'summit', redirects: 'refuse' });

/** Structural problems with a destination block (no environment access). */
export function destinationProblems(destination, where = 'destination') {
  const problems = [];
  if (!isObject(destination)) return [`${where} must be { adapter, … }`];
  if (!LEAD_ADAPTER_KINDS.includes(destination.adapter)) problems.push(`${where}.adapter must be one of ${LEAD_ADAPTER_KINDS.join(', ')}`);
  for (const key of Object.keys(destination)) {
    if (SECRET_LOOKING_KEYS.test(key)) problems.push(`${where}.${key}: a destination URL, header or credential is a secret and never belongs in site.json; name an environment variable (urlEnv, headersEnv)`);
  }
  if (destination.adapter === 'test-sink') {
    for (const key of Object.keys(destination)) if (key !== 'adapter' && !SECRET_LOOKING_KEYS.test(key)) problems.push(`${where}: the test sink takes no "${key}"`);
  }
  if (destination.adapter === 'webhook') {
    for (const key of Object.keys(destination)) {
      if (!['adapter', 'urlEnv', 'headersEnv', 'timeoutMs', 'attempts', 'dedupe', 'redirects'].includes(key) && !SECRET_LOOKING_KEYS.test(key)) problems.push(`${where}: unknown key "${key}"`);
    }
    if (!ENV_NAME_RE.test(destination.urlEnv || '')) problems.push(`${where}.urlEnv must name the environment variable holding the webhook URL (UPPER_SNAKE_CASE)`);
    if (destination.headersEnv !== undefined) {
      if (!isObject(destination.headersEnv)) problems.push(`${where}.headersEnv must map header names to environment variable names`);
      else {
        for (const [header, envName] of Object.entries(destination.headersEnv)) {
          if (!HEADER_NAME_RE.test(header) || RESERVED_HEADERS.includes(header.toLowerCase())) problems.push(`${where}.headersEnv: "${header}" is not an allowed header name`);
          if (!ENV_NAME_RE.test(String(envName))) problems.push(`${where}.headersEnv.${header} must name an environment variable (UPPER_SNAKE_CASE), never a literal value`);
        }
      }
    }
    if (destination.timeoutMs !== undefined && (!Number.isInteger(destination.timeoutMs) || destination.timeoutMs < 1000 || destination.timeoutMs > 30000)) problems.push(`${where}.timeoutMs must be an integer from 1000 to 30000`);
    if (destination.attempts !== undefined && (!Number.isInteger(destination.attempts) || destination.attempts < 1 || destination.attempts > 3)) problems.push(`${where}.attempts must be 1, 2 or 3 (bounded retries within one request)`);
    if (destination.dedupe !== undefined && !DEDUPE_MODES.includes(destination.dedupe)) problems.push(`${where}.dedupe must be "summit" (never resend after an uncertain outcome) or "destination" (the destination de-duplicates on Idempotency-Key / submission_id)`);
    if (destination.redirects !== undefined && !REDIRECT_MODES.includes(destination.redirects)) problems.push(`${where}.redirects must be "refuse" (default: a redirect is a permanent failure) or "accept" (the destination answers a delivered POST with a redirect, as Google Apps Script does); a redirect is never followed either way`);
  }
  return problems;
}

/** A production build must not deliver leads to the test sink. */
export function productionDestinationProblems(site) {
  const forms = isObject(site) && isObject(site.conversion) && Array.isArray(site.conversion.forms) ? site.conversion.forms : [];
  return forms
    .filter((form) => isObject(form) && isObject(form.lead) && isObject(form.lead.destination) && form.lead.destination.adapter === 'test-sink')
    .map((form) => `conversion.forms "${form.id}": a production build cannot deliver leads to the test sink; approve a real destination adapter`);
}

/** The lead runtime environment from SUMMIT_LEAD_ENV. Unset means preview. */
export function resolveLeadEnv(env) {
  const raw = env && typeof env.SUMMIT_LEAD_ENV === 'string' ? env.SUMMIT_LEAD_ENV.trim() : '';
  if (raw === '') return { environment: 'preview', problem: null };
  if (LEAD_ENVS.includes(raw)) return { environment: raw, problem: null };
  return { environment: null, problem: 'SUMMIT_LEAD_ENV must be "preview" or "production"' };
}

const isLoopbackHost = (hostname) => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);

/**
 * Resolve a webhook destination against the server environment. Returns
 * { url, headers, problems }. Problems never contain the secret values.
 * HTTPS is required; plain HTTP only for a loopback host (local development).
 */
export function resolveWebhook(destination, env) {
  const problems = [];
  const rawUrl = env ? env[destination.urlEnv] : undefined;
  let url = null;
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') problems.push(`environment variable ${destination.urlEnv} is not set`);
  else {
    try {
      const parsed = new URL(rawUrl.trim());
      if (parsed.username || parsed.password) problems.push(`${destination.urlEnv} must not embed credentials in the URL; use headersEnv`);
      else if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname))) url = parsed.href;
      else problems.push(`${destination.urlEnv} must be an https URL`);
    } catch {
      problems.push(`${destination.urlEnv} is not a valid URL`);
    }
  }
  const headers = {};
  for (const [header, envName] of Object.entries(destination.headersEnv || {})) {
    const value = env ? env[envName] : undefined;
    if (typeof value !== 'string' || value === '') problems.push(`environment variable ${envName} (header ${header}) is not set`);
    else headers[header] = value;
  }
  return { url: problems.length ? null : url, headers, problems };
}

export function withDestinationDefaults(destination) {
  return { ...DESTINATION_DEFAULTS, ...destination };
}

/**
 * Destination details found in built browser files — pure. `files` is a list
 * of { name, text }. Looks for every destination's environment variable names,
 * their values in `env` when set (a secret inlined at build time), and the
 * destination keys themselves. Findings name the file and the kind, never the
 * value.
 */
export function bundleDestinationFindings(files, site, env = {}) {
  const destinations = (isObject(site) && isObject(site.conversion) && Array.isArray(site.conversion.forms) ? site.conversion.forms : [])
    .filter((form) => isObject(form) && isObject(form.lead) && isObject(form.lead.destination))
    .map((form) => form.lead.destination);
  const names = [...new Set(destinations.flatMap((destination) => [destination.urlEnv, ...Object.values(destination.headersEnv || {})]).filter((name) => ENV_NAME_RE.test(String(name))))];
  const values = names.map((name) => (env ? env[name] : undefined)).filter((value) => typeof value === 'string' && value.length >= 8);
  const findings = [];
  for (const file of files) {
    if (names.some((name) => file.text.includes(name))) findings.push({ file: file.name, kind: 'environment variable name' });
    if (values.some((value) => file.text.includes(value))) findings.push({ file: file.name, kind: 'destination secret value' });
    if (/\b(urlEnv|headersEnv)\b/.test(file.text)) findings.push({ file: file.name, kind: 'destination configuration' });
  }
  return findings;
}
