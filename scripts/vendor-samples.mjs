/**
 * §43: bring the sounds the game actually plays in-house.
 *
 * Downloads EVERY sound in the maps the engine loads into public/samples/
 * and writes a strudel.json pointing at them, so the game runs entirely
 * offline and never depends on a third-party repository staying online.
 *
 * This is gigabytes. public/samples/ is therefore git-ignored: the script is
 * the reproducible way to get it back, not the repository.
 *
 * Pass --used to vendor only the sounds the grammars can actually utter
 * (~80 MB) instead of the whole library.
 *
 * Run: npm run sounds:vendor
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = new URL('../public/samples/', import.meta.url);

const SOURCES = [
  'https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json',
  'https://raw.githubusercontent.com/felixroos/dough-samples/main/vcsl.json',
  'https://raw.githubusercontent.com/felixroos/dough-samples/main/EmuSP12.json',
  'https://raw.githubusercontent.com/felixroos/dough-samples/main/Dirt-Samples.json',
  'https://raw.githubusercontent.com/felixroos/dough-samples/main/piano.json',
];

/** The machines the grammars name (§37) — everything else stays remote. */
const MACHINES = [
  'rolandtr909', 'rolandtr808', 'rolandtr707', 'akaimpc60', 'emusp12',
  'alesishr16', 'korgddm110', 'rolandcompurhythm1000', 'rolandcompurhythm8000',
  'sakatadpm48', 'oberheimdmx', 'linndrum', 'linnlm1', 'rolandr8',
];
/** The instruments the templates name (§34, §37). */
const INSTRUMENTS = [
  'piano', 'organ_full', 'glockenspiel', 'vibraphone', 'marimba', 'harp',
  'harmonica', 'sax', 'timpani', 'tubularbells', 'cabasa',
];

const ONLY_USED = process.argv.includes('--used');
const wanted = (name) =>
  !ONLY_USED || MACHINES.some((m) => name.startsWith(`${m}_`)) || INSTRUMENTS.includes(name);

const map = {};
let files = 0;
let bytes = 0;

for (const source of SOURCES) {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`${response.status} ${source}`);
  const json = await response.json();
  const base = json._base ?? '';
  for (const [name, value] of Object.entries(json)) {
    if (name.startsWith('_')) continue;
    if (!wanted(name.toLowerCase())) continue;
    const paths = Array.isArray(value) ? value : [value];
    const local = [];
    for (const path of paths) {
      if (typeof path !== 'string') continue;
      const url = path.startsWith('http') ? path : base + path;
      const relative = `${name}/${url.split('/').pop()}`;
      const target = new URL(relative, OUT);
      if (!existsSync(target)) {
        const audio = await fetch(url);
        if (!audio.ok) {
          console.warn(`  skip ${relative} (${audio.status})`);
          continue;
        }
        const buffer = Buffer.from(await audio.arrayBuffer());
        mkdirSync(dirname(target.pathname), { recursive: true });
        writeFileSync(target, buffer);
        bytes += buffer.length;
      }
      local.push(relative);
      files++;
    }
    if (local.length > 0) map[name] = local;
  }
  console.log(`${source.split('/').pop()} → ${Object.keys(map).length} names so far`);
}

map._base = '/samples/';
mkdirSync(OUT.pathname, { recursive: true });
writeFileSync(new URL('strudel.json', OUT), JSON.stringify(map, null, 0));
console.log(`vendored ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB, ${Object.keys(map).length - 1} sound names`);
