import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://realnik.co.uk',
  // Generates sitemap-index.xml from the built routes, so adding a page can
  // never leave the sitemap (or its dates) stale.
  integrations: [
    sitemap({
      // The whole site is rebuilt together, so the build time is a truthful
      // lastmod. The hand-rolled sitemap this replaced carried a hardcoded
      // date that would have silently aged.
      serialize: (item) => ({ ...item, lastmod: new Date().toISOString() }),
    }),
  ],
  trailingSlash: 'always',
  build: { format: 'directory' },
  server: { port: 4321 },

  markdown: { shikiConfig: { theme: 'github-dark-default' } }
});
