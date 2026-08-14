import { g3, type PresetWorld } from './PresetWorlds';

/**
 * §111: four more documents. Each one is written exactly as it was given —
 * its own masks, its own machines, its own gains — with ALT, WIND and EDGE
 * live from the flight instead of frozen at the top.
 *
 * The one thing that had to be decided rather than copied is where each
 * document's ladder meets our seven rungs, because the titles do not line up:
 * a "break engine" is a hat rung, a "ghost kick" is the kick's second machine,
 * a "growl" is the bass grown deep. Those choices are named in each spec, so
 * that what a player earns when is readable rather than buried.
 */

const RISE = '<0!15 1 0!15 1>';

// ═══════════════════════════════════════════════════════════════
// HEAVY SIGNAL / REDLINE — 148 bpm, overheated metal
//
// ladder: break engine → kick wall → snare wall → sub → body/reese
//         → rave system → destruction
// ═══════════════════════════════════════════════════════════════
export const HEAVY_SIGNAL: PresetWorld = {
  bpmBase: 148,
  bpmLift: 6,
  parts: [
    {
      id: 'atmosphere', kind: 'texture', layer: 'atmosphere', role: 'texture', deep: false,
      section: 'ATMOSPHERE',
      gain: () => 0.04,
      code: (v, g) => `s("brown").clip(1).lpf(${Math.round(240 + v.ALT * 500)}).gain(${g}).room(.75).orbit(3)`,
    },
    {
      id: 'break-engine', kind: 'hat', layer: 'drums', role: 'hats', deep: false,
      section: '1. BREAK ENGINE',
      gain: () => 0.13,
      code: (_v, g) => `s("hh ~ hh [hh hh] ~ hh [hh hh] hh").bank("AkaiMPC60").hpf(6800).gain(${g}).mask("<1!24 0!4 1!4>")`,
    },
    {
      id: 'micro-pressure', kind: 'hat', layer: 'drums', role: 'hats', deep: true,
      section: 'DEEP — MICRO PRESSURE',
      gain: () => 0.04,
      code: (v, g) => `s("hh*32").bank("EmuSP12").degradeBy(${g3(0.45 + (1 - v.WIND) * 0.2)}).hpf(10000).gain(${g}).mask("<0!8 1!16 0!4 1!4>")`,
    },
    {
      id: 'broken-perc', kind: 'perc', layer: 'drums', role: 'hats', deep: true,
      section: 'BROKEN PERCUSSION',
      gain: () => 0.13,
      code: (_v, g) => `s("~ rim ~ [rim rim] ~ rim ~ [rim rim]").bank("OberheimDMX").hpf(2200).gain(${g}).mask("<0!8 1!16 0!4 1!4>")`,
    },
    {
      id: 'kick-wall', kind: 'kick', layer: 'drums', role: 'kick', deep: false,
      section: '2. KICK WALL',
      gain: () => 1.06,
      code: (v, g) => `s("bd ~ bd ~ ~ bd [bd ~] bd").bank("EmuSP12").shape(${g3(0.32 + v.EDGE * 0.2)}).distort(${g3(0.35 + v.EDGE * 0.55)}).postgain(.64).gain(${g}).mask("<0!4 1!20 0!4 1!4>")`,
    },
    {
      id: 'kick-second', kind: 'kick', layer: 'drums', role: 'kick', deep: true,
      section: 'DEEP — SECOND MACHINE',
      gain: () => 0.23,
      code: (_v, g) => `s("~ ~ ~ bd ~ ~ bd ~").bank("AkaiMPC60").lpf(1800).shape(.35).gain(${g}).mask("<0!12 1!12 0!4 1!4>")`,
    },
    {
      id: 'snare-wall', kind: 'snare', layer: 'drums', role: 'snare', deep: false,
      section: '3. SNARE WALL',
      gain: () => 0.86,
      code: (_v, g) => `s("~ ~ sd ~ ~ ~ sd ~").bank("EmuSP12").shape(.4).distort(.5).gain(${g}).mask("<0!8 1!16 0!4 1!4>")`,
    },
    {
      id: 'snare-body', kind: 'snare', layer: 'drums', role: 'snare', deep: true,
      section: 'DEEP — BODY FROM ANOTHER MACHINE',
      gain: () => 0.21,
      code: (_v, g) => `s("~ ~ sd ~ ~ ~ sd ~").bank("OberheimDMX").late(.012).hpf(1200).gain(${g}).mask("<0!12 1!12 0!4 1!4>")`,
    },
    {
      id: 'sub', kind: 'sub', layer: 'bass', role: 'bass', deep: false,
      section: '4. SUB — off-kick placement is impact, not mud',
      gain: () => 1,
      code: (_v, g) => `note("~ c1 ~ c1 ~ ~ bb0 db1").s("sine").lpf(86).attack(.002).decay(.4).sustain(.38).release(.07).gain(${g}).orbit(2).mask("<0!12 1!12 0!4 1!4>")`,
    },
    {
      id: 'bass-body', kind: 'bass', layer: 'bass', role: 'bass', deep: false,
      section: '5. BASS BODY',
      gain: () => 0.52,
      code: (v, g) => `note("~ c2 ~ c2 ~ ~ bb1 db2").s("sawtooth").lpf(${Math.round(330 + v.ALT * 100)}).lpq(11).distort(${g3(1.8 + v.EDGE)}).postgain(.28).gain(${g}).orbit(2).mask("<0!16 1!8 0!4 1!4>")`,
    },
    {
      id: 'reese', kind: 'bass', layer: 'bass', role: 'bass', deep: true,
      section: 'DEEP — REESE',
      gain: () => 0.18,
      code: (v, g) => `note("~ ~ c2 ~ db2 ~ ~ c2").s("square").hpf(145).lpf(${Math.round(800 + v.ALT * 200)}).lpq(10).distort(${g3(2 + v.EDGE)}).postgain(.22).gain(${g}).orbit(2).mask("<0!20 1!4 0!4 1!4>")`,
    },
    {
      id: 'bass-response', kind: 'response', layer: 'bass', role: 'bass', deep: true,
      section: 'DROP II EXCLUSIVE — BASS RESPONSE',
      gain: () => 0.14,
      code: (_v, g) => `note("~ ~ ~ eb2 ~ c2 db2 ~").s("square").hpf(170).lpf(620).decay(.06).distort(2.4).postgain(.23).gain(${g}).mask("<0!28 1!4>")`,
    },
    {
      id: 'rave-system', kind: 'chord', layer: 'harmony', role: 'harmony', deep: false,
      section: '6. RAVE SYSTEM',
      gain: () => 0.12,
      code: (v, g) => `note("<[c3,db3,g3] ~ ~ [bb2,db3,gb3] ~ ~ [c3,eb3,ab3] ~>").s("supersaw").lpf(${Math.round(950 + v.ALT * 350)}).lpq(8).decay(.055).distort(${g3(0.6 + v.EDGE * 0.6)}).postgain(.3).gain(${g}).mask("<0!16 1!8 0!4 1!4>")`,
    },
    {
      id: 'acid', kind: 'chord', layer: 'harmony', role: 'harmony', deep: true,
      section: 'DEEP — ACID MACHINE',
      gain: () => 0.1,
      code: (v, g) => `note("c3 ~ c3 db3 ~ g2 [c3 eb3] ~").s("pulse").lpf(${Math.round(550 + v.ALT * 300)}).lpq(12).decay(.045).distort(${g3(1.2 + v.EDGE)}).postgain(.27).gain(${g}).mask("<0!20 1!4 0!4 1!4>")`,
    },
    {
      id: 'signal', kind: 'melody', layer: 'melody', role: 'melody', deep: false,
      section: 'SIGNAL',
      gain: () => 0.065,
      code: (_v, g) => `note("c5 ~ ~ eb5 ~ db5 [g4 db5] ~").s("clavisynth").decay(.035).hpf(800).distort(.6).delay(.1).gain(${g}).mask("<0!20 1!4 0!4 1!4>")`,
    },
    {
      id: 'destruction', kind: 'texture', layer: 'texture', role: 'texture', deep: false,
      section: '7. DESTRUCTION',
      gain: () => 0.025,
      code: (v, g) => `s("bytebeat").slow(2).bpf(1350).crush(4).distort(${g3(1 + v.EDGE * 0.5)}).postgain(.3).gain(${g}).mask("<0!16 1!8 0!4 1!4>")`,
    },
    {
      id: 'damage-air', kind: 'noise', layer: 'texture', role: 'texture', deep: true,
      section: 'DROP II EXTRA AIR',
      gain: () => 0.025,
      code: (_v, g) => `s("white*16").degradeBy(.5).hpf(8500).distort(.4).gain(${g}).mask("<0!28 1!4>")`,
    },
    {
      id: 'transition', kind: 'texture', layer: 'atmosphere', role: 'texture', deep: false,
      section: 'TRANSITION',
      gain: () => 0.085,
      code: (_v, g) => `s("white").clip(1).hpf(4500).attack(.35).release(.3).room(.45).distort(.25).gain(${g}).mask("${RISE}")`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// BROKEN MACHINE X — 144 bpm, acid-green electro
//
// ladder: hats → kick → snare → bass → acid pulse → signal → micro
//         (the ghost kick is the kick's second machine, the rim the snare's)
// ═══════════════════════════════════════════════════════════════
export const BROKEN_MACHINE: PresetWorld = {
  bpmBase: 144,
  bpmLift: 6,
  parts: [
    {
      id: 'atmosphere', kind: 'texture', layer: 'atmosphere', role: 'texture', deep: false,
      section: 'ATMOSPHERE',
      gain: () => 0.018,
      code: (_v, g) => `s("crackle").hpf(5000).gain(${g}).room(.4)`,
    },
    {
      id: 'electro-hats', kind: 'hat', layer: 'drums', role: 'hats', deep: false,
      section: '1. ELECTRO HATS',
      gain: () => 0.12,
      code: (_v, g) => `s("hh ~ hh [hh hh] ~ hh [hh hh] hh").bank("SakataDPM48").hpf(6800).gain(${g}).mask("<1!24 0!4 1!4>")`,
    },
    {
      id: 'broken-kick', kind: 'kick', layer: 'drums', role: 'kick', deep: false,
      section: '2. BROKEN KICK',
      gain: () => 1.04,
      code: (v, g) => `s("bd ~ bd ~ ~ [bd ~] bd ~").bank("OberheimDMX").shape(${g3(0.3 + v.EDGE * 0.2)}).distort(${g3(0.35 + v.EDGE * 0.5)}).postgain(.65).gain(${g}).mask("<0!4 1!20 0!4 1!4>")`,
    },
    {
      id: 'ghost-kick', kind: 'kick', layer: 'drums', role: 'kick', deep: true,
      section: 'DEEP — GHOST KICK',
      gain: () => 0.22,
      code: (_v, g) => `s("~ ~ ~ bd ~ bd ~ [~ bd]").bank("AkaiXR10").lpf(1800).gain(${g}).mask("<0!12 1!12 0!4 1!4>")`,
    },
    {
      id: 'snare', kind: 'snare', layer: 'drums', role: 'snare', deep: false,
      section: '3. SNARE',
      gain: () => 0.8,
      code: (_v, g) => `s("~ ~ sd ~ ~ ~ sd ~").bank("AkaiXR10").shape(.35).distort(.4).gain(${g}).mask("<0!8 1!16 0!4 1!4>")`,
    },
    {
      id: 'rim', kind: 'perc', layer: 'drums', role: 'snare', deep: true,
      section: 'DEEP — RIM',
      gain: () => 0.13,
      code: (_v, g) => `s("~ rim ~ [rim rim] ~ rim [~ rim] ~").bank("OberheimDMX").hpf(2100).gain(${g}).mask("<0!12 1!12 0!4 1!4>")`,
    },
    {
      id: 'sub', kind: 'sub', layer: 'bass', role: 'bass', deep: false,
      section: '4. SUB',
      gain: () => 0.98,
      code: (_v, g) => `note("~ c1 ~ c1 ~ eb1 ~ db1").s("sine").lpf(88).decay(.36).sustain(.32).gain(${g}).orbit(2).mask("<0!12 1!12 0!4 1!4>")`,
    },
    {
      id: 'bass-machine', kind: 'bass', layer: 'bass', role: 'bass', deep: false,
      section: '5. BASS MACHINE',
      gain: () => 0.48,
      code: (v, g) => `note("~ c2 ~ c2 ~ eb2 ~ db2").s("square").lpf(390).lpq(12).distort(${g3(1.8 + v.EDGE)}).postgain(.28).gain(${g}).mask("<0!16 1!8 0!4 1!4>")`,
    },
    {
      id: 'reese', kind: 'bass', layer: 'bass', role: 'bass', deep: true,
      section: 'DEEP — REESE',
      gain: () => 0.17,
      code: (v, g) => `note("~ ~ c2 ~ db2 ~ eb2 ~").s("sawtooth").hpf(145).lpf(${Math.round(800 + v.ALT * 200)}).distort(${g3(1.8 + v.EDGE)}).postgain(.24).gain(${g}).mask("<0!20 1!4 0!4 1!4>")`,
    },
    {
      id: 'acid-machine', kind: 'chord', layer: 'harmony', role: 'harmony', deep: false,
      section: '6. ACID MACHINE',
      gain: () => 0.105,
      code: (v, g) => `note("c3 ~ c3 db3 ~ g2 [c3 eb3] ~").s("pulse").lpf(${Math.round(600 + v.ALT * 300)}).lpq(12).decay(.05).distort(${g3(1.3 + v.EDGE)}).postgain(.27).gain(${g}).mask("<0!16 1!8 0!4 1!4>")`,
    },
    {
      id: 'signal', kind: 'melody', layer: 'melody', role: 'melody', deep: false,
      section: '7. SIGNAL',
      gain: () => 0.065,
      code: (v, g) => `note("c5 ~ eb5 ~ db5 [g4 db5] ~ ~").s("clavisynth").decay(.035).hpf(800).distort(${g3(0.4 + v.EDGE * 0.4)}).delay(.1).gain(${g}).mask("<0!20 1!4 0!4 1!4>")`,
    },
    {
      // §111: this world has no bytebeat, so its micro-detail IS the texture
      // rung — the 32nd-note dust that finishes the machine.
      id: 'micro-detail', kind: 'texture', layer: 'texture', role: 'texture', deep: false,
      section: 'MICRO DETAIL',
      gain: () => 0.035,
      code: (_v, g) => `s("hh*32").bank("AkaiXR10").degradeBy(.5).hpf(10000).gain(${g}).mask("<0!8 1!16 0!4 1!4>")`,
    },
    {
      id: 'transition', kind: 'texture', layer: 'atmosphere', role: 'texture', deep: false,
      section: 'TRANSITION',
      gain: () => 0.075,
      code: (_v, g) => `s("white").clip(1).hpf(5500).attack(.3).release(.25).distort(.3).gain(${g}).mask("${RISE}")`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// PERCUSSION RIOT — 140 bpm, ochre: wood, skin, dust
//
// ladder (user decision): rim → percussion → kick → sub → machine bass
//         → machine riff → damage. Toms are the percussion grown deep.
// ═══════════════════════════════════════════════════════════════
export const PERCUSSION_RIOT: PresetWorld = {
  bpmBase: 140,
  bpmLift: 6,
  parts: [
    {
      id: 'atmosphere', kind: 'texture', layer: 'atmosphere', role: 'texture', deep: false,
      section: 'ATMOSPHERE',
      gain: () => 0.018,
      code: (_v, g) => `s("white").clip(1).hpf(7500).gain(${g}).room(.6)`,
    },
    {
      id: 'rim-grid', kind: 'perc', layer: 'drums', role: 'hats', deep: false,
      section: '1. RIM GRID',
      gain: () => 0.14,
      code: (_v, g) => `s("rim ~ ~ rim [~ rim] ~ rim [rim ~]").bank("SakataDPM48").hpf(1900).gain(${g}).mask("<1!24 0!4 1!4>")`,
    },
    {
      id: 'percussion', kind: 'perc', layer: 'drums', role: 'snare', deep: false,
      section: '2. PERCUSSION',
      gain: () => 0.15,
      code: (_v, g) => `s("~ perc ~ perc [perc ~] ~ [perc perc] ~").bank("YamahaRY30").hpf(700).gain(${g}).mask("<0!4 1!20 0!4 1!4>")`,
    },
    {
      id: 'shaker', kind: 'hat', layer: 'drums', role: 'hats', deep: true,
      section: 'DEEP — SHAKER',
      gain: () => 0.06,
      code: (v, g) => `s("sh*16").bank("YamahaRY30").degradeBy(${g3(0.25 + v.EDGE * 0.15)}).hpf(6500).gain(${g}).mask("<0!4 1!20 0!4 1!4>")`,
    },
    {
      id: 'kick', kind: 'kick', layer: 'drums', role: 'kick', deep: false,
      section: '3. KICK',
      gain: () => 1.02,
      code: (v, g) => `s("bd ~ ~ bd ~ [bd ~] ~ bd").bank("SakataDPM48").shape(${g3(0.28 + v.EDGE * 0.2)}).distort(${g3(0.25 + v.EDGE * 0.55)}).postgain(.68).gain(${g}).mask("<0!8 1!16 0!4 1!4>")`,
    },
    {
      id: 'toms', kind: 'perc', layer: 'drums', role: 'snare', deep: true,
      section: '4. TOMS',
      gain: () => 0.18,
      code: (v, g) => `s("lt ~ mt [ht mt] ~ lt ~ [mt ht]").bank("OberheimDMX").hpf(300).distort(${g3(0.4 + v.EDGE * 0.5)}).gain(${g}).mask("<0!12 1!12 0!4 1!4>")`,
    },
    {
      id: 'snare', kind: 'snare', layer: 'drums', role: 'snare', deep: false,
      section: 'SNARE',
      gain: () => 0.76,
      code: (_v, g) => `s("~ ~ sd ~ ~ ~ sd ~").bank("YamahaRY30").shape(.3).gain(${g}).mask("<0!8 1!16 0!4 1!4>")`,
    },
    {
      id: 'sub', kind: 'sub', layer: 'bass', role: 'bass', deep: false,
      section: '5. SUB',
      gain: () => 0.92,
      code: (_v, g) => `note("~ c1 ~ ~ db1 ~ c1 ~").s("sine").lpf(90).decay(.28).sustain(.25).gain(${g}).orbit(2).mask("<0!12 1!12 0!4 1!4>")`,
    },
    {
      id: 'machine-bass', kind: 'bass', layer: 'harmony', role: 'harmony', deep: false,
      section: '6. MACHINE BASS',
      gain: () => 0.4,
      code: (v, g) => `note("~ c2 ~ ~ db2 ~ c2 ~").s("square").lpf(${Math.round(380 + v.ALT * 100)}).lpq(10).distort(${g3(1.6 + v.EDGE)}).postgain(.3).gain(${g}).mask("<0!16 1!8 0!4 1!4>")`,
    },
    {
      id: 'machine-riff', kind: 'melody', layer: 'melody', role: 'melody', deep: false,
      section: '7. MACHINE RIFF',
      gain: () => 0.075,
      code: (v, g) => `note("c4 ~ eb4 [g4 db5] ~ bb4 ~ c5").s("marimba").decay(.045).hpf(700).distort(${g3(0.2 + v.EDGE * 0.4)}).gain(${g}).mask("<0!16 1!8 0!4 1!4>")`,
    },
    {
      id: 'metallic', kind: 'melody', layer: 'melody', role: 'melody', deep: true,
      section: 'DEEP — METALLIC RESPONSE',
      gain: () => 0.04,
      code: (_v, g) => `note("~ g4 ~ db5 ~ ~ eb5 ~").s("tubularbells").hpf(1000).decay(.08).room(.35).gain(${g}).mask("<0!20 1!4 0!4 1!4>")`,
    },
    {
      id: 'damage', kind: 'texture', layer: 'texture', role: 'texture', deep: false,
      section: 'DAMAGE',
      gain: () => 0.025,
      code: (_v, g) => `s("bytebeat").slow(2).bpf(1100).crush(4).distort(1).postgain(.3).gain(${g}).mask("<0!24 1!8>")`,
    },
    {
      id: 'transition', kind: 'texture', layer: 'atmosphere', role: 'texture', deep: false,
      section: 'TRANSITION',
      gain: () => 0.08,
      code: (_v, g) => `s("white").clip(1).hpf(5000).attack(.35).release(.25).room(.4).gain(${g}).mask("${RISE}")`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// VOID CRUSHER — 134 bpm, violet-black: emptiness under pressure
//
// ladder: machine pulse → kick → snare → sub → void stab → hats → damage
//         (the growl is the bass grown deep, the alarm the stab's answer)
// ═══════════════════════════════════════════════════════════════
export const VOID_CRUSHER: PresetWorld = {
  bpmBase: 134,
  bpmLift: 6,
  parts: [
    {
      id: 'atmosphere', kind: 'texture', layer: 'atmosphere', role: 'texture', deep: false,
      section: 'ATMOSPHERE',
      gain: () => 0.05,
      code: (v, g) => `s("brown").clip(1).lpf(${Math.round(220 + v.ALT * 500)}).gain(${g}).room(.9).orbit(3)`,
    },
    {
      id: 'machine-pulse', kind: 'melody', layer: 'melody', role: 'melody', deep: false,
      section: '1. MACHINE PULSE',
      gain: () => 0.075,
      code: (v, g) => `note("c3 ~ ~ ~ db3 ~ ~ g2").s("pulse").lpf(${Math.round(500 + v.ALT * 400)}).lpq(10).decay(.055).distort(${g3(0.8 + v.EDGE)}).postgain(.3).gain(${g}).mask("<0!4 1!20 0!4 1!4>")`,
    },
    {
      id: 'kick', kind: 'kick', layer: 'drums', role: 'kick', deep: false,
      section: '2. KICK',
      gain: () => 1,
      code: (v, g) => `s("bd ~ ~ ~ ~ bd [~ bd] ~").bank("SequentialCircuitsDrumtracks").shape(${g3(0.3 + v.EDGE * 0.2)}).distort(${g3(0.3 + v.EDGE * 0.55)}).postgain(.65).gain(${g}).mask("<0!8 1!16 0!4 1!4>")`,
    },
    {
      id: 'kick-deep', kind: 'kick', layer: 'drums', role: 'kick', deep: true,
      section: 'DEEP KICK',
      gain: () => 0.2,
      code: (_v, g) => `s("~ ~ ~ ~ bd ~ ~ bd").bank("OberheimDMX").lpf(1700).gain(${g}).mask("<0!16 1!8 0!4 1!4>")`,
    },
    {
      id: 'snare', kind: 'snare', layer: 'drums', role: 'snare', deep: false,
      section: '3. SNARE',
      gain: () => 0.78,
      code: (_v, g) => `s("~ ~ sd ~ ~ ~ sd ~").bank("RolandR8").shape(.3).distort(.35).gain(${g}).mask("<0!8 1!16 0!4 1!4>")`,
    },
    {
      id: 'hats', kind: 'hat', layer: 'drums', role: 'hats', deep: false,
      section: 'HATS',
      gain: () => 0.09,
      code: (_v, g) => `s("~ hh ~ ~ [hh hh] ~ hh ~").bank("SequentialCircuitsDrumtracks").hpf(7200).gain(${g}).mask("<0!12 1!12 0!4 1!4>")`,
    },
    {
      id: 'sub', kind: 'sub', layer: 'bass', role: 'bass', deep: false,
      section: '4. SUB',
      gain: () => 1,
      code: (_v, g) => `note("~ c1 ~ ~ ~ bb0 ~ db1").s("sine").lpf(84).attack(.002).decay(.52).sustain(.45).release(.1).gain(${g}).orbit(2).mask("<0!12 1!12 0!4 1!4>")`,
    },
    {
      id: 'bass-body', kind: 'bass', layer: 'bass', role: 'bass', deep: false,
      section: '5. BASS BODY',
      gain: () => 0.5,
      code: (v, g) => `note("~ c2 ~ ~ ~ bb1 ~ db2").s("sawtooth").lpf(310).lpq(11).distort(${g3(1.8 + v.EDGE)}).postgain(.28).gain(${g}).orbit(2).mask("<0!16 1!8 0!4 1!4>")`,
    },
    {
      id: 'growl', kind: 'bass', layer: 'bass', role: 'bass', deep: true,
      section: 'DEEP — GROWL, only when pressure is earned',
      gain: () => 0.17,
      code: (v, g) => `note("~ ~ ~ c2 db2 ~ ~ c2").s("square").hpf(140).lpf(${Math.round(720 + v.ALT * 200)}).lpq(10).distort(${g3(2 + v.EDGE)}).postgain(.22).gain(${g}).orbit(2).mask("<0!20 1!4 0!4 1!4>")`,
    },
    {
      id: 'void-stab', kind: 'chord', layer: 'harmony', role: 'harmony', deep: false,
      section: '6. VOID STAB',
      gain: () => 0.1,
      code: (_v, g) => `note("<~ ~ [c3,db3,g3] ~ ~ ~ [bb2,db3,gb3] ~>").s("organ_full").lpf(700).decay(.08).delay(.32).delayfeedback(.55).distort(.4).gain(${g}).mask("<0!16 1!8 0!4 1!4>")`,
    },
    {
      id: 'alarm', kind: 'chord', layer: 'harmony', role: 'harmony', deep: true,
      section: 'DEEP — ALARM',
      gain: () => 0.035,
      code: (_v, g) => `note("~ ~ ~ db5 ~ ~ g5 ~").s("tubularbells").hpf(1200).room(.6).gain(${g}).mask("<0!20 1!4 0!4 1!4>")`,
    },
    {
      id: 'damage', kind: 'texture', layer: 'texture', role: 'texture', deep: false,
      section: '7. DAMAGE',
      gain: () => 0.018,
      code: (v, g) => `s("crackle").hpf(4500).distort(${g3(0.4 + v.EDGE)}).gain(${g}).mask("<0!28 1!4>")`,
    },
    {
      id: 'transition', kind: 'texture', layer: 'atmosphere', role: 'texture', deep: false,
      section: 'TRANSITION',
      gain: () => 0.08,
      code: (_v, g) => `s("pink").clip(1).hpf(4000).attack(.5).release(.35).room(.7).gain(${g}).mask("${RISE}")`,
    },
  ],
};

/** The defaults each document carries at the top, for a flightless render. */
export const WORLD_DEFAULTS = {
  'heavy-signal': { ALT: 0.82, WIND: 0.95, EDGE: 0.9 },
  'broken-machine': { ALT: 0.68, WIND: 0.9, EDGE: 0.82 },
  'percussion-riot': { ALT: 0.62, WIND: 0.88, EDGE: 0.78 },
  'void-crusher': { ALT: 0.4, WIND: 0.9, EDGE: 0.72 },
} as const;
