import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://realnik.co.uk',
  trailingSlash: 'always',
  build: { format: 'directory' },
  server: { port: 4321 },

  markdown: { shikiConfig: { theme: 'github-dark-default' } }
});
