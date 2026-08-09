import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // three dominates bundle size; isolating it keeps the app chunk small
        // and lets the browser cache three across app-only deploys (§22).
        // Vite 8 bundles with rolldown, whose chunking API is advancedChunks.
        advancedChunks: {
          groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
});
