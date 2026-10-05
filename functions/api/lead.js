/**
 * Cloudflare Pages Function: POST /api/lead — the Summit lead endpoint.
 *
 * Deployed with the static site by `wrangler pages deploy` (Stage 3 runs it
 * from the repository root, where this functions/ directory lives). All logic
 * is in src/lib/leads/server.mjs; this file only binds the platform:
 *
 *   SUMMIT_LEAD_ENV     "production" to deliver real leads; unset = preview
 *                       (every submission goes to the test sink)
 *   SUMMIT_LEADS_KV     optional KV namespace binding: the durable idempotency
 *                       store. REQUIRED for production (the endpoint refuses to
 *                       deliver without a durable store). Never created by Summit
 *                       automation; an operator binds it.
 *   destination secrets the environment variables named in search/site.json
 *                       (e.g. SUMMIT_LEAD_WEBHOOK_URL), set as Pages secrets
 *
 * Nothing here is imported by browser code.
 */
import site from '../../search/site.json' with { type: 'json' };
import entity from '../../search/business-entity.json' with { type: 'json' };
import { handleLeadRequest, kvStore, memoryStore } from '../../src/lib/leads/index.mjs';

// Per-isolate fallback for previews without a KV binding. Not durable.
const previewStore = memoryStore();

export async function onRequest({ request, env }) {
  const store = env && env.SUMMIT_LEADS_KV ? kvStore(env.SUMMIT_LEADS_KV) : previewStore;
  return handleLeadRequest(request, {
    env: env || {},
    site,
    entity,
    store,
    log: (event) => console.log(JSON.stringify(event)),
  });
}
