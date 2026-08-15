import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * `npm run sounds:vendor` puts a gigabyte of drum machines in public/samples so
 * the game plays offline while it is being built. Vite copies everything under
 * public/ verbatim, which made `dist` 1.2 GB — a build nobody can deploy. The
 * engine already probes for the local kit and falls back to the network one, so
 * the deployed build simply does not carry it. public/mocap and public/land are
 * a different matter: the crowd and the terrain have no fallback, so they ship.
 */
function leaveTheSampleLibraryBehind(): Plugin {
  return {
    name: 'frequency:no-vendored-samples',
    apply: 'build',
    async closeBundle() {
      await rm(resolve(__dirname, 'dist/samples'), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  plugins: [leaveTheSampleLibraryBehind()],
  test: {
    // Git worktrees live inside the project, so their tests would otherwise be
    // collected here — main's suite must never depend on a scratch branch.
    // `.claude/worktrees` holds isolated copies of this repo while subagents work
    // in it — without this, a test run counts every copy's tests as well and the
    // numbers stop meaning anything.
    exclude: ['**/node_modules/**', '**/dist/**', '.worktrees/**', '**/.claude/**'],
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
          groups: [
            { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ },
            // Strudel and superdough were landing in whichever app chunk
            // imported them first — 721 kB filed under "TrackBuilder", which
            // both hid the real cost and meant every app-only deploy busted the
            // cache for the whole audio runtime.
            {
              name: 'strudel',
              test: /[\\/]node_modules[\\/](@strudel|superdough|zzfx)[\\/]/,
            },
          ],
        },
      },
    },
  },
});
