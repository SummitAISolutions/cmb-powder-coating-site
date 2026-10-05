// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Static output only: `npm run build` writes dist/, which the Stage 3
// Cloudflare preview deployer detects and publishes as-is.
export default defineConfig({
  output: 'static',
  // A parent may style a primitive's ROOT by passing `class`: with class-based
  // scoping Astro forwards the parent's scope class through the `class` prop,
  // which every primitive applies to its root element. (The default, attribute
  // scoping, silently drops those styles — Pilot 0 P1-08.) A primitive's
  // internals are its own; reach them only through its props.
  scopedStyleStrategy: 'class',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
