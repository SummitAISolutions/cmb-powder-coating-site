/**
 * Style boundaries between components — Pilot 0 P1-08.
 *
 * Astro scopes a component's <style> to the elements THAT component renders.
 * The starter's contract:
 *
 *   1. astro.config.mjs uses class-based scoping, so a parent can style a
 *      primitive's ROOT by passing `class` (Astro forwards its scope class).
 *   2. every primitive that accepts `class` applies it to its root element.
 *   3. no component's scoped CSS names another component's internal classes —
 *      that CSS silently never matches. Use the primitive's props, pass a class
 *      to its root, or say `:global(...)` on purpose.
 *
 * Pure functions over file text.
 */

const STYLE_RE = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
const TAG_RE = /<([A-Za-z][\w.-]*)\b((?:[^>"'{}]|"[^"]*"|'[^']*'|\{[^}]*\})*)>/g;

const stripGlobals = (css) => {
  let out = css;
  for (;;) {
    const at = out.indexOf(':global(');
    if (at < 0) return out;
    let depth = 0;
    let end = at + ':global('.length - 1;
    for (; end < out.length; end += 1) {
      if (out[end] === '(') depth += 1;
      else if (out[end] === ')' && --depth === 0) break;
    }
    out = `${out.slice(0, at)} ${out.slice(end + 1)}`;
  }
};

const selectorsOf = (css) => css
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{[^{}]*\}/g, '{}')
  .split('{}')
  .map((chunk) => chunk.replace(/@media[^{]*\{?/g, ' ').trim())
  .filter(Boolean);

const classTokens = (text) => [...String(text).matchAll(/(?:^|[^\w-])\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]);

/** Class names written in an attribute (class="…", class:list={[…]}), string literals only. */
const attributeClasses = (attributes) => {
  const found = [];
  const attr = /\bclass(?::list)?=(\{[^}]*\}|"[^"]*"|'[^']*')/.exec(attributes);
  if (!attr) return found;
  for (const literal of attr[1].matchAll(/["'`]([^"'`]*)["'`]/g)) {
    for (const name of literal[1].split(/\s+/)) if (/^[A-Za-z_][\w-]*$/.test(name)) found.push(name);
  }
  return found;
};

export function markupClasses(source) {
  const markup = String(source).replace(/^---[\s\S]*?---/, '').replace(STYLE_RE, '');
  const native = new Set();
  const component = new Set();
  for (const match of markup.matchAll(TAG_RE)) {
    const target = /^[A-Z]/.test(match[1]) || match[1].includes('.') ? component : native;
    for (const name of attributeClasses(match[2])) target.add(name);
  }
  return { native, component };
}

/**
 * files: [{ path, text }] (every .astro file under src/), config: astro.config.mjs text.
 * Returns problems (strings).
 */
export function styleBoundaryProblems(files, { config = '' } = {}) {
  const problems = [];
  if (!/scopedStyleStrategy\s*:\s*['"](class|where)['"]/.test(config)) {
    problems.push("astro.config.mjs must set scopedStyleStrategy: 'class' — with attribute scoping a parent's class on a primitive silently styles nothing");
  }
  const primitives = files.filter((file) => /src\/components\/primitives\/[^/]+\.astro$/.test(file.path));
  const internal = new Map();
  for (const file of primitives) {
    const { native, component } = markupClasses(file.text);
    // What a primitive renders: classes in its markup, and the classes its own styles target.
    const styled = [...file.text.matchAll(STYLE_RE)].flatMap((match) => selectorsOf(stripGlobals(match[2])).flatMap(classTokens));
    for (const name of [...native, ...component, ...styled]) if (!internal.has(name)) internal.set(name, file.path);
    const frontmatter = /^---([\s\S]*?)---/.exec(file.text);
    if (frontmatter && /\bclass\??:\s*string/.test(frontmatter[1]) && (file.text.match(/\bclassName\b/g) || []).length < 2) {
      problems.push(`${file.path}: accepts a class prop but never applies it to its root element`);
    }
  }
  for (const file of files) {
    const { native } = markupClasses(file.text);
    for (const match of file.text.matchAll(STYLE_RE)) {
      if (/\bis:global\b/.test(match[1])) continue;
      for (const selector of selectorsOf(stripGlobals(match[2]))) {
        for (const name of classTokens(selector)) {
          const owner = internal.get(name);
          if (owner && owner !== file.path && !native.has(name)) {
            problems.push(`${file.path}: scoped CSS ".${name}" targets an element rendered inside ${owner.split('/').pop()}, which this component's styles cannot reach — pass a class to the primitive's root, use its props, or write :global(.${name}) deliberately`);
          }
        }
      }
    }
  }
  return [...new Set(problems)];
}
