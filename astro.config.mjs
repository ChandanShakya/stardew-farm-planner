import { defineConfig } from 'astro/config';

// Static output: deploy dist/ to Cloudflare Pages (or any static host).
// `npm run build` also writes dist/farm-planner.html — one self-contained offline file.
export default defineConfig({
  output: 'static',
  build: { inlineStylesheets: 'always', assets: '_astro' },
  // SINGLE=1 builds the offline single-file variant: everything (incl. the lazily loaded 3D view)
  // in one script so scripts/inline.mjs can embed it into one HTML file.
  outDir: process.env.SINGLE ? 'dist-single' : 'dist',
  vite: {
    build: {
      assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 4000,
      rollupOptions: process.env.SINGLE ? { output: { inlineDynamicImports: true } } : {},
    },
    worker: { format: 'es' },
  },
});
