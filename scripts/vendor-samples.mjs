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

/**
 * §114: the machines the six documents name. Matched case-INSENSITIVELY —
 * the maps key them as `RolandTR909_bd` while these are written lower case,
 * so the old comparison silently matched nothing and `--used` vendored an
 * empty library.
 */
const MACHINES = [
  'rolandtr909', 'rolandtr808', 'rolandtr707', 'akaimpc60', 'akaixr10',
  'emusp12', 'alesishr16', 'korgddm110', 'rolandcompurhythm1000',
  'rolandcompurhythm8000', 'sakatadpm48', 'oberheimdmx', 'linndrum',
  'linnlm1', 'rolandr8', 'yamahary30', 'sequentialcircuitsdrumtracks',
];
/**
 * The instruments the documents name. These live in VCSL, NOT in the drum
 * map — which is why a vendored checkout had every kit and no voices (§113).
 */
const INSTRUMENTS = [
  'piano', 'organ_full', 'glockenspiel', 'vibraphone', 'marimba', 'harp',
  'harmonica', 'sax', 'timpani', 'tubularbells', 'cabasa', 'clavisynth',
];

const ONLY_USED = process.argv.includes('--used');
const wanted = (name) => {
  if (!ONLY_USED) return true;
  const lower = name.toLowerCase();
  return MACHINES.some((m) => lower.startsWith(`${m}_`)) || INSTRUMENTS.includes(lower);
};

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
    // §114: VCSL nests its instruments — `{ marimba: { hard: [...], soft:
    // [...] } }` — so treating a value as a flat list dropped every one of
    // them without a word. That is why a vendored checkout had all the kits
    // and none of the voices. Take every string leaf, however deep.
    const paths = [];
    const collect = (node) => {
      if (typeof node === 'string') paths.push(node);
      else if (Array.isArray(node)) node.forEach(collect);
      else if (node !== null && typeof node === 'object') Object.values(node).forEach(collect);
    };
    collect(value);
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
