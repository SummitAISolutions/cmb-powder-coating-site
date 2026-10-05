/**
 * Summit lead form — BROWSER side. Progressive enhancement for LeadForm:
 * without JavaScript the form still posts to /api/lead natively.
 *
 *   - validates with the same validateFields() the server runs (contract.mjs)
 *   - submits JSON to the Summit endpoint only; it knows nothing about the
 *     destination, adapters or secrets (it imports contract.mjs and nothing else)
 *   - one submission id per distinct submission: a retry of the same values
 *     (network failure, 503, reload before confirmation) reuses the id, so the
 *     server never delivers the lead twice
 *   - bounded retries with backoff for retryable answers only
 *   - straightforward attribution: the latest UTM parameters seen in this tab
 *     session, the external referrer and the landing path. No first/multi-touch
 *     model, and no claim that attribution is complete.
 */

import { ATTRIBUTION_FIELDS, validateFields } from './contract.mjs';

const ATTRIBUTION_KEY = 'summit-lead-attribution';
const PENDING_PREFIX = 'summit-lead-pending:';
const UTM_FIELDS = ATTRIBUTION_FIELDS.filter((key) => key.startsWith('utm_'));
const RETRY_DELAYS_MS = [1000, 2000, 4000];

const ERROR_TEXT = {
  required: (label) => `${label} is required.`,
  too_long: (label) => `${label} is too long.`,
  invalid_email: () => 'Enter a valid email address.',
  invalid_phone: () => 'Enter a valid phone number.',
  invalid_option: () => 'Choose one of the options.',
  invalid_type: (label) => `${label} is not valid.`,
  consent_required: () => 'Please confirm to continue.',
};

function readJson(storage, key) {
  try {
    const text = storage && storage.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    if (storage) storage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable (private mode); attribution is best effort */
  }
}

function removeKey(storage, key) {
  try {
    if (storage) storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const sessionStorageOf = (win) => {
  try {
    return win.sessionStorage;
  } catch {
    return null;
  }
};

/** Record attribution for this tab session and return it (always all keys). */
export function captureAttribution(win) {
  const storage = sessionStorageOf(win);
  const stored = readJson(storage, ATTRIBUTION_KEY) || {};
  if (!stored.landing_page) {
    stored.landing_page = String(win.location.pathname || '/').slice(0, 300);
    try {
      const referrer = win.document.referrer ? new URL(win.document.referrer) : null;
      if (referrer && ['http:', 'https:'].includes(referrer.protocol) && referrer.origin !== win.location.origin) stored.referrer = `${referrer.origin}${referrer.pathname}`.slice(0, 300);
    } catch {
      /* an unparsable referrer is simply not recorded */
    }
  }
  const params = new URLSearchParams(win.location.search || '');
  const utm = Object.fromEntries(UTM_FIELDS.map((key) => [key, params.get(key)]).filter(([, value]) => value));
  if (Object.keys(utm).length > 0) {
    for (const key of UTM_FIELDS) delete stored[key];
    for (const [key, value] of Object.entries(utm)) stored[key] = value.slice(0, 300);
  }
  writeJson(storage, ATTRIBUTION_KEY, stored);
  return Object.fromEntries(ATTRIBUTION_FIELDS.map((key) => [key, typeof stored[key] === 'string' ? stored[key] : null]));
}

function newSubmissionId(win) {
  if (win.crypto && typeof win.crypto.randomUUID === 'function') return win.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  win.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Attach to one rendered LeadForm. Returns { submit } for tests. `options`
 * may inject win, fetch, now and sleep.
 */
export function attachLeadForm(form, options = {}) {
  const win = options.win || window;
  const fetchFn = options.fetch || win.fetch.bind(win);
  const now = options.now || (() => Date.now());
  const sleep = options.sleep || ((ms) => new Promise((resolve) => win.setTimeout(resolve, ms)));
  const contract = JSON.parse(form.querySelector('script[data-lead-contract]').textContent);
  const storage = sessionStorageOf(win);
  const status = form.querySelector('[data-lead-status]');
  const hidden = (name) => form.querySelector(`input[type="hidden"][name="${name}"]`);
  const startedAt = now();
  if (hidden('started_at')) hidden('started_at').value = String(startedAt);
  form.noValidate = true;
  captureAttribution(win);
  let sending = false;

  const setState = (state, message) => {
    form.setAttribute('data-lead-state', state);
    if (status) status.textContent = message === undefined ? status.getAttribute(`data-message-${state}`) || '' : message;
  };

  const clearErrors = () => {
    for (const element of form.querySelectorAll('[data-lead-error-for]')) {
      element.textContent = '';
      element.hidden = true;
      const control = form.querySelector(`[name="${element.getAttribute('data-lead-error-for')}"]`);
      if (control) {
        control.removeAttribute('aria-invalid');
        const describedBy = (control.getAttribute('aria-describedby') || '').split(' ').filter((id) => id && id !== element.id);
        if (describedBy.length) control.setAttribute('aria-describedby', describedBy.join(' '));
        else control.removeAttribute('aria-describedby');
      }
    }
  };

  const showErrors = (errors) => {
    let first = null;
    for (const error of errors) {
      const field = contract.fields.find((entry) => entry.name === error.field);
      const label = field ? field.label : error.field === 'consent' ? 'Consent' : 'This field';
      const element = form.querySelector(`[data-lead-error-for="${error.field}"]`);
      const control = form.querySelector(`[name="${error.field}"]`);
      if (element) {
        element.textContent = (ERROR_TEXT[error.code] || ERROR_TEXT.invalid_type)(label);
        element.hidden = false;
      }
      if (control) {
        control.setAttribute('aria-invalid', 'true');
        if (element && element.id) control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), element.id].filter(Boolean).join(' '));
        if (!first) first = control;
      }
    }
    if (first && typeof first.focus === 'function') first.focus();
  };

  const collect = () => {
    const values = {};
    for (const field of contract.fields) {
      const control = form.querySelector(`[name="${field.name}"]`);
      values[field.name] = field.type === 'checkbox' ? Boolean(control && control.checked) : control ? control.value : '';
    }
    const consentControl = form.querySelector('input[name="consent"]');
    return { values, consent: contract.consent ? Boolean(consentControl && consentControl.checked) : undefined };
  };

  async function submit() {
    if (sending) return;
    clearErrors();
    const { values, consent } = collect();
    const errors = validateFields(values, contract).errors;
    if (contract.consent && contract.consent.required && !consent) errors.push({ field: 'consent', code: 'consent_required' });
    if (errors.length > 0) {
      showErrors(errors);
      setState('invalid');
      return;
    }

    const fingerprint = JSON.stringify({ values, consent });
    const pendingKey = `${PENDING_PREFIX}${contract.form_id}`;
    let pending = readJson(storage, pendingKey);
    if (!pending || pending.fingerprint !== fingerprint) {
      pending = { fingerprint, submission_id: newSubmissionId(win), submitted_at: new Date(now()).toISOString() };
      writeJson(storage, pendingKey, pending);
    }
    const honeypot = form.querySelector(`input[name="${contract.honeypot}"]`);
    const payload = {
      contract: contract.contract,
      form_id: contract.form_id,
      route_id: contract.route_id,
      page_path: contract.page_path,
      site_env: hidden('site_env') ? hidden('site_env').value : undefined,
      submission_id: pending.submission_id,
      submitted_at: pending.submitted_at,
      started_at: String(startedAt),
      fields: values,
      ...(contract.consent ? { consent } : {}),
      attribution: captureAttribution(win),
      [contract.honeypot]: honeypot ? honeypot.value : '',
    };

    sending = true;
    setState('sending');
    try {
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        let response = null;
        let body = null;
        try {
          response = await fetchFn(contract.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload), credentials: 'same-origin' });
          body = await response.json().catch(() => null);
        } catch {
          response = null;
        }
        if (response && response.status === 200 && body && body.ok) {
          removeKey(storage, pendingKey);
          form.reset();
          setState('received');
          form.dispatchEvent(new CustomEvent('summit:lead', { detail: { status: 'received', submission_id: body.submission_id } }));
          return;
        }
        if (response && [400, 422].includes(response.status) && body && Array.isArray(body.errors)) {
          showErrors(body.errors);
          setState('invalid');
          return;
        }
        if (response && response.status === 202 && body && body.status === 'pending') {
          setState('pending');
          return;
        }
        const retryable = !response || response.status === 503 || (response.status === 202 && body && body.retryable);
        if (!retryable || attempt === RETRY_DELAYS_MS.length) {
          setState('failed');
          return;
        }
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    } finally {
      sending = false;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });
  return { submit, contract };
}
