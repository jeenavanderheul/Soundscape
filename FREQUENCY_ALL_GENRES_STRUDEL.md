# FREQUENCY — ALL GENRES / STRUDEL

Tien muzikale werelden met één gedeelde FREQUENCY-architectuur. UK Garage is de canonical master: **PERFORMANCE → GRAMMAR → 32-cycle arrangement → ATMOSPHERE → 7-step ladder → CORE + DEEP → TRANSITION**.

> Elk codeblok is zelfstandig: voer één genre tegelijk uit. `ALT`, `WIND`, `EDGE` en `SEED` zijn performance-ingangen; de maskers vormen steeds één arrangement van 32 cycles.

## Index

| Genre | Richting | Wereld | BPM-range | Machines | Bas · akkoord · lead | Opent met | Bos |
|---|---|---|---:|---|---|---|---|
| Techno | N | Machine | 110–150 | RolandTR909 · EmuSP12 | sawtooth · square · clavisynth | machine pulse | staalbos |
| Garage | NO | Bounce | 124–146 | RolandTR909 | sine · organ_full · vibraphone | swung hats | neonberken |
| Jazz | O | Improvised | 80–140 | RolandR8 · AlesisHR16 | piano · piano · sax | ride | nachtesdoorns |
| House | ZO | Warm | 118–128 | RolandTR707 · LinnDrum | sawtooth · piano · fmpiano | offbeat hats | amberlinden |
| Ambient | Z | Cloud | 60–90 | KorgDDM110 · LinnLM1 | sine · supersaw · harp | shimmer | mistdennen |
| Experimental | Omhoog | Mutation | 70–170 | SakataDPM48 · OberheimDMX | square · tubularbells · marimba | ticks | kristalwoud |
| Breakbeat | ZW | Broken | 132–152 | RolandTR909 · YamahaRY30 | sawtooth · square · clavisynth | break hats | roestvarens |
| D&B | W | Velocity | 160–180 | EmuSP12 · AkaiMPC60 | sine/sawtooth · fmpiano · triangle | fast break | stormsparren |
| Dub | Omlaag | Echo | 60–90 | RolandCompuRhythm1000 · RolandCompuRhythm8000 | sine · organ_full · harmonica | sparse hats | diepe mangrove |
| Trap | NW | Gravity | 130–150 | LinnLM2 · AkaiXR10 | sine/square · fmpiano · glockenspiel | hat pulse | zwarte cipressen |

---

## 1 — TECHNO / MACHINE

```js
// ladder: pulse → kick → clap → rolling bass → stab → sequence → machine noise
const ALT=0.55, WIND=0.75, EDGE=0.20, SEED=1337
const PROG="<[c3,eb3,gb3] [c3,db3,g3] [bb2,db3,f3] [c3,eb3,g3]>"
const PATH="<[0 0 3 0] [0 6 3 0] [0 3 5 3] [7 5 3 0]>"
setcpm((110+ALT*40)/4)

// 32 cycles: wake → build → drop → void → drop 2
const M_HATS="<1!24 0!4 1!4>", M_HATSD="<0!8 1!16 0!4 1!4>"
const M_KICK="<0!4 1!20 0!4 1!4>", M_KICKD="<0!12 1!12 0!4 1!4>"
const M_SNARE="<0!8 1!16 0!4 1!4>", M_SNARED="<0!16 1!8 0!4 1!4>"
const M_BASS="<0!10 1!14 0!4 1!4>", M_SUB="<0!14 1!10 0!4 1!4>"
const M_HARM="<0!14 1!10 0!4 1!4>", M_HARMD="<0!18 1!6 0!4 1!4>"
const M_MEL="<0!18 1!6 0!4 1!4>", M_MELD="<0!22 1!2 0!4 1!4>"
const M_TEX="<0!8 1!16 0!4 1!4>", M_TEXD="<0!20 1!4 0!4 1!4>"
const M_RISE="<0!15 1 0!15 1>"

// ATMOSPHERE
$: s("brown").clip(1).lpf(250+ALT*900).gain(.08).room(.7).size(7).orbit(3)

// 1 PULSE — CORE + DEEP
$: s("hh*16").bank("RolandTR909").gain("[.48 .22 .34 .18]*4").hpf(6500+ALT*2500).pan(sine.range(.4,.6).slow(4)).mask(M_HATS)
$: s("hh*32").bank("EmuSP12").degradeBy(.58).gain(.12).hpf(9500).mask(M_HATSD)
// 2 KICK — CORE + DEEP
$: s("bd*4").bank("RolandTR909").shape(.22+EDGE*.45).gain(1.08).lpf(3500+ALT*1800).mask(M_KICK)
$: s("<lt ~ mt ~ ht ~ mt ~>").bank("RolandTR909").gain(.22).hpf(350).room(.18).mask(M_KICKD)
// 3 CLAP — CORE + DEEP
$: s("~ cp ~ cp").bank("RolandTR909").gain(.62).room(.22).mask(M_SNARE)
$: s("~ ~ rim ~ ~ rim ~ ~").bank("EmuSP12").late(.01).gain(.18).hpf(1700).mask(M_SNARED)
// 4 BASS — BODY + SUB
$: note("<[c2 c2 c2 eb2] [c2 c2 db2 c2] [bb1 bb1 db2 eb2] [c2 c2 g1 bb1]>").struct("x ~ x x ~ x ~ [x x]").s("sawtooth").lpf(sine.range(220,700+ALT*1200).slow(8)).lpq(10).decay(.15).sustain(.12).distort(1.3+EDGE*2.5).postgain(.42).gain(.7).orbit(2).mask(M_BASS)
$: note("<c1 c1 bb0 c1>").struct("x ~ ~ x ~ x ~ ~").s("sine").attack(.003).decay(.3).sustain(.3).release(.1).gain(.9).orbit(2).mask(M_SUB)
// 5 STAB — CORE + DEEP
$: note(PROG).struct("~ x ~ ~ ~ x ~ x").s("square").lpf(1000+ALT*2200).lpq(4).decay(.1).sustain(.08).room(.3).size(2).gain(.32).mask(M_HARM)
$: note(PROG).add(note(12)).struct("~ ~ x ~ ~ ~ x ~").s("supersaw").lpf(2400+ALT*1800).room(.55).size(4).gain(.12).mask(M_HARMD)
// 6 SEQUENCE — CORE + DEEP
$: n(PATH).scale("C4:minor").s("pulse").decay(.07).sustain(0).lpf(1200+ALT*2500).delay(".25:.125:.35").gain(.22).every(4,x=>x.rev()).mask(M_MEL)
$: n(PATH).add(7).scale("C4:minor").slow(2).s("clavisynth").room(.5).size(4).gain(.11).mask(M_MELD)
// 7 MACHINE NOISE — CORE + DEEP
$: s("bytebeat").slow(2).crush(6).bpf(700+ALT*1800).gain(.08).mask(M_TEX)
$: s("crackle").hpf(4000).gain(.08).room(.6).mask(M_TEXD)
// TRANSITION
$: s("white").clip(1).hpf(saw.range(250,10000).slow(1)).attack(.4).release(.25).gain(.1).room(.5).mask(M_RISE)
```

---

## 2 — GARAGE / BOUNCE — CANONICAL MASTER

```js
// ladder: hats → kick → snare → bass → harmony → melody → texture
// arrangement: 32 cycles, intro → build → drop → break → drop 2
const ALT=0.55, WIND=0.75, EDGE=0.20, SEED=1337
const SWING=1/3
const PROG="<[c3,eb3,g3] [bb2,d3,g3] [ab2,c3,eb3] [bb2,d3,f3]>"
const PATH="<[0 3 7 5] [7 5 3 2] [0 2 3 7] [5 3 2 0]>"
setcpm((124+ALT*22)/4)

const M_HATS="<1!24 0!4 1!4>", M_HATSD="<0!8 1!16 0!4 1!4>"
const M_KICK="<0!4 1!20 0!4 1!4>", M_KICKD="<0!16 1!8 0!4 1!4>"
const M_SNARE="<0!8 1!16 0!4 1!4>", M_SNARED="<0!18 1!6 0!4 1!4>"
const M_BASS="<0!12 1!2 0!2 1!8 0!4 1!4>", M_SUB="<0!16 1!8 0!4 1!4>"
const M_HARM="<0!16 1!16>", M_HARMD="<0!28 1!4>"
const M_MEL="<0!20 1!12>", M_MELD="<0!28 1!4>"
const M_TEX="<0!24 1!8>", M_TEXD="<0!28 1!4>"
const M_RISE="<0!15 1 0!15 1>"

// ATMOSPHERE — ligt altijd onder alles
$: s("brown").clip(1).lpf(300+ALT*1400).gain(.10).room(.85).size(8).orbit(3)

// 1 HATS — CORE + DEEP
$: s("hh*16").bank("RolandTR909").swingBy(SWING,8).gain("[.55 .28]*8").hpf(6500+ALT*2500).pan(sine.range(.35,.65).slow(3)).sometimesBy(.12,x=>x.s("oh").gain(.45)).mask(M_HATS)
$: s("~ hh ~ [hh hh] ~ hh ~ hh").bank("RolandTR909").swingBy(SWING,8).degradeBy(.18).gain(.22).hpf(5200).mask(M_HATSD)
// 2 KICK — CORE + DEEP
$: s("bd ~ ~ bd ~ ~ ~ bd").bank("RolandTR909").shape(.15+EDGE*.35).gain(1.02).mask(M_KICK)
$: s("~ lt ~ ~ mt ~ ~ lt").bank("RolandTR909").gain(.16).lpf(1800).mask(M_KICKD)
// 3 SNARE — CORE + DEEP
$: s("~ ~ cp ~ ~ ~ cp ~").bank("RolandTR909").gain(.68).room(.24).mask(M_SNARE)
$: s("~ rim ~ ~ rim ~ ~ rim").bank("RolandTR909").late(.015).gain(.15).hpf(1400).mask(M_SNARED)
// 4 BASS — BODY + SUB
$: note("<c2 ~ c2 eb2 ~ g1 bb1 ~>").s("square").lpf(260+ALT*420).lpq(7).decay(.18).sustain(.14).shape(.18+EDGE*.3).gain(.48).mask(M_BASS)
$: note("<c1 ~ ~ eb1 ~ bb0 ~ g0>").s("sine").lpf(115).attack(.005).release(.18).gain(.95).orbit(2).mask(M_SUB)
// 5 HARMONY — CORE + DEEP
$: note(PROG).struct("~ x ~ ~ ~ x ~ x").s("organ_full").lpf(900+ALT*1400).decay(.16).sustain(.09).room(.32).gain(.27).mask(M_HARM)
$: note(PROG).add(note(12)).slow(2).s("fmpiano").lpf(2600).room(.65).gain(.10).mask(M_HARMD)
// 6 MELODY — CORE + DEEP
$: n(PATH).scale("C5:minor").s("vibraphone").decay(.22).release(.12).delay(".25:.1875:.35").room(.45).gain(.19).mask(M_MEL)
$: n(PATH).add(7).scale("C5:minor").slow(2).s("piano").room(.6).gain(.09).mask(M_MELD)
// 7 TEXTURE — CORE + DEEP
$: s("pink").hpf(4200).gain(.055).room(.75).mask(M_TEX)
$: s("crackle").degradeBy(.55).hpf(6500).gain(.035).pan(sine.range(.2,.8).slow(5)).mask(M_TEXD)
// TRANSITION
$: s("white").clip(1).hpf(saw.range(250,10000).slow(1)).attack(.4).release(.25).gain(.09).room(.5).mask(M_RISE)
```

---

## 3 — JAZZ / IMPROVISED

```js
// ladder: ride → kick → ghost snare → walking bass → extended chords → improvisation → room
const ALT=.50, WIND=.68, EDGE=.12, SEED=1337
const PROG="<[c3,eb3,g3,bb3] [f3,ab3,c4,eb4] [bb2,d3,f3,a3] [g2,bb2,d3,f3]>"
const PATH="<[0 2 4 7] [3 5 7 9] [7 6 4 2] [5 3 2 0]>"
setcpm((80+ALT*60)/4)
const M_HATS="<1!24 0!4 1!4>", M_HATSD="<0!8 1!16 0!4 1!4>"
const M_KICK="<0!6 1!18 0!4 1!4>", M_KICKD="<0!14 1!10 0!4 1!4>"
const M_SNARE="<0!8 1!16 0!4 1!4>", M_SNARED="<0!14 1!10 0!4 1!4>"
const M_BASS="<0!8 1!16 0!4 1!4>", M_SUB="<0!16 1!8 0!4 1!4>"
const M_HARM="<0!4 1!20 0!4 1!4>", M_HARMD="<0!12 1!12 0!4 1!4>"
const M_MEL="<0!16 1!8 0!4 1!4>", M_MELD="<0!20 1!4 0!4 1!4>"
const M_TEX="<0!20 1!4 0!4 1!4>", M_TEXD="<0!24 1!8>", M_RISE="<0!15 1 0!15 1>"

$: s("pink").clip(1).lpf(1800).gain(.045).room(.8).size(7).orbit(3)
// 1 RIDE — CORE + DEEP
$: s("rd ~ rd [rd rd] rd ~ rd ~").bank("RolandR8").gain(.3).hpf(3800).mask(M_HATS)
$: s("hh ~ hh ~ [hh hh] ~ hh ~").bank("AlesisHR16").gain(.12).hpf(6000).mask(M_HATSD)
// 2 KICK — CORE + DEEP
$: s("bd ~ ~ ~ bd ~ ~ [~ bd]").bank("AlesisHR16").gain(.65).mask(M_KICK)
$: s("~ perc ~ ~ ~ perc ~ ~").bank("RolandR8").gain(.14).room(.25).mask(M_KICKD)
// 3 GHOST SNARE — CORE + DEEP
$: s("~ ~ sd ~ ~ [sd ~] ~ ~").bank("AlesisHR16").gain(.42).room(.3).mask(M_SNARE)
$: s("~ rim ~ ~ rim ~ [rim ~] ~").bank("RolandR8").gain(.12).late(.015).mask(M_SNARED)
// 4 WALKING BASS — CORE + DEEP
$: note("<c2 eb2 g2 bb2 f2 ab2 c3 eb3 bb1 d2 f2 a2 g1 bb1 d2 f2>").s("piano").lpf(650).decay(.22).sustain(.15).gain(.52).mask(M_BASS)
$: note("<c1 f1 bb0 g0>").s("sine").slow(2).lpf(130).gain(.25).mask(M_SUB)
// 5 EXTENDED CHORDS — CORE + DEEP
$: note(PROG).s("piano").attack(.01).decay(.35).sustain(.3).release(.25).room(.35).size(3).gain(.42).mask(M_HARM)
$: note(PROG).add(note(12)).s("fmpiano").slow(2).room(.5).gain(.14).mask(M_HARMD)
// 6 IMPROVISATION — CORE + DEEP
$: n(PATH).scale("C4:dorian").s("sax").decay(.3).release(.2).room(.35).gain(.3).every(4,x=>x.rev()).mask(M_MEL)
$: n(PATH).add(7).scale("C4:dorian").slow(2).s("vibraphone").room(.65).delay(".3:.25:.35").gain(.12).mask(M_MELD)
// 7 ROOM — CORE + DEEP
$: s("crackle").degradeBy(.65).hpf(3500).gain(.06).mask(M_TEX)
$: s("brown").lpf(500).room(.9).size(9).gain(.04).mask(M_TEXD)
// TRANSITION
$: s("white").hpf(saw.range(800,7000)).gain(.06).mask(M_RISE)
```

---

## 4 — HOUSE / WARM

```js
// ladder: hats → four-floor → clap → groove bass → piano/organ → hook → warmth
const ALT=.55, WIND=.74, EDGE=.10, SEED=1337
const PROG="<[c3,eb3,g3] [f3,ab3,c4] [bb2,d3,f3] [g2,bb2,d3]>"
const PATH="<[0 3 7 5] [3 5 7 10] [7 5 3 2] [5 3 2 0]>"
setcpm((118+ALT*10)/4)
const M_HATS="<1!24 0!4 1!4>", M_HATSD="<0!8 1!16 0!4 1!4>"
const M_KICK="<0!4 1!20 0!4 1!4>", M_KICKD="<0!12 1!12 0!4 1!4>"
const M_SNARE="<0!8 1!16 0!4 1!4>", M_SNARED="<0!16 1!8 0!4 1!4>"
const M_BASS="<0!10 1!14 0!4 1!4>", M_SUB="<0!16 1!8 0!4 1!4>"
const M_HARM="<0!12 1!12 0!4 1!4>", M_HARMD="<0!18 1!6 0!4 1!4>"
const M_MEL="<0!18 1!6 0!4 1!4>", M_MELD="<0!22 1!2 0!4 1!4>"
const M_TEX="<0!20 1!4 0!4 1!4>", M_TEXD="<0!24 1!8>", M_RISE="<0!15 1 0!15 1>"

$: s("pink").lpf(1200).room(.75).gain(.045)
// 1 HATS — CORE + DEEP
$: s("~ hh ~ hh ~ hh ~ hh").bank("RolandTR707").gain(.32).hpf(5500).mask(M_HATS)
$: s("sh*16").bank("LinnDrum").degradeBy(.28).gain(.1).hpf(7000).mask(M_HATSD)
// 2 FOUR-FLOOR — CORE + DEEP
$: s("bd*4").bank("RolandTR707").shape(.16+EDGE*.3).gain(1).mask(M_KICK)
$: s("~ lt ~ ~ mt ~ ~ lt").bank("LinnDrum").gain(.13).mask(M_KICKD)
// 3 CLAP — CORE + DEEP
$: s("~ ~ cp ~ ~ ~ cp ~").bank("LinnDrum").gain(.65).room(.28).mask(M_SNARE)
$: s("~ rim ~ ~ ~ rim ~ ~").bank("RolandTR707").gain(.12).mask(M_SNARED)
// 4 GROOVE BASS — CORE + DEEP
$: note("<c2 c2 eb2 g1 f2 f2 ab2 c2 bb1 bb1 d2 f2 g1 bb1 d2 g2>").struct("x ~ x ~ x x ~ x").s("sawtooth").lpf(350+ALT*850).lpq(7).decay(.16).sustain(.12).gain(.62).mask(M_BASS)
$: note("<c1 f1 bb0 g0>").struct("x ~ ~ x ~ x ~ ~").s("sine").lpf(110).gain(.55).mask(M_SUB)
// 5 PIANO/ORGAN — CORE + DEEP
$: note(PROG).add(note(12)).struct("~ x ~ x ~ ~ x ~").s("piano").decay(.18).sustain(.1).room(.3).gain(.4).mask(M_HARM)
$: note(PROG).struct("~ ~ x ~ ~ x ~ ~").s("organ_full").lpf(1800).gain(.18).mask(M_HARMD)
// 6 HOOK — CORE + DEEP
$: n(PATH).scale("C4:minor").s("fmpiano").decay(.13).release(.08).delay(".25:.1875:.3").gain(.24).mask(M_MEL)
$: n(PATH).add(7).scale("C4:minor").slow(2).s("vibraphone").room(.55).gain(.1).mask(M_MELD)
// 7 WARMTH — CORE + DEEP
$: s("pink").hpf(4500).gain(.08).mask(M_TEX)
$: s("crackle").hpf(6000).gain(.04).room(.6).mask(M_TEXD)
// TRANSITION
$: s("white").hpf(saw.range(300,9000)).gain(.09).mask(M_RISE)
```

---

## 5 — AMBIENT / CLOUD

```js
// ladder: shimmer → low pulse → breath → drone → harmonic cloud → motif → atmosphere
const ALT=.65, WIND=.45, EDGE=.05, SEED=1337
const PROG="<[c3,eb3,g3] [ab2,c3,eb3] [eb3,g3,bb3] [bb2,d3,f3]>"
const PATH="<[0 7 3 10] [3 10 7 5] [7 3 5 10] [10 7 3 0]>"
setcpm((60+ALT*30)/4)
const M_HATS="<1!32>", M_HATSD="<0!8 1!24>"
const M_KICK="<0!4 1!20 0!4 1!4>", M_KICKD="<0!12 1!12 0!4 1!4>"
const M_SNARE="<0!8 1!16 0!4 1!4>", M_SNARED="<0!16 1!8 0!4 1!4>"
const M_BASS="<0!8 1!20 0!4>", M_SUB="<0!12 1!16 0!4>"
const M_HARM="<0!8 1!24>", M_HARMD="<0!16 1!16>"
const M_MEL="<0!16 1!12 0!4>", M_MELD="<0!22 1!6 0!4>"
const M_TEX="<1!32>", M_TEXD="<0!12 1!20>", M_RISE="<0!15 1 0!15 1>"

$: s("brown").clip(1).lpf(500+ALT*1200).room(.95).size(10).gain(.08)
// 1 SHIMMER — CORE + DEEP
$: s("hh ~ ~ ~ hh ~ ~ ~").bank("KorgDDM110").hpf(7000).room(.9).size(8).gain(.07).mask(M_HATS)
$: s("white").hpf(9000).room(.95).size(10).gain(.035).mask(M_HATSD)
// 2 LOW PULSE — CORE + DEEP
$: s("bd ~ ~ ~ ~ ~ ~ ~").bank("KorgDDM110").lpf(900).room(.6).gain(.2).mask(M_KICK)
$: s("lt ~ ~ ~ ~ ~ ~ ~").bank("LinnLM1").slow(2).lpf(700).room(.8).gain(.1).mask(M_KICKD)
// 3 BREATH — CORE + DEEP
$: s("~ ~ sd ~ ~ ~ ~ ~").bank("LinnLM1").hpf(1200).room(.9).gain(.07).mask(M_SNARE)
$: s("pink").clip(.3).hpf(2500).room(.95).gain(.06).mask(M_SNARED)
// 4 DRONE — CORE + DEEP
$: note("<c1 ab0 eb1 bb0>").s("sine").attack(1).release(2).lpf(180).gain(.55).mask(M_BASS)
$: note("<g1 eb1 bb1 f1>").s("triangle").attack(1.5).release(2).lpf(450).gain(.15).mask(M_SUB)
// 5 HARMONIC CLOUD — CORE + DEEP
$: note(PROG).s("supersaw").attack(1.2).release(2.5).lpf(800+ALT*1500).room(.9).size(9).gain(.13).mask(M_HARM)
$: note(PROG).add(note(12)).s("harp").slow(2).room(.9).gain(.1).mask(M_HARMD)
// 6 MOTIF — CORE + DEEP
$: n(PATH).scale("C5:minor").slow(2).s("vibraphone").room(.9).size(8).delay(".4:.375:.55").gain(.13).mask(M_MEL)
$: n(PATH).add(7).scale("C5:minor").slow(4).s("fmpiano").room(.95).gain(.07).mask(M_MELD)
// 7 ATMOSPHERE — CORE + DEEP
$: s("pink").lpf(2500).room(.95).gain(.07).mask(M_TEX)
$: s("crackle").hpf(4000).degradeBy(.65).room(.9).gain(.035).mask(M_TEXD)
// TRANSITION
$: s("white").hpf(saw.range(100,10000).slow(1)).attack(.8).release(.8).gain(.06).mask(M_RISE)
```

---

## 6 — EXPERIMENTAL / MUTATION

```js
// ladder: ticks → irregular impact → metal → mutant bass → clusters → fragments → noise
const ALT=.55, WIND=.72, EDGE=.65, SEED=1337
const PROG="<[c3,db3,g3] [eb3,gb3,bb3] [db3,f3,b3] [c3,eb3,ab3]>"
const PATH="<[0 6 1 9] [3 8 2 11] [7 1 10 4] [0 11 3 6]>"
setcpm((70+ALT*100)/4)
const M_HATS="<1!24 0!4 1!4>", M_HATSD="<0!8 1!16 0!4 1!4>"
const M_KICK="<0!4 1!20 0!4 1!4>", M_KICKD="<0!10 1!14 0!4 1!4>"
const M_SNARE="<0!8 1!16 0!4 1!4>", M_SNARED="<0!14 1!10 0!4 1!4>"
const M_BASS="<0!10 1!14 0!4 1!4>", M_SUB="<0!16 1!8 0!4 1!4>"
const M_HARM="<0!14 1!10 0!4 1!4>", M_HARMD="<0!18 1!6 0!4 1!4>"
const M_MEL="<0!18 1!6 0!4 1!4>", M_MELD="<0!22 1!2 0!4 1!4>"
const M_TEX="<0!8 1!24>", M_TEXD="<0!16 1!16>", M_RISE="<0!15 1 0!15 1>"

$: s("numbers").slow(4).crush(6).bpf(900+ALT*1800).gain(.06)
// 1 TICKS — CORE + DEEP
$: s("hh ~ [hh hh] ~ hh ~ ~ [hh hh]").bank("SakataDPM48").gain(.18).hpf(5500).mask(M_HATS)
$: s("crackle").degradeBy(.45).hpf(6500).gain(.07).mask(M_HATSD)
// 2 IMPACT — CORE + DEEP
$: s("bd ~ [bd ~] ~ ~ bd ~ bd").bank("SakataDPM48").shape(.2+EDGE*.5).gain(.82).mask(M_KICK)
$: s("<lt ht mt>(5,8)").bank("OberheimDMX").gain(.2).distort(EDGE*2).mask(M_KICKD)
// 3 METAL — CORE + DEEP
$: s("~ sd ~ ~ [~ sd] ~ ~ sd").bank("OberheimDMX").gain(.42).mask(M_SNARE)
$: s("~ rim ~ rim ~ ~ rim ~").bank("SakataDPM48").delay(".3:.125:.4").gain(.16).mask(M_SNARED)
// 4 MUTANT BASS — CORE + DEEP
$: note("<c2 eb2 db2 bb1>").struct("x ~ [x x] ~ x ~ x x").s("square").lpf(250+ALT*1100).lpq(12).distort(1+EDGE*4).gain(.55).mask(M_BASS)
$: note("<c1 db1 bb0 eb1>").s("sine").struct("x ~ ~ x ~ ~ x ~").gain(.72).mask(M_SUB)
// 5 CLUSTERS — CORE + DEEP
$: note(PROG).s("tubularbells").decay(.35).room(.55).gain(.18).mask(M_HARM)
$: note(PROG).add(note(12)).slow(2).s("supersaw").lpf(1100).distort(EDGE).gain(.09).mask(M_HARMD)
// 6 FRAGMENTS — CORE + DEEP
$: n(PATH).scale("C5:chromatic").s("marimba").fast(2).gain(.16).sometimes(x=>x.rev()).mask(M_MEL)
$: n(PATH).add(7).scale("C5:chromatic").slow(2).s("casio").crush(7).gain(.08).mask(M_MELD)
// 7 NOISE — CORE + DEEP
$: s("bytebeat").slow(2).lpf(1800).crush(5).gain(.08).mask(M_TEX)
$: s("white").bpf(sine.range(500,6000).slow(7)).gain(.04).mask(M_TEXD)
// TRANSITION
$: s("numbers").fast(4).hpf(saw.range(200,9000)).gain(.07).mask(M_RISE)
```

---

## 7 — BREAKBEAT / BROKEN

```js
// ladder: break hats → broken kick → snare → distorted bass → stab → riff → grit
const ALT=.55, WIND=.80, EDGE=.38, SEED=1337
const PROG="<[c3,db3,gb3] [bb2,db3,f3] [ab2,c3,eb3] [c3,eb3,g3]>"
const PATH="<[0 3 6 3] [7 5 3 1] [0 1 3 6] [5 3 1 0]>"
setcpm((132+ALT*20)/4)
const M_HATS="<1!24 0!4 1!4>", M_HATSD="<0!6 1!18 0!4 1!4>"
const M_KICK="<0!4 1!20 0!4 1!4>", M_KICKD="<0!12 1!12 0!4 1!4>"
const M_SNARE="<0!6 1!18 0!4 1!4>", M_SNARED="<0!14 1!10 0!4 1!4>"
const M_BASS="<0!10 1!14 0!4 1!4>", M_SUB="<0!14 1!10 0!4 1!4>"
const M_HARM="<0!14 1!10 0!4 1!4>", M_HARMD="<0!20 1!4 0!4 1!4>"
const M_MEL="<0!18 1!6 0!4 1!4>", M_MELD="<0!22 1!2 0!4 1!4>"
const M_TEX="<0!12 1!12 0!4 1!4>", M_TEXD="<0!20 1!4 0!4 1!4>", M_RISE="<0!15 1 0!15 1>"

$: s("brown").clip(1).lpf(420).gain(.07).room(.55).orbit(3)
// 1 BREAK HATS — CORE + DEEP
$: s("hh ~ hh [hh hh] ~ hh ~ hh").bank("YamahaRY30").gain("[.2 .12 .26 .14]*2").hpf(5200).mask(M_HATS)
$: s("~ rim ~ [rim rim] ~ ~ rim ~").bank("YamahaRY30").gain(.12).hpf(1800).mask(M_HATSD)
// 2 BROKEN KICK — CORE + DEEP
$: s("bd ~ ~ bd ~ ~ [bd ~] ~").bank("RolandTR909").shape(.28+EDGE*.35).gain(1.08).mask(M_KICK)
$: s("~ lt ~ ~ mt ~ [ht ~] ~").bank("YamahaRY30").gain(.14).mask(M_KICKD)
// 3 SNARE — CORE + DEEP
$: s("~ ~ sd ~ ~ ~ sd ~").bank("RolandTR909").gain(.76).room(.2).mask(M_SNARE)
$: s("~ sd ~ [sd ~] ~ rim ~ ~").bank("YamahaRY30").gain(.16).late(.012).mask(M_SNARED)
// 4 DISTORTED BASS — CORE + DEEP
$: note("<c2 ~ ~ c2 ~ eb2 db2 ~>").s("sawtooth").lpf(240+ALT*500).lpq(9).distort(1+EDGE*3).gain(.56).mask(M_BASS)
$: note("<c1 ~ ~ c1 ~ eb1 ~ bb0>").s("sine").lpf(100).gain(1.02).mask(M_SUB)
// 5 STAB — CORE + DEEP
$: note(PROG).struct("x ~ ~ x ~ ~ ~ x").s("square").lpf(650+ALT*900).decay(.1).room(.25).gain(.22).mask(M_HARM)
$: note(PROG).add(note(12)).slow(2).s("fmpiano").lpf(1800).gain(.08).mask(M_HARMD)
// 6 RIFF — CORE + DEEP
$: n(PATH).scale("C4:minor").s("clavisynth").decay(.1).delay(".2:.125:.28").gain(.2).mask(M_MEL)
$: n(PATH).add(7).scale("C4:minor").fast(2).s("pulse").degradeBy(.3).gain(.08).mask(M_MELD)
// 7 GRIT — CORE + DEEP
$: s("bytebeat").slow(2).crush(7).lpf(2400).gain(.06).mask(M_TEX)
$: s("crackle").hpf(3500).gain(.06).room(.5).mask(M_TEXD)
// TRANSITION
$: s("white").hpf(saw.range(300,11000)).attack(.35).release(.3).gain(.1).mask(M_RISE)
```

---

## 8 — D&B / VELOCITY

```js
// ladder: hats/break → kick → snare → sub/Reese → pad/stab → signal → velocity noise
const ALT=.70, WIND=.82, EDGE=.32, SEED=1337
const PROG="<[c3,eb3,g3] [bb2,db3,f3] [ab2,c3,eb3] [g2,bb2,d3]>"
const PATH="<[0 3 7 10] [7 5 3 1] [0 2 3 7] [10 7 3 0]>"
setcpm((160+ALT*20)/4)
const M_HATS="<1!24 0!4 1!4>", M_HATSD="<0!4 1!20 0!4 1!4>"
const M_KICK="<0!4 1!20 0!4 1!4>", M_KICKD="<0!10 1!14 0!4 1!4>"
const M_SNARE="<0!4 1!20 0!4 1!4>", M_SNARED="<0!12 1!12 0!4 1!4>"
const M_BASS="<0!8 1!16 0!4 1!4>", M_SUB="<0!12 1!12 0!4 1!4>"
const M_HARM="<0!14 1!10 0!4 1!4>", M_HARMD="<0!18 1!6 0!4 1!4>"
const M_MEL="<0!18 1!6 0!4 1!4>", M_MELD="<0!22 1!2 0!4 1!4>"
const M_TEX="<0!8 1!16 0!4 1!4>", M_TEXD="<0!18 1!6 0!4 1!4>", M_RISE="<0!15 1 0!15 1>"

$: s("brown").clip(1).lpf(300).gain(.06).room(.6).orbit(3)
// 1 BREAK/HATS — CORE + DEEP
$: s("hh*16").bank("EmuSP12").gain("[.08 .16 .1 .22]*4").hpf(5200).mask(M_HATS)
$: s("~ rim ~ [rim ~] ~ rim ~ [~ rim]").bank("AkaiMPC60").gain(.1).hpf(1800).mask(M_HATSD)
// 2 KICK — CORE + DEEP
$: s("bd ~ ~ ~ ~ bd ~ ~").bank("EmuSP12").shape(.2+EDGE*.3).gain(.94).mask(M_KICK)
$: s("~ bd ~ ~ bd ~ [bd ~] ~").bank("AkaiMPC60").gain(.27).mask(M_KICKD)
// 3 SNARE — CORE + DEEP
$: s("~ ~ sd ~ ~ ~ sd ~").bank("EmuSP12").gain(.88).room(.16).mask(M_SNARE)
$: s("~ sd ~ [sd ~] ~ ~ sd ~").bank("AkaiMPC60").gain(.18).late(.01).mask(M_SNARED)
// 4 SUB/REESE — CORE + DEEP
$: note("<c2 ~ ~ c2 ~ bb1 db2 ~>").s("sawtooth").lpf(260+ALT*500).lpq(8).distort(1+EDGE*2.5).gain(.36).mask(M_BASS)
$: note("<c1 ~ ~ ~ c1 ~ bb0 ~>").s("sine").lpf(95).gain(1.1).mask(M_SUB)
// 5 PAD/STAB — CORE + DEEP
$: note(PROG).slow(2).s("fmpiano").lpf(950+ALT*700).room(.45).gain(.12).mask(M_HARM)
$: note(PROG).add(note(12)).struct("~ x ~ ~ ~ ~ x ~").s("square").decay(.08).gain(.09).mask(M_HARMD)
// 6 SIGNAL — CORE + DEEP
$: n(PATH).scale("C5:minor").slow(2).s("triangle").delay(".18:.125:.28").gain(.11).mask(M_MEL)
$: n(PATH).add(7).scale("C5:minor").fast(2).s("fmpiano").degradeBy(.42).gain(.06).mask(M_MELD)
// 7 VELOCITY NOISE — CORE + DEEP
$: s("white").hpf(6500).gain(.045).pan(sine.range(.2,.8).slow(2)).mask(M_TEX)
$: s("bytebeat").fast(2).crush(8).bpf(1200+ALT*2600).gain(.045).mask(M_TEXD)
// TRANSITION
$: s("white").hpf(saw.range(400,12000)).attack(.25).release(.2).gain(.09).mask(M_RISE)
```

---

## 9 — DUB / ECHO

```js
// ladder: hats → kick → rim → sub → skank → melodic echo → tape/noise
const ALT=.40, WIND=.70, EDGE=.08, SEED=1337
const PROG="<[c3,eb3,g3] [bb2,d3,f3] [ab2,c3,eb3] [g2,bb2,d3]>"
const PATH="<[0 7 3 5] [7 5 3 0] [3 5 7 10] [5 3 2 0]>"
setcpm((60+ALT*30)/4)
const M_HATS="<1!24 0!4 1!4>", M_HATSD="<0!8 1!16 0!4 1!4>"
const M_KICK="<0!4 1!20 0!4 1!4>", M_KICKD="<0!14 1!10 0!4 1!4>"
const M_SNARE="<0!8 1!16 0!4 1!4>", M_SNARED="<0!14 1!10 0!4 1!4>"
const M_BASS="<0!8 1!16 0!4 1!4>", M_SUB="<0!12 1!12 0!4 1!4>"
const M_HARM="<0!10 1!14 0!4 1!4>", M_HARMD="<0!16 1!8 0!4 1!4>"
const M_MEL="<0!16 1!8 0!4 1!4>", M_MELD="<0!22 1!2 0!4 1!4>"
const M_TEX="<0!12 1!12 0!4 1!4>", M_TEXD="<0!20 1!4 0!4 1!4>", M_RISE="<0!15 1 0!15 1>"

$: s("brown").clip(1).lpf(260+ALT*500).gain(.08).room(.85).size(8).orbit(3)
// 1 HATS — CORE + DEEP
$: s("~ hh ~ ~ ~ hh ~ ~").bank("RolandCompuRhythm1000").gain(.1).hpf(4800).mask(M_HATS)
$: s("~ ~ perc ~ ~ perc ~ ~").bank("RolandCompuRhythm8000").gain(.08).delay(".32:.25:.45").mask(M_HATSD)
// 2 KICK — CORE + DEEP
$: s("bd ~ ~ ~ bd ~ ~ ~").bank("RolandCompuRhythm1000").gain(.72).lpf(2600).mask(M_KICK)
$: s("~ lt ~ ~ ~ ~ lt ~").bank("RolandCompuRhythm8000").gain(.12).room(.4).mask(M_KICKD)
// 3 RIM — CORE + DEEP
$: s("~ ~ rim ~ ~ ~ rim ~").bank("RolandCompuRhythm8000").gain(.27).delay(".38:.25:.52").mask(M_SNARE)
$: s("~ sd ~ ~ ~ sd ~ ~").bank("RolandCompuRhythm1000").gain(.11).room(.45).mask(M_SNARED)
// 4 SUB — CORE + DEEP
$: note("<c2 ~ ~ g1 ~ bb1 ~ c2>").s("triangle").lpf(220).decay(.4).gain(.26).mask(M_BASS)
$: note("<c1 ~ ~ ~ bb0 ~ ~ g0>").s("sine").lpf(90).release(.35).gain(1.12).mask(M_SUB)
// 5 SKANK — CORE + DEEP
$: note(PROG).struct("~ x ~ ~ ~ x ~ ~").s("organ_full").lpf(900+ALT*500).decay(.16).delay(".4:.375:.55").room(.35).gain(.18).mask(M_HARM)
$: note(PROG).add(note(12)).struct("~ ~ ~ x ~ ~ ~ x").s("piano").lpf(1400).delay(".5:.5:.6").gain(.08).mask(M_HARMD)
// 6 MELODIC ECHO — CORE + DEEP
$: n(PATH).scale("C4:minor").slow(2).s("harmonica").room(.35).delay(".45:.375:.5").gain(.13).mask(M_MEL)
$: n(PATH).add(7).scale("C4:minor").slow(4).s("vibraphone").delay(".6:.5:.65").gain(.06).mask(M_MELD)
// 7 TAPE/NOISE — CORE + DEEP
$: s("crackle").hpf(2800).gain(.05).delay(".3:.25:.35").mask(M_TEX)
$: s("brown").lpf(420).room(.95).gain(.04).mask(M_TEXD)
// TRANSITION
$: s("white").bpf(saw.range(300,6500)).attack(.6).release(.7).delay(".4:.375:.5").gain(.06).mask(M_RISE)
```

---

## 10 — TRAP / GRAVITY

```js
// ladder: hats → kick → snare → sub/slide → dark harmony → bell motif → atmosphere
const ALT=.50, WIND=.82, EDGE=.24, SEED=1337
const PROG="<[c3,eb3,g3] [bb2,db3,f3] [ab2,c3,eb3] [gb2,bb2,db3]>"
const PATH="<[0 3 7 6] [10 6 3 0] [0 7 3 6] [10 7 6 3]>"
setcpm((130+ALT*20)/4)
const M_HATS="<1!24 0!4 1!4>", M_HATSD="<0!8 1!16 0!4 1!4>"
const M_KICK="<0!4 1!20 0!4 1!4>", M_KICKD="<0!12 1!12 0!4 1!4>"
const M_SNARE="<0!8 1!16 0!4 1!4>", M_SNARED="<0!16 1!8 0!4 1!4>"
const M_BASS="<0!8 1!16 0!4 1!4>", M_SUB="<0!12 1!12 0!4 1!4>"
const M_HARM="<0!14 1!10 0!4 1!4>", M_HARMD="<0!18 1!6 0!4 1!4>"
const M_MEL="<0!16 1!8 0!4 1!4>", M_MELD="<0!20 1!4 0!4 1!4>"
const M_TEX="<0!12 1!12 0!4 1!4>", M_TEXD="<0!22 1!2 0!4 1!4>", M_RISE="<0!15 1 0!15 1>"

$: s("brown").clip(1).lpf(300+ALT*400).gain(.07).room(.7).orbit(3)
// 1 HATS — CORE + DEEP
$: s("hh*8").bank("AkaiXR10").gain("[.16 .09]*4").hpf(4200).mask(M_HATS)
$: s("~ ~ [hh hh hh] ~ ~ [hh hh hh hh] ~ ~").bank("AkaiXR10").gain(.09).hpf(5200).mask(M_HATSD)
// 2 KICK — CORE + DEEP
$: s("bd ~ ~ bd ~ ~ [bd ~] ~").bank("LinnLM2").shape(.25+EDGE*.35).gain(1.05).mask(M_KICK)
$: s("~ lt ~ ~ ~ lt ~ ~").bank("LinnLM2").gain(.13).lpf(1600).mask(M_KICKD)
// 3 SNARE — CORE + DEEP
$: s("~ ~ ~ ~ sd ~ ~ ~").bank("AkaiXR10").gain(.78).room(.18).mask(M_SNARE)
$: s("~ rim ~ ~ ~ ~ rim ~").bank("LinnLM2").gain(.11).hpf(1400).mask(M_SNARED)
// 4 SUB/SLIDE — CORE + DEEP
$: note("<c2 ~ ~ c2 ~ eb2 db2 ~>").s("square").lpf(210).shape(.32+EDGE*.25).gain(.24).mask(M_BASS)
$: note("<c1 ~ ~ c1 ~ eb1 ~ bb0>").s("sine").lpf(95).release(.4).gain(1.12).sometimesBy(.18,x=>x.off(1/16,y=>y.add(note(2)))).mask(M_SUB)
// 5 DARK HARMONY — CORE + DEEP
$: note(PROG).slow(2).s("fmpiano").lpf(850+ALT*600).room(.3).gain(.13).mask(M_HARM)
$: note(PROG).add(note(12)).slow(4).s("casio").lpf(1200).gain(.065).mask(M_HARMD)
// 6 BELL MOTIF — CORE + DEEP
$: n(PATH).scale("C5:minor").slow(2).s("glockenspiel").lpf(2300).room(.32).delay(".18:.125:.25").gain(.11).mask(M_MEL)
$: n(PATH).add(7).scale("C5:minor").slow(4).s("piano").lpf(1500).room(.4).gain(.06).mask(M_MELD)
// 7 ATMOSPHERE — CORE + DEEP
$: s("crackle").slow(4).hpf(2800).gain(.045).mask(M_TEX)
$: s("numbers").slow(8).crush(8).lpf(1800).room(.5).gain(.025).mask(M_TEXD)
// TRANSITION
$: s("white").hpf(saw.range(250,9000)).attack(.45).release(.35).gain(.08).mask(M_RISE)
```

---

## Palette-regel

Alle gebruikte drumdelen bestaan op de gekozen machines. Alle pitched voices komen uit de FREQUENCY `VOICE_SOUNDS`-allowlist of uit de altijd beschikbare synth/noise-laag. **Never invent a sound: silence is a bug.**
