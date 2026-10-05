/**
 * Lead idempotency store and delivery decisions — SERVER-SIDE.
 *
 * The store holds control metadata per submission, never the lead content
 * (except the local development sink, which may keep test leads for
 * inspection). One record per `lead:<form id>:<submission id>`:
 *
 *   { state, content_sha256, adapter, attempts, delivery_uncertain, code,
 *     receipt, created_at, updated_at }
 *
 *   intent                  about to call the adapter (written BEFORE it runs)
 *   delivered               the adapter accepted it (receipt kept)
 *   retryable_failure       not delivered; a later request may try again
 *   permanent_failure       not delivered; never retried
 *   pending_reconciliation  the outcome is unknown and resending is not safe
 *   spam_ignored            honeypot or timing trap; never delivered
 *
 * This is the durable run layer's effect pattern, narrowed to one lead:
 * intent → reconcile → perform-if-needed → receipt. A crash after the adapter
 * ran but before the receipt leaves `intent`; a later retry reconciles (test
 * sink), resends only to a destination declared to de-duplicate, or holds the
 * lead as pending_reconciliation — it never blindly resends.
 *
 * Store interface: { durable, atomic, keepLeads, get(key), create(key, record) → bool, put(key, record) }.
 */

export const LEAD_STATES = ['intent', 'delivered', 'retryable_failure', 'permanent_failure', 'pending_reconciliation', 'spam_ignored'];
export const DELIVERY_RULES = Object.freeze({ inflightMs: 30000, maxAttempts: 5 });

export const recordKey = (formId, submissionId) => `lead:${formId}:${submissionId}`;

/** Process memory. Not durable: fine for tests and a single local process, never for production. */
export function memoryStore({ keepLeads = false } = {}) {
  const map = new Map();
  const copy = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));
  return {
    kind: 'memory',
    durable: false,
    atomic: true,
    keepLeads,
    async get(key) {
      return copy(map.get(key));
    },
    async create(key, record) {
      if (map.has(key)) return false;
      map.set(key, copy(record));
      return true;
    },
    async put(key, record) {
      map.set(key, copy(record));
    },
    keys: () => [...map.keys()],
  };
}

/**
 * Cloudflare KV (a namespace bound to the Pages Function, e.g. SUMMIT_LEADS_KV).
 * Durable, but KV has no atomic put-if-absent and is eventually consistent, so
 * two truly simultaneous duplicates may both pass `create`; the Idempotency-Key
 * sent to the destination is the second line of defence. Records expire after
 * `ttlSeconds` (default 30 days).
 */
export function kvStore(namespace, { ttlSeconds = 30 * 24 * 3600 } = {}) {
  return {
    kind: 'cloudflare-kv',
    durable: true,
    atomic: false,
    keepLeads: false,
    async get(key) {
      const text = await namespace.get(key);
      return text === null || text === undefined ? null : JSON.parse(text);
    },
    async create(key, record) {
      if ((await namespace.get(key)) !== null) return false;
      await namespace.put(key, JSON.stringify(record), { expirationTtl: ttlSeconds });
      return true;
    },
    async put(key, record) {
      await namespace.put(key, JSON.stringify(record), { expirationTtl: ttlSeconds });
    },
  };
}

/**
 * What to do with a submission, given its existing record — pure.
 *
 * Returns one of:
 *   perform         call the adapter
 *   replay          already delivered: return the stored receipt, do not call
 *   replay-ignored  already ignored as spam
 *   replay-failed   already failed permanently (or exhausted its attempts): never retried
 *   in-progress     another request is delivering it right now
 *   uncertain       the previous outcome is unknown: reconcile, resend only if
 *                   the destination de-duplicates, otherwise hold
 */
export function planDelivery(record, { now, rules = DELIVERY_RULES } = {}) {
  if (!record) return 'perform';
  switch (record.state) {
    case 'delivered':
      return 'replay';
    case 'spam_ignored':
      return 'replay-ignored';
    case 'permanent_failure':
      return 'replay-failed';
    case 'intent':
      return now - Date.parse(record.updated_at) < rules.inflightMs ? 'in-progress' : 'uncertain';
    case 'retryable_failure':
      if (record.attempts >= rules.maxAttempts) return 'replay-failed';
      return record.delivery_uncertain ? 'uncertain' : 'perform';
    case 'pending_reconciliation':
      return record.attempts >= rules.maxAttempts ? 'replay-failed' : 'uncertain';
    default:
      return 'uncertain';
  }
}
