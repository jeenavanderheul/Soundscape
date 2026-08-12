import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    // Git worktrees live inside the project, so their tests would otherwise be
    // collected here — main's suite must never depend on a scratch branch.
    exclude: ['**/node_modules/**', '**/dist/**', '.worktrees/**'],
  },
  build: {
    rollupOptions: {
      // §68: the game, plus the genre lab at /genres/ — a bench where every
      // world plays as a finished track so its grammar can be judged.
      input: {
        main: resolve(__dirname, 'index.html'),
        genres: resolve(__dirname, 'genres/index.html'),
      },
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
