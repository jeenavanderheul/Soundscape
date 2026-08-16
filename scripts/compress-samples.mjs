/**
 * §202: make the vendored kit small enough to SHIP.
 *
 * `npm run sounds:vendor:used` fetches only the sounds the grammars can utter,
 * and that is still 296 MB, because the sources are uncompressed WAV — a single
 * saxophone note is 2.3 MB. Nobody can host that, and until now the deployed
 * build simply left the kit behind and let every visitor pull drums from a
 * stranger's GitHub. That is the thing this fixes.
 *
 * Vorbis at q4, measured against the strictest case (a TR909 kick, where any
 * encoder padding would smear the transient): 80 KB -> 9 KB, duration
 * unchanged, and the browser decodes the peak to the SAME SAMPLE INDEX. MP3
 * was rejected for exactly that reason — its 30 ms of padding moves the hit.
 *
 * The map is rewritten alongside the audio, so `strudel.json` never points at
 * a file that is not there.
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const FFMPEG =
  process.env.FFMPEG ??
  '/private/tmp/claude-501/-Users-jeenavanderheul-Documents-00-AI-APPS-Soundscape/acd23159-9296-47c5-ae49-db349aef3b96/scratchpad/node_modules/static-ffmpeg/bin/mac/x64/ffmpeg';

const ROOT = 'public/samples';
const MAP = join(ROOT, 'strudel.json');
const QUALITY = process.env.OGG_QUALITY ?? '4';

if (!existsSync(FFMPEG)) {
  console.error(`ffmpeg not found at ${FFMPEG}. Set FFMPEG=/path/to/ffmpeg.`);
  process.exit(1);
}

const map = JSON.parse(await readFile(MAP, 'utf8'));
const base = map._base ?? '/samples/';

/** Every string in the map is a path; the shapes around them vary (§114). */
function paths(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) paths(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) paths(v, out);
  return out;
}

function rewrite(value, done) {
  if (typeof value === 'string') return done.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => rewrite(v, done));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v, done)]));
  }
  return value;
}

const all = new Set();
for (const [name, value] of Object.entries(map)) {
  if (name.startsWith('_')) continue;
  for (const p of paths(value)) all.add(p);
}

let converted = 0;
let skipped = 0;
let before = 0;
let after = 0;
const done = new Map();
const files = [...all];

for (let i = 0; i < files.length; i++) {
  const rel = files[i];
  const src = join('public', base.replace(/^\//, ''), rel);
  if (!existsSync(src)) {
    skipped += 1;
    continue;
  }
  // Already compressed at the source: leave it alone rather than re-encode.
  if (/\.(ogg|mp3|opus|m4a)$/i.test(rel)) {
    done.set(rel, rel);
    skipped += 1;
    continue;
  }
  const out = rel.replace(/\.[^.]+$/, '.ogg');
  const dst = join('public', base.replace(/^\//, ''), out);
  await mkdir(dirname(dst), { recursive: true });
  const { size: sizeBefore } = await import('node:fs').then((fs) => fs.promises.stat(src));
  await run(FFMPEG, ['-y', '-i', src, '-c:a', 'libvorbis', '-q:a', QUALITY, '-ar', '44100', dst]);
  const { size: sizeAfter } = await import('node:fs').then((fs) => fs.promises.stat(dst));
  before += sizeBefore;
  after += sizeAfter;
  await rm(src);
  done.set(rel, out);
  converted += 1;
  if (converted % 100 === 0) console.log(`  ${converted}/${files.length} …`);
}

const next = { _base: base };
for (const [name, value] of Object.entries(map)) {
  if (name.startsWith('_')) continue;
  next[name] = rewrite(value, done);
}
await writeFile(MAP, `${JSON.stringify(next, null, 0)}\n`);

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
console.log(
  `compressed ${converted} files (${skipped} left as they were): ${mb(before)} -> ${mb(after)}`,
);
