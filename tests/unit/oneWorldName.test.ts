import { describe, expect, it } from 'vitest';

/**
 * §186: the machine world is called `locked-groove`. It used to be called
 * `techno`, and the rename is the kind that comes back — a stale table, a
 * revived branch, a copied snippet — and comes back SILENTLY, because
 * `validate()` reads an unknown genre as null rather than as an error.
 *
 * So the old name is not allowed to exist in `src/` at all, with exactly two
 * exceptions, both listed below and both deliberate.
 */

const SOURCES: Record<string, string> = import.meta.glob('../../src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** `../../src/genres/ActiveWorlds.ts` → `genres/ActiveWorlds.ts` */
const relative = (path: string): string => path.replace('../../src/', '');

/**
 * `migrations.ts` is the ONE file that must still know the old name: it is what
 * turns an old save into a current one. If this exception ever disappears,
 * every save written before the rename silently loses its world.
 */
const MIGRATION_FILE = 'persistence/migrations.ts';

/**
 * A separate naming space that happens to use the same word: `techno` is also a
 * HAT STYLE, a texture name and a pair of layer ids — drum vocabulary, not a
 * world. Renaming those is its own change with its own tests; until then they
 * are listed here one by one so nothing else can hide among them.
 */
const DRUM_VOCABULARY: Record<string, number> = {
  'audio/MusicalPrimitives.ts': 4, // hat style union member + field, two layer ids
  'audio/StrudelEngine.ts': 2, // texture name, hat style case
};

describe('§186 the machine world has one name', () => {
  it('finds the old name nowhere in src/ except the migration and the drum vocabulary', () => {
    const offenders: string[] = [];
    for (const [path, source] of Object.entries(SOURCES)) {
      const file = relative(path);
      if (file === MIGRATION_FILE) continue;
      const allowed = DRUM_VOCABULARY[file] ?? 0;
      const hits = source.match(/techno/gi)?.length ?? 0;
      if (hits > allowed) offenders.push(`${file}: ${hits} hits, ${allowed} allowed`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the migration as the one place that still knows the old name', () => {
    // Not just "may contain" — MUST contain. Deleting it would strand every
    // save written before the rename, and nothing would report it.
    const migration = Object.entries(SOURCES).find(([path]) => relative(path) === MIGRATION_FILE);
    expect(migration?.[1]).toContain('techno');
  });

  it('scans a real tree, so the guard cannot pass by finding nothing', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
    expect(Object.keys(SOURCES).map(relative)).toContain('genres/ActiveWorlds.ts');
  });
});
