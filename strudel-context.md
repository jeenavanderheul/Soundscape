# Strudel — AI Agent Context

Strudel is a JavaScript port of the TidalCycles live-coding language for making music with code in the browser. You write patterns as chained function calls; the best place to run them is the Strudel REPL at https://strudel.cc. Press Ctrl+Enter to play/update, Ctrl+. to stop. Everything below is the operational knowledge needed to write valid, musical Strudel code.

## 1. Core Mental Model

- Music is organized in **cycles**, not bars. A cycle is the fundamental unit of time.
- Default tempo is **0.5 CPS (cycles per second)** = 1 cycle every 2s = 30 cycles per minute (CPM).
- The **content of a sequence is squished into one cycle**. Adding notes makes each note shorter, not the cycle longer.
- Tempo control:
  - \`setcpm(n)\` sets cycles per minute. \`setcps(n)\` sets cycles per second. \`setcpm(x)\` == \`setcps(x/60)\`.
  - To convert BPM: \`setcpm(BPM/beatsPerCycle)\`, e.g. 4/4 at 110bpm -> \`setcpm(110/4)\`.
- Strudel has **no concept of bars/measures**; you express meter by how many elements you put per cycle.

## 2. Syntax Basics

- A pattern is written as chained functions: \`note("c a f e").s("piano").room(.5)\`.
- Quotes matter:
  - \`"double quotes"\` -> parsed as **Mini-Notation** (single line).
  - backticks -> Mini-Notation across **multiple lines**.
  - \`'single quotes'\` -> a **plain string**, NOT parsed as Mini-Notation.
- \`//\` is a line comment (Cmd+/ toggles). Convention: \`@by\`, \`@license\`, \`@version\` are metadata comments.
- Custom reusable chains: \`const myFx = register('myFx', pat => pat.s("sawtooth").room(.5)); note("a3").myFx()\`.

## 3. Mini-Notation (the rhythm/pattern language)

Used inside functions like \`sound()\`, \`note()\`, \`n()\`.

| Concept | Syntax | Example |
|---|---|---|
| Sequence | space | \`sound("bd bd sd hh")\` |
| Sample number | \`:x\` | \`sound("hh:0 hh:1 hh:2")\` |
| Rest / silence | \`~\` or \`-\` | \`sound("bd ~ sd -")\` |
| Sub-sequence | \`[ ]\` | \`sound("bd [hh hh] sd")\` |
| Deeper nesting | \`[[ ]]\` | \`sound("bd [[rim rim] hh]")\` |
| Speed up (fast) | \`*\` | \`sound("bd sd*2 cp*3")\` |
| Slow down | \`/\` | \`note("[c a f e]/2")\` |
| Parallel / chord | \`,\` | \`sound("bd*2, hh*4")\` |
| Alternate (one per cycle) | \`< >\` | \`sound("<bd hh sd>")\` |
| Elongate (weight) | \`@n\` or \`_\` | \`note("c@3 e")\` (c is 3x long) |
| Replicate (repeat, no speedup) | \`!n\` | \`note("c!3 e")\` |
| Random drop (50%, or ?p) | \`?\` | \`note("[c e g]*8?0.3")\` |
| Random choice per event | \`|\` | \`note("c | e | g")\` |
| Euclidean rhythm | \`(beats,steps,offset)\` | \`s("bd(3,8)")\` or \`s("bd(3,8,2)")\` |
| Polymeter | \`{ }%n\` | \`note("{c eb g}%4")\` == \`<c eb g>*4\` |
| Foot (divide equal parts) | \`.\` | \`"1 6 7 8 . 2 . 3"\` == \`"[1 6 7 8] 2 3"\` |

- \`<a b c>\` is shorthand for \`[a b c]/3\` (length = number of items).
- \`<a b c>*8\` plays 8 per cycle but tempo is stable when you add/remove items.
- Euclidean: "3 beats over 8 steps" e.g. \`bd(3,8)\` = \`bd ~ ~ bd ~ ~ bd ~\`.

## 4. Sounds & Samples

- \`sound(...)\` (alias \`s(...)\`) plays a named sound. \`note\`+no sound defaults to \`triangle\`.
- Drum abbreviations: \`bd\` (bass/kick), \`sd\` (snare), \`rim\` (rimshot), \`cp\` (clap), \`hh\` (closed hat), \`oh\` (open hat), \`cr\` (crash), \`rd\` (ride), \`ht/mt/lt\` (high/mid/low tom), \`sh\` (shaker), \`cb\` (cowbell), \`tb\` (tambourine), \`perc\`, \`misc\`, \`fx\`.
- \`.bank("RolandTR909")\` selects a drum machine. Others: \`RolandTR808\`, \`RolandTR707\`, \`AkaiLinn\`, \`RhythmAce\`, \`ViscoSpaceDrum\`, etc. \`bank\` prepends the machine name (e.g. \`RolandTR808_bd\`).
- Sample selection: \`s("hh:2")\` or \`n("2").s("hh")\` picks sample index (0-based, wraps around).
- \`n(...)\` selects the nth sample from a bank OR the nth degree of a scale. \`n\` and \`note\` are NOT aliases; \`s\` and \`sound\` ARE aliases.
- Loading custom samples:
  - \`samples({ name: 'path.wav', ... }, 'https://baseurl/')\`
  - \`samples('github:user/repo')\` (expects strudel.json at repo root; \`github:user/repo/branch\` for a branch)
  - \`samples('https://.../strudel.json')\`
  - Local: "import sounds folder" button, or \`npx @strudel/sampler\` served at \`http://localhost:5432/\`.
  - \`shabda:bass:4,hihat:4\` queries freesound.org; \`shabda/speech/fr-FR/m:magnifique\` for TTS.
- Pitched samples: \`samples({ moog: { g3: 'file.wav' } }, ...)\` -- sampler picks closest pitch.

### Sampler effects
\`begin\`/\`end\` (playback region), \`loop(1)\`, \`loopBegin\`/\`loopEnd\` (\`loopb\`/\`loope\`), \`cut(group)\` (mute same cut group), \`clip\`/\`legato\` (duration multiplier), \`loopAt(cycles)\`, \`fit()\`, \`chop(n)\` (granular slices), \`striate(n)\`, \`slice(n, "pattern")\`, \`splice(n, "pattern")\` (slice + speed-match), \`scrub\`, \`speed(n)\` (negative = reverse). Note: samples prefixed \`wt_\` auto-loop as wavetables.

## 5. Notes, Pitch & Scales

- \`note("c e g")\` -- letters \`a\`-\`g\`, accidentals \`#\`/\`b\` (e.g. \`c#\`, \`eb\`), octave number (e.g. \`c3\`, default octave 3). Also accepts MIDI numbers: \`note("48 52 55")\`. Decimals allowed (\`55.5\`).
- Pitch theory: doubling frequency = +1 octave; octave = 12 semitones; MIDI 69 = A4 = 440Hz. \`freq(440)\` plays raw frequency.
- \`n("0 2 4").scale("C:minor")\` -- scale degrees (0-indexed). Negative numbers wrap backward; \`#\`/\`b\` shift outside scale.
- Scale format: \`root:type\` with NO spaces (use \`:\` for spaces). e.g. \`C:major\`, \`A2:minor:pentatonic\`, \`D:dorian\`, \`G:mixolydian\`, \`C:ritusen\`, \`C:chromatic\`. Root defaults to octave 3.
- \`$:\` prefix plays patterns in parallel (a "stack" line). \`_$:\` mutes that line.

### Tonal functions
- \`voicing()\` turns chord symbols into voiced chords with smooth voice leading.
- \`chord("<C^7 Am7 Dm7 G7>").voicing()\` -- chord symbols (ireal-style: \`^\`=major7, \`-\`=minor, \`+\`=aug, \`o\`=dim, \`h\`=half-dim, \`sus\`, \`9\`,\`13\`,\`7b9\`, etc.).
- \`.dict('ireal')\` or \`.dict('lefthand')\` selects voicing dictionary; \`addVoicings('name', {...})\` for custom.
- \`.anchor("c5")\` + \`.mode("below"|"above"|"duck"|"root")\` control voicing alignment.
- \`transpose("<0 -2 5>")\` (semitones or interval notation like \`1P -2M 3m\`); \`scaleTranspose(steps)\`; \`rootNotes(octave)\`.

## 6. Audio Effects

Signal chain order (single-use effects override if repeated): stretch -> gain/ADSR -> lpf -> hpf -> bandpass -> vowel -> coarse -> crush -> shape -> distort -> tremolo -> compressor -> pan -> phaser -> postgain -> (dry/sends/delay/room) -> orbit -> duck -> mixer.

### Filters
- \`lpf\` (alias \`cutoff\`, \`lp\`) low-pass; \`lpq\` (\`resonance\`) 0-50. Mini: \`lpf("1000:10")\` = cutoff:q.
- \`hpf\` (\`hp\`) high-pass + \`hpq\`; \`bpf\` (\`bandf\`) band-pass + \`bpq\`.
- \`ftype("<12db ladder 24db>")\` filter type. \`vowel("<a e i o u>")\` formant filter.

### Envelopes (ADSR)
- Amplitude: \`attack\`/\`att\`, \`decay\`/\`dec\`, \`sustain\`/\`sus\`, \`release\`/\`rel\`. Shorthand \`adsr(".1:.1:.5:.2")\`.
- Filter envelopes: \`lpa lpd lps lpr lpenv\` (also \`hp*\`, \`bp*\`). \`lpenv\` = modulation depth.
- Pitch envelope: \`pattack\`/\`patt\`, \`pdecay\`/\`pdec\`, \`prelease\`/\`prel\`, \`penv\` (semitones), \`pcurve\` (0 lin/1 exp), \`panchor\`.

### Dynamics / space
- \`gain\`, \`velocity\`/\`vel\`, \`compressor("threshold:ratio:knee:attack:release")\`, \`postgain\`, \`xfade\`.
- \`pan(0..1)\`, \`jux(fn)\` (apply fn to right channel only), \`juxBy(amount, fn)\`.
- \`delay(level)\` / \`delaytime\`(\`dt\`) / \`delayfeedback\`(\`dfb\`). Mini: \`delay("0.5:0.25:0.7")\` = level:time:feedback.
- \`room(level)\` reverb / \`roomsize\`(\`rsize\`,\`sz\`,\`size\`) / \`roomfade\` / \`roomlp\` / \`roomdim\` / \`iresponse\`(\`ir\`).
- \`phaser(speed)\` + \`phaserdepth\`/\`phasercenter\`/\`phasersweep\`.
- Distortion: \`coarse\` (samplerate reduce), \`crush(1..16)\` (bitcrush), \`shape\`, \`distort("amount:postgain:type")\`.
- Amplitude mod / tremolo: \`tremolosync\`(\`tremsync\`), \`tremolodepth\`, \`tremoloskew\`, \`tremoloshape\`.
- Vibrato: \`vib(hz)\` / \`vibmod(semitones)\`; mini \`vib("4:0.1")\`.

### Orbits & ducking
- \`orbit(n)\` (alias \`o\`): global FX context. Patterns sharing an orbit share ONE delay+reverb -- put conflicting reverbs on different orbits. Default orbit is 1.
- \`duckorbit\`(\`duck\`) + \`duckattack\`(\`datt\`) + \`duckdepth\` create sidechain-style ducking on a target orbit.

## 7. FM & Additive Synthesis

- Waveforms: \`sine\`, \`sawtooth\`(\`saw\`), \`square\`, \`triangle\`. Noise: \`white\`, \`pink\`, \`brown\`; \`crackle\` + \`density\`; \`.noise(0.25)\` adds pink noise.
- FM: \`fm(index)\`, \`fmh\` (harmonicity ratio), \`fmattack\`/\`fmdecay\`/\`fmsustain\`/\`fmenv\` (per-op suffix 1-8, e.g. \`fmh2\`).
- Additive: \`partials([...])\` (harmonic magnitudes), \`phases([...])\`.
- Wavetable: \`s("wt_flute")\` (any \`wt_\`-prefixed sample), scan with \`loopBegin\`/\`loopEnd\`. \`samples('bubo:waveforms')\`.
- ZZFX synth: \`s("z_sawtooth" | "z_sine" | "z_square" | "z_tan" | "z_noise")\` with params \`curve\`, \`slide\`, \`deltaSlide\`, \`zmod\`, \`zcrush\`, \`zdelay\`, \`pitchJump\`, \`lfo\`, \`tremolo\`, \`zrand\`.
- Visualize a synth with \`._scope()\` / \`._spectrum()\`.

## 8. Time Modifiers

- \`fast(n)\` (\`density\`, mini \`*\`), \`slow(n)\` (\`sparsity\`, mini \`/\`).
- \`early(cycles)\` / \`late(cycles)\` -- nudge earlier/later.
- \`rev()\` reverse; \`palindrome()\` alternate fwd/back; \`iter(n)\` / \`iterBack(n)\` rotate subdivisions each cycle.
- \`ply(n)\` repeat each event n times; \`segment(n)\`/\`seg\` sample a continuous pattern into n discrete events.
- \`euclid(3,8)\`, \`euclidRot(3,8,1)\`, \`euclidLegato(3,8)\`.
- \`compress(start,end)\`, \`zoom(start,end)\`, \`linger(fraction)\`, \`fastGap(n)\`, \`inside(n,fn)\`, \`outside(n,fn)\`.
- \`cpm(n)\`, \`ribbon(offset,cycles)\` (loop a slice of time), \`swingBy(x,n)\`, \`swing(n)\` (= swingBy 1/3).
- \`clip\`/\`legato\` (duration multiplier, cuts samples).

## 9. Pattern Constructors (Factories)

| Function | Mini equivalent |
|---|---|
| \`cat\`/\`slowcat(a,b)\` | \`<a b>\` (one per cycle) |
| \`seq\`/\`fastcat(a,b)\` | \`a b\` (crammed into 1 cycle) |
| \`stack\`/\`polyrhythm\`/\`pr(a,b)\` | \`a,b\` (parallel) |
| \`stepcat\`/\`timecat([3,a],[2,b])\` | \`a@3 b@2\` |
| \`polymeter\`/\`pm(a,b)\` | \`{a,b}\` |
| \`polymeterSteps(n,...)\` | \`{...}%n\` |
| \`silence\` | \`~\` |

- \`run(n)\` -> \`0 1 2 ... n-1\`. \`binary(n)\` / \`binaryN(n, bits)\` -> binary structure patterns.
- \`arrange([cycles, pattern], ...)\` sequences patterns over multiple cycles (great for song structure).

## 10. Control Parameters & Operators

- Every param (\`note\`, \`s\`, \`gain\`, \`cutoff\`, \`pan\`...) is controlled independently and can itself be a pattern.
- Chained param wrapping: \`cat('c','e','g').note()\` == \`note(cat('c','e','g'))\`.
- Operators (modify values): \`add\`, \`sub\`, \`mul\`, \`div\`, \`mod\`, \`round\`, \`floor\`, \`ceil\`.
  - \`n("0 2 4".add("<0 3>")).scale("C:major")\` -- add works on notes/numbers.
- Ranges (for signals): \`range(min,max)\` (unipolar 0-1), \`rangex\` (exponential), \`range2\` (bipolar -1-1).
- \`ratio("1, 5:4, 3:2").mul(110).freq()\` -- just-intonation ratios.
- \`.as("note:clip")\` sets multiple params in a batch. \`createParam('x')\` / \`createParams('x','y')\` for custom params.
- Structure direction (Tidal \`|+\`, \`+|\`, \`|+|\`): \`.add.in(n)\` (left), \`.add.out(n)\` (right), \`.add.mix(n)\` (both). \`.set(n)\` takes left values.

## 11. Signals (continuous modulators, pattern-level)

- \`sine\`, \`cosine\`, \`saw\`, \`tri\`, \`square\` (range 0-1); \`sine2\`, \`saw2\`, etc. (range -1-1).
- \`rand\` (random 0-1), \`rand2\`, \`perlin\` (perlin noise), \`irand(n)\` (random ints 0..n-1), \`brand\` (0/1), \`brandBy(p)\`.
- \`mousex\`/\`mousey\`.
- Use with \`.range()\`: \`s("hh*16").lpf(saw.range(500,2000))\`. Modulate speed with \`.slow\`/\`.fast\`.
- IMPORTANT: signals are only sampled when a sound event triggers. For continuous filter sweeps, add events: \`s("supersaw").seg(16).lpf(tri.range(100,5000))\`. Truly continuous params: ADSR, penv, fmenv, filter envelopes, tremolo, phaser, vib, duck.

## 12. Random Modifiers

- \`choose(a,b,c)\`, \`wchoose([a,10],[b,1])\` (weighted), \`chooseCycles\`/\`randcat\` (one per cycle, mini \`|\`), \`wchooseCycles\`/\`wrandcat\`.
- \`degradeBy(p)\` / \`degrade()\` (drop 50%), \`undegradeBy\` / \`undegrade\` (inverse).
- \`sometimesBy(p, fn)\`, \`sometimes(fn)\` (50%), \`someCyclesBy\`/\`someCycles\`.
- Shorthands: \`often\` (75%), \`rarely\` (25%), \`almostNever\` (10%), \`almostAlways\` (90%), \`never\` (0%), \`always\` (100%).

## 13. Conditional & Structural Modifiers

- \`lastOf(n, fn)\` / \`firstOf(n, fn)\` -- apply fn every n cycles.
- \`when(binaryPat, fn)\`, \`chunk(n, fn)\` / \`chunkBack\` / \`fastChunk\` -- apply fn to one chunk per cycle.
- \`arp("0 [0,2] 1")\` -- arpeggiate stacked notes; \`arpWith(fn)\`.
- \`struct("x ~ x x")\` apply rhythmic structure; \`mask("<1 [0 1]>")\` mute where 0/\`~\`; \`invert\`/\`inv\` (swap 1s/0s in binary).
- \`reset(pat)\` (restart current cycle), \`restart(pat)\` (from cycle 0), \`hush()\` (silence).
- \`pick(list|obj)\` / \`pickmod\` / \`pickF\` (pick functions) / \`pickRestart\` / \`pickReset\`; \`inhabit\`/\`pickSqueeze\`; \`squeeze(pat, list)\`.

## 14. Accumulation Modifiers

- \`superimpose(fn)\` -- overlay fn(pattern) on top of original.
- \`layer(fn1, fn2, ...)\` -- like superimpose but WITHOUT the original.
- \`off(time, fn)\` -- overlay a time-shifted, modified copy: \`"c3".off(1/8, x=>x.add(7))\`.
- \`echo(times, time, feedback)\`, \`echoWith\`/\`stutWith(times, time, fn)\`, \`stut(times, feedback, time)\`.

## 15. Stepwise Functions (experimental)

Work relative to "steps" rather than cycles. \`pace(n)\` sets steps-per-cycle. \`stepcat\`, \`stepalt\`, \`expand(n)\` / \`contract(n)\`, \`extend(n)\`, \`take(n)\` / \`drop(n)\`, \`shrink\` / \`grow\`, \`tour\`, \`zip\`. Mark step level with \`^\` in mini-notation.

## 16. MIDI / OSC / MQTT

- MIDI out: \`.midi('IAC Driver')\`, \`midiport\`, \`midichan\`, \`midicmd("clock*48")\`/\`start\`/\`stop\`, \`control\`/\`ccn\`/\`ccv\`, \`progNum\`, \`sysex\`, \`midibend\`, \`miditouch\`, \`midimaps({...})\`.
- MIDI in: \`const cc = await midin('device')\` then \`cc(0).range(...)\`; \`midikeys('device')\`.
- OSC/SuperDirt: \`.osc()\` (requires SuperCollider + SuperDirt/StrudelDirt + \`pnpm run osc\`).
- MQTT: \`.mqtt(user, pass, topic, server, clientId, latency)\` -- send only.

## 17. Visual Feedback

- Mini-notation auto-highlights active parts; \`.color("cyan magenta")\` to colorize.
- Global vs inline: no prefix draws to page background; \`_\` prefix draws inline (allows multiple).
- \`pianoroll\` / \`punchcard\` (options: \`cycles\`, \`vertical\`, \`labels\`, \`fold\`, colors, \`minMidi\`/\`maxMidi\`, etc.). \`punchcard\` is cheaper and reflects later transforms.
- \`spiral\`, \`scope\`/\`tscope\` (oscilloscope), \`spectrum\`, \`pitchwheel\`, \`markcss\`. Use \`all(pianoroll)\` for every running pattern.

## 18. Common Recipes

- **Arpeggio**: \`n("0 2 4 7").scale("C:minor").clip(2)\` or \`"0".off(1/3, add(2)).off(1/2, add(4)).n().scale("C:minor")\`.
- **Chop a break**: \`samples('github:yaxu/clean-breaks'); s("amen/4").fit().chop(16).cut(1)\`. Use \`slice\`/\`splice\` for ordered playback.
- **Layer/detune**: \`note("g1").add(note("0,.1")).s("sawtooth")\` (fatten via detune).
- **Polyrhythm**: \`s("bd*2,hh*3")\` (different tempos same time). **Polymeter**: \`s("<bd rim, hh hh oh>*4")\` (different lengths, same tempo). **Phasing**: \`note("<...>*[6,6.1]")\`.
- **Run through samples**: \`n(run(8)).s("ftabla")\` (+ \`.early(2/8)\` to align phrase).
- **Duration**: \`clip\` (relative to event), \`release\` (fade out seconds), \`decay\`, \`end\` (relative to sample length).

## 19. Full Example (song with stacked parts)

\`\`\`
setcpm(110/4)
$: sound("bd*4, [~ cp]*2, [~ hh]*4").bank("RolandTR909")
$: note("<[c2 c3]*4 [bb1 bb2]*4 [f2 f3]*4 [eb2 eb3]*4>")
   .sound("gm_synth_bass_1").lpf(800)
$: n("0 [2 4] <3 5> [~ <4 1>]".add("<0 [0,2,4]>"))
   .scale("C5:minor").sound("gm_xylophone").room(.4).delay(.125)
$: n("0 1 [2 3] 2").sound("jazz").jux(rev)
\`\`\`

## 20. Strudel vs Tidal (for agents familiar with Tidal)

- Tidal \`$\` chaining reverses in Strudel: \`iter 4 $ every 3 f $ p\` -> \`p.every(3, f).iter(4)\`.
- Custom operators become functions: \`|+\` -> \`.add\`, \`|-\` -> \`.sub\`, \`|*\` -> \`.mul\`, \`|/\` -> \`.div\`, \`|%\` -> \`.mod\`, \`|<\` -> \`.set\`, \`#\`/\`|>\` -> chained control (\`.crush(4)\`).
- Direction variants: \`|+\` -> \`.add.in\`, \`+|\` -> \`.add.out\`, \`|+|\` -> \`.add.mix\`.
- Strudel default tempo differs from Tidal; match Tidal with \`.fast(.5625)\`.

## 21. Symbol Cheat Sheet

\`' '\` plain string; \`" "\` single-line mini-notation; backticks multi-line mini-notation; \`[]\` equal-length group; \`<>\` alternate per cycle; \`{}%n\` polymeter; \`@n\` elongate; \`_\` elongate/(prefix)mute-stack; \`.\` foot divider; \`-\`/\`~\` silence; \`x\` non-silence (for struct); \`b\`/\`#\` flat/sharp; \`*n\` faster; \`!n\` replicate; \`/n\` slower; \`?\` sometimes; \`|\` random choice per cycle; \`,\` parallel/stack; \`:\` param separator (e.g. \`adsr(".1:.1:.5:.2")\`); \`$:\` stack member line; \`_$:\` muted stack line.


---

# Strudel — Development & Advanced Appendix

This appendix covers embedding, packages, the REPL internals, custom sounds, pattern theory, alignment, Mondo Notation, metadata, and integrations (CSound, Hydra, gamepads, device motion, xenharmonic, offline).

## A1. Licensing (must-know)

Strudel is **AGPL-3.0**. Consequences for anything built on it:
- Derivative work (including clones "informed by reading the source") must be under the same/compatible free-open-source license.
- When published on the web, the full application source must be shared.
- You cannot integrate Strudel with closed-source or license-incompatible code and distribute it.
- Contributed example tunes are **separately licensed** and must not be used to train AI models without permission.

## A2. Embedding Strudel in a Website

1. **Plain iframe** — \`<iframe src="https://strudel.cc/?<shareId>" ...></iframe>\`. Share links depend on a database (not permanent); the long \`#<base64>\` URL embeds the code itself.
2. **\`@strudel/embed\`** (iframe web component): load the script, use \`<strudel-repl><!-- code --></strudel-repl>\`. Code goes inside HTML comments.
3. **\`@strudel/repl\`** (direct, no iframe; component \`<strudel-editor>\`): lets you pin a version so patterns don't break on updates.
- **Own UI** — \`@strudel/web\`: \`initStrudel()\`, then \`note('<c a f e>(3,8)').jux(rev).play()\` / \`hush()\`.
- All packages on npm under \`@strudel/*\` (needs an ES-module bundler like Vite).

## A3. Package Overview (monorepo)

- **Umbrella**: \`repl\` (REPL web component), \`web\` (browser lib, no UI).
- **Essential**: \`core\` (pattern engine + primitives), \`mini\` (mini-notation parser), \`transpiler\` (user-code transpiler / syntax sugar / highlighting).
- **Language extensions**: \`tonal\` (scales/chords), \`xen\` (microtonal).
- **Outputs**: \`webaudio\` (default), \`osc\`, \`midi\`, \`csound\`, \`soundfonts\`, \`serial\`.
- **Other**: \`embed\`. **Unmaintained**: \`react\`, \`eval\`, \`tone\`, \`webdirt\`.
- Tooling: \`pnpm\` (workspaces/publishing), \`lerna\` (versions). \`@strudel.cycles/*\` renamed \`@strudel/*\` at v0.10.0.

## A4. How the REPL Works (internals)

REPL = Read, Evaluate, Print/Play, Loop. Editor is CodeMirror. Flow:
1. User code is **transpiled** then **evaluated** into a \`Pattern\`.
2. A **Scheduler** queries the active pattern at a fixed interval for upcoming events.
3. Each event (**Hap**) is triggered via its \`onTrigger\` (set by the output).
- **Transpilation**: double-quoted strings become mini-notation via \`m('...', loc)\`; single quotes stay plain. Parsed with \`acorn\` -> AST -> regenerated with \`escodegen\`. Source locations enable active-event highlighting (\`withLoc\`).
- **Mini-notation parser**: a PEG grammar (via \`peggy\`), based on \`krill\`, produces an AST that calls the Strudel API.
- **Scheduling**: \`Pattern.queryArc(begin, end)\` is a *pure* function mapping a time span -> Haps. Current interval ~50ms, minLatency ~100ms => perceived latency 50-150ms. Pattern changes are picked up on the next tick without stopping the clock.
- Supports Vim keybindings.

## A5. Patterns as Functions (theory)

A \`Pattern\` is a pure function from a time span to a set of **events/Haps**. Time is in **cycles** as fractions. \`sequence("c3", ["e3","g3"]).queryArc(0,1)\` -> \`[0/1->1/2 c3], [1/2->3/4 e3], [3/4->1/1 g3]\`. Each Hap has \`value\`, \`begin\`, \`end\`. Patterns are immutable; transforms wrap an existing pattern in a new one that manipulates the query in and the results out. Control values are objects, e.g. \`{ note:'c3', cutoff:1000, s:'sawtooth' }\`.

## A6. Pattern Alignment & Combination

Default combine (e.g. \`.add\`) lines up cycles, takes structure **from the left**, treats partial overlaps as *fragments* (a fragment whose start is missing won't trigger sound). Variants per operator:
- **\`.in\`** (default): apply right values into the left (structure from left).
- **\`.out\`**: structure from the right.
- **\`.mix\`**: combine both structures; new events at intersections.
- **\`.squeeze\`**: squeeze right cycles into left events. \`"0 1 2".add.squeeze("10 20")\` == \`"[10 20] [11 21] [12 22]"\`.
- **\`.squeezeout\`**: squeeze left cycles into right events. == \`"[10 11 12] [20 21 22]"\`.
- **\`.reset\`**: like squeezeout but right cycles are *truncated* to fit; right events "reset" left cycles.
- **\`.restart\`**: like reset but restarts the right pattern from cycle 0.

## A7. Mondo Notation (alternative standalone language)

A superset of mini-notation. Use with \`mondo\` + backtick template: \`mondo\` then backticks around \`s hh*8\`.
- **Function calls** use round brackets, first element = name: \`(s hh*8)\` == \`s("hh*8")\`; outer parens optional -> \`s hh*8\`.
- **Chaining** uses \`#\` (like JS \`.\`): \`n <0 2 4>*4 # scale C4:minor # jux rev # delay .5\`.
- **Local application**: wrap in parens to apply to one element -> \`s [bd hh bd (cp # delay .6)]\`.
- **Infix operators as functions**: \`*\` fast, \`/\` slow, \`!\` extend, \`@\` expand, \`%\` pace, \`?\` degradeBy, \`:\` tail(list), \`..\` range, \`,\` stack, \`|\` chooseIn. Chainable: \`s [bd hh] # bank tr909 # *2\`.
- **Lambdas**: \`x=>x.\` shortens to \`(# ...)\`, e.g. \`sometimes (# dec .1 # jux rev)\`.
- **Brackets**: \`[]\` 1-cycle, \`<>\` multi-cycle, \`{}\` stepped.
- **\`$\`** separates patterns (alias for \`,\` -> stack). **\`def\`** defines variables. Strings: \`"double"\` and \`'single'\`.

## A8. Music Metadata

Add via code comments (ignored by Strudel, read by tools): \`// @title ...\`, \`// @by John Doe <url>\`, \`// @license CC-BY-SA-4.0\`. Also works in block comments, multiple tags per line, or \`// "Title" @by ...\`.
- Tags: \`@title\`, \`@by\`, \`@license\` (SPDX IDs), \`@details\`, \`@url\`, \`@genre\`, \`@album\`, \`@tag\`. Several accept comma/newline lists or repeated tags; some allow multi-line values.
- Searchable in the REPL patterns tab: \`by: Ada L\`, \`genre: unicorns\`.

## A9. Registering Custom Sounds (webaudio output)

\`registerSound(name, onTrigger, data)\` where \`onTrigger(time, value, onended)\` returns \`{ node, stop }\`. Create an AudioNode (e.g. OscillatorNode), start it at \`time\`, connect through a gain node, fire \`onended\` on the node's \`ended\` event, and return the node plus a \`stop(time)\` fn. The returned \`node\` connects to the standard effects chain; \`stop\` being separate lets MIDI note-off end sounds of unknown length. New sound appears in the REPL sounds tab.

## A10. Testing & Docs (contributing)

- Tests use **vitest**: unit tests (\`*.test.mjs\`) + snapshot tests for \`@example\` snippets (\`examples.test.mjs\`) and tunes (\`tunes.test.mjs\`). \`.snap\` files store Haps over N cycles; regenerate with \`npm run snapshot\`.
- Docs are Astro \`.mdx\` pages under \`website/src/pages/\`. Live examples via \`<MiniRepl client:idle tune={...} />\`; API docs via \`<JsDoc name="s" h={0} />\` generated from JSDoc comments into \`doc.json\` (\`npm run jsdoc-json\`).

## A11. CSound Integration (experimental)

- Load a bank: \`await loadOrc('github:kunstmusik/csound-live-code/master/livecode.orc')\` then \`note("c a f e").csound('FM1')\`. livecode.orc includes Sub1-8, SSaw, FM1, Bass, Organ1-3, TR-808 drums (BD, SD, OHH, CHH, toms, Cowbell...), and more.
- Custom instruments via \`await loadCsound\` (template with \`instr Name ... endin\`) then \`.csound('Name')\`.
- Params: p1 name, p2 time, p3 duration, p4 frequency, p5 gain(0-1). Alt \`.csoundm\`: p4 = MIDI key, p5 = velocity. Limitation: only these p-values patternable; audio effects don't apply yet.

## A12. Hydra (visuals) Integration

- \`await initHydra()\` at top, then write Hydra code alongside Strudel patterns.
- \`H(pattern)\` feeds a Strudel pattern into Hydra: \`shape(H("3 4 5 [6 7]*2")).out(o0)\`.
- Options to \`initHydra({...})\`: \`detectAudio:true\` (FFT capture, e.g. \`a.fft[0]\`), \`feedStrudel:1\` (transform Strudel visuals via \`src(s0)\`), plus standard Hydra options.

## A13. Input Devices — Gamepad

- \`const gp = gamepad(0)\` (index optional; multiple pads supported). Inputs are normalized signals (0-1).
- Buttons: face \`a b x y\` (+uppercase, +toggle \`tglA\`...), shoulders \`lb rb lt rt\`, D-pad \`up down left right\` (or \`u d l r\`), stick buttons \`l3 r3\`/\`ls rs\`, system \`start back\` — all with \`tgl*\` variants.
- Analog sticks: left \`x1 y1\` (0-1) / \`x1_2 y1_2\` (-1-1); right \`x2 y2\` / \`x2_2 y2_2\`.
- Use like signals: \`.mask(gp.a)\`, \`.lpf(gp.x1.range(100,4000))\`.
- Button sequences: \`gp.btnSequence(['d','r','a'])\` or a string like \`'uuddlrlrba'\` — returns 1 while detected within ~1s.

## A14. Device Motion (mobile sensors)

- Enable with \`enableMotion()\` (prompts for permission). Values normalized 0-1; combine with \`.range(min,max)\`.
- Sensors: Acceleration \`accelerationX/Y/Z\` (\`accX\`...), Gravity \`gravityX/Y/Z\`, Rotation \`rotationAlpha/Beta/Gamma\` (\`rotZ/rotX/rotY\`), Orientation \`orientationAlpha/Beta/Gamma\` (\`oriZ/oriX/oriY\`), Absolute Orientation \`absOri*\` (not on iOS).
- Regular orientation = relative to start; absolute = relative to Earth's magnetic field.
- Example: \`.lpf(gravityY.range(200,2000)).room(rotZ.range(0,0.8)).gain(oriX.range(0.2,0.8))\`. Debug with \`accX.segment(16).log()\`.

## A15. Xenharmonic / Microtonal (experimental)

- \`i("0 1 2 3").tune("hexany15").mul("220").freq()\` — \`i\` indexes a tuning; \`tune\` accepts tunejs names (\`hexany1\`, \`iraq\`, \`gumbeng\`, \`gunkali\`, \`tranh3\`, \`sanza\`...) or a frequency array. Set root with \`.mul(getFreq('c3'))\` or \`.mul("<c3 d3>".fmap(getFreq))\`.
- \`xen(scaleOrRatios)\` maps step numbers to frequencies at base 220Hz. Accepts tunejs names, EDOs (\`"31edo"\`), or ratio arrays. \`i("0 8 18").xen("31edo").piano()\`. Patternable: \`.xen("<5edo 10edo hexany15>")\`.
- Tip: many non-12-tone tunings sound better *strummed* — use \`.legato()\` + \`.room()\` and offset notes (\`@0.3\`).

## A16. Offline Use (PWA)

- Strudel is a progressive web app: first visit caches the whole app (<1MB) so it works offline afterward; updates download on next online visit.
- **Samples** are cached only when used, and only from: \`raw.githubusercontent.com\`, \`freesound.org\`/\`cdn.freesound.org\`, \`shabda.ndre.gr\`.
- Cache viewable/clearable via DevTools (Application -> Cache Storage / Service Workers).
- Install standalone: Chromium "Install" button; iOS Safari "Add to Home Screen"; Android install prompt; or \`npx nativefier strudel.cc\` for a desktop app.

---
Source: Strudel official docs (strudel.cc) — Workshop, Making Sound, Pattern Functions, Understand, Recipes, FAQ, Visual Feedback, Strudel vs Tidal, and technical-manual pages. Compiled as agent context.
