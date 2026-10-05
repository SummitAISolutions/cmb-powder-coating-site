/**
 * Summit Standard Lead Adapter v1 — the server-side entry point.
 *
 * Imported by the Pages Function (functions/api/lead.js), the local server
 * (scripts/leads/local-server.mjs) and, in summit-website-automation, by
 * validation, the lead proof and Stage 4. Browser code imports client.mjs
 * (which imports only contract.mjs), never this file.
 */

export * from './contract.mjs';
export * from './destinations.mjs';
export * from './adapters.mjs';
export * from './store.mjs';
export * from './server.mjs';
