import { applyAudibilityFloor } from './AudibilityFloor';
import {
  createEmptyLayerGraph,
  type LayerName,
  type MusicalLayerGraph,
  type MusicalPrimitive,
  type PrimitiveKind,
} from './MusicalPrimitives';
import type { Performance } from '../music/Performance';
import { LEVEL_DEEP, type TrackState } from '../music/TrackState';

/**
 * §110 LOCKED GROOVE / MACHINE PRESSURE V2 — the preset IS the world.
 *
 * Twice I rebuilt this document into the grammar generator, and twice the
 * result fought itself: the masks the preset uses to arrange itself were
 * invisible to the ArrangementEngine, so the two disagreed about what should
 * be sounding and the track came apart (§81, §101). The fix was never to
 * translate it better. It was to stop translating.
 *
 * So this world is the document. Its masks ARE the arrangement — the whole
 * thirty-two cycles, exactly as written — and the section mix does not touch
 * it, because there is only ever one authority over presence (§92, learned the
 * hard way). What the flight supplies is the three performance constants the
 * preset already had at the top, and which rungs the player has earned:
 *
 *   a voice sounds when the LADDER has given it to you AND its own mask says
 *   this is where it belongs.
 *
 * That is not two systems arguing. The composition owns WHEN in the form, the
 * player owns WHETHER at all — and the screen can show this code one for one,
 * because it is the code that is playing.
 */

export interface LockedGroovePresetControls {
  track?: Readonly<TrackState>;
  motion?: number;
  performance?: Readonly<Performance>;
  energy?: number;
  mix?: Partial<Record<LayerName, number>>;
}

/** §110: the arrangement, exactly as the preset writes it. */
export const MASKS = {
  hats: '<1!24 0 1 0 1 1!4>',
  hatsDeep: '<0!8 1!16 0!4 1!4>',
  kick: '<0!4 1!28>',
  kickDeep: '<0!12 1!12 0!4 1!4>',
  snare: '<0!8 1!24>',
  snareDeep: '<0!14 1!10 0!4 1!4>',
  sub: '<0!12 1!20>',
  bass: '<0!16 1!8 0 1 0 1 1!4>',
  reese: '<0!20 1!4 0!4 1!4>',
  stab: '<0!16 1!8 0!2 1!2 1!4>',
  acid: '<0!20 1!12>',
  signal: '<0!22 1!10>',
  texture: '<0!8 1!24>',
  textureDeep: '<0!20 1!12>',
  tension: '<0!24 1!4 0!4>',
  climax: '<0!28 1!4>',
  rise: '<0!15 1 0!7 1!4 0!3 1>',
} as const;

/** The ladder as the preset lists it, after the free atmosphere. */
type Role = 'hats' | 'kick' | 'snare' | 'bass' | 'harmony' | 'melody' | 'texture';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const g3 = (v: number): string => String(Number(v.toFixed(3)));
/** §11: eight steps, or a drifting number re-evaluates the pattern each frame. */
const step8 = (v: number): number => Math.round(clamp01(v) * 8) / 8;

function voice(
  id: string,
  kind: PrimitiveKind,
  layer: LayerName,
  code: string,
): MusicalPrimitive {
  return { id, kind, layer, parameters: { code }, allowedTransforms: [] };
}

function has(track: Readonly<TrackState> | undefined, role: Role, deep: boolean): boolean {
  if (!track) return true;
  const state =
    role === 'hats' ? track.drums.hats
    : role === 'kick' ? track.drums.kick
    : role === 'snare' ? track.drums.snare
    : role === 'bass' ? track.bass
    : role === 'harmony' ? track.harmony
    : role === 'melody' ? track.melody
    : track.texture;
  if (!state.unlocked) return false;
  return deep ? state.level >= LEVEL_DEEP : true;
}

interface Part {
  id: string;
  kind: PrimitiveKind;
  layer: LayerName;
  role: Role;
  deep: boolean;
  /** The preset's own section title, for the score on screen. */
  section: string;
  gain: number;
  code: (gain: string) => string;
}

export function buildLockedGrooveGraph(controls: LockedGroovePresetControls = {}): MusicalLayerGraph {
  const track = controls.track;
  const motion = step8(controls.motion ?? 1);
  const perf = controls.performance;
  // The three constants the preset carries at the top — live, from the flight.
  const ALT = perf ? step8(1 - perf.weight) : 0.62;
  const WIND = perf ? step8((perf.push - 0.75) / 0.45) : 0.88;
  const EDGE = step8(controls.energy ?? 0.68);
  const graph = createEmptyLayerGraph(Math.round(128 + ALT * 10));

  const parts: Part[] = [
    {
      id: 'atmosphere', kind: 'texture', layer: 'atmosphere', role: 'texture', deep: false,
      section: 'ATMOSPHERE', gain: 0.035 + WIND * 0.02,
      code: (g) => `s("brown").clip(1).lpf(${Math.round(240 + ALT * 700)}).gain(${g}).room(.75).orbit(3)`,
    },
    {
      id: 'machine-air', kind: 'texture', layer: 'atmosphere', role: 'texture', deep: false,
      section: 'HIGH MACHINE AIR', gain: 0.01 + EDGE * 0.01,
      code: (g) => `s("crackle").hpf(5000).gain(${g}).room(.35)`,
    },
    {
      id: 'hats', kind: 'hat', layer: 'drums', role: 'hats', deep: false,
      section: '1 — HATS', gain: 1,
      code: () => `s("hh*16").bank("RolandTR909").gain("[.22 .10 .16 .08]*4").hpf(${Math.round(6200 + ALT * 2400)}).pan(.55).mask("${MASKS.hats}")`,
    },
    {
      id: 'hats-deep', kind: 'hat', layer: 'drums', role: 'hats', deep: true,
      section: 'DEEP HATS', gain: 0.03 + EDGE * 0.015,
      code: (g) => `s("hh*32").bank("RolandTR808").degradeBy(${g3(0.55 - EDGE * 0.1)}).hpf(9500).gain(${g}).pan(.72).mask("${MASKS.hatsDeep}")`,
    },
    {
      id: 'kick', kind: 'kick', layer: 'drums', role: 'kick', deep: false,
      section: '2 — KICK', gain: 0.95 + WIND * 0.08,
      code: (g) => `s("bd*4").bank("RolandTR909").shape(${g3(0.28 + EDGE * 0.2)}).distort(${g3(0.15 + EDGE * 0.45)}).postgain(.68).gain(${g}).mask("${MASKS.kick}")`,
    },
    {
      id: 'kick-deep', kind: 'kick', layer: 'drums', role: 'kick', deep: true,
      section: 'DEEP / SYNCOPATED KICK', gain: 0.16 + EDGE * 0.08,
      code: (g) => `s("~ ~ bd ~ ~ bd ~ ~").bank("OberheimDMX").lpf(1800).shape(.3).distort(${g3(0.25 + EDGE * 0.35)}).gain(${g}).mask("${MASKS.kickDeep}")`,
    },
    {
      id: 'clap', kind: 'snare', layer: 'drums', role: 'snare', deep: false,
      section: '3 — CLAP / SNARE', gain: 0.56 + WIND * 0.08,
      code: (g) => `s("~ ~ cp ~ ~ ~ cp ~").bank("RolandTR909").gain(${g}).room(.18).mask("${MASKS.snare}")`,
    },
    {
      id: 'snare-body', kind: 'snare', layer: 'drums', role: 'snare', deep: true,
      section: 'DEEP SNARE BODY', gain: 0.16 + EDGE * 0.05,
      code: (g) => `s("~ ~ sd ~ ~ ~ sd ~").bank("RolandTR909").late(.012).hpf(1200).shape(${g3(0.2 + EDGE * 0.12)}).gain(${g}).mask("${MASKS.snareDeep}")`,
    },
    {
      id: 'sub', kind: 'sub', layer: 'bass', role: 'bass', deep: false,
      section: '4 — SUB', gain: 0.86 + WIND * 0.1,
      code: (g) => `note("c1 ~ c1 ~ ~ bb0 ~ c1").s("sine").lpf(88).attack(.002).decay(.34).sustain(.32).release(.07).gain(${g}).orbit(2).mask("${MASKS.sub}")`,
    },
    {
      id: 'rolling-bass', kind: 'bass', layer: 'bass', role: 'bass', deep: false,
      section: '5 — ROLLING BASS', gain: 0.4 + WIND * 0.1,
      code: (g) => `note("c2 ~ c2 c2 ~ bb1 db2 ~").s("sawtooth").lpf(${Math.round(280 + ALT * 220)}).lpq(${g3(10 + EDGE * 2)}).decay(.13).sustain(.1).release(.05).distort(${g3(1.4 + EDGE * 1.2)}).postgain(.3).gain(${g}).orbit(2).mask("${MASKS.bass}")`,
    },
    {
      id: 'reese', kind: 'bass', layer: 'bass', role: 'bass', deep: true,
      section: 'DEEP — DIRTY REESE', gain: 0.12 + EDGE * 0.07,
      code: (g) => `note("~ c2 ~ ~ db2 ~ bb1 c2").s("square").hpf(145).lpf(${Math.round(700 + ALT * 250)}).lpq(9).distort(${g3(1.8 + EDGE * 1.2)}).postgain(.22).gain(${g}).orbit(2).mask("${MASKS.reese}")`,
    },
    {
      id: 'rave-stab', kind: 'chord', layer: 'harmony', role: 'harmony', deep: false,
      section: '6 — RAVE STAB', gain: 0.095 + WIND * 0.025,
      code: (g) => `note("<[c3,db3,g3] ~ ~ [bb2,db3,gb3] ~ ~ ~ ~>").s("supersaw").lpf(${Math.round(850 + ALT * 650)}).lpq(7).decay(.055).distort(${g3(0.45 + EDGE * 0.65)}).postgain(.3).gain(${g}).orbit(3).mask("${MASKS.stab}")`,
    },
    {
      id: 'acid', kind: 'chord', layer: 'harmony', role: 'harmony', deep: true,
      section: '7 — ACID MACHINE', gain: 0.08 + EDGE * 0.035,
      code: (g) => `note("c3 ~ c3 db3 ~ g2 [c3 eb3] ~").s("pulse").lpf(${Math.round(520 + ALT * 380)}).lpq(12).decay(.045).distort(${g3(1.1 + EDGE)}).postgain(.27).gain(${g}).mask("${MASKS.acid}")`,
    },
    {
      id: 'machine-signal', kind: 'melody', layer: 'melody', role: 'melody', deep: false,
      section: '8 — MACHINE SIGNAL', gain: 0.04 + WIND * 0.02,
      code: (g) => `note("c5 ~ ~ eb5 ~ db5 ~ g4").s("clavisynth").decay(.035).hpf(850).distort(${g3(0.35 + EDGE * 0.35)}).delay(.1).gain(${g}).mask("${MASKS.signal}")`,
    },
    {
      id: 'texture', kind: 'texture', layer: 'texture', role: 'texture', deep: false,
      section: '9 — TEXTURE', gain: 0.015 + EDGE * 0.012,
      code: (g) => `s("bytebeat").slow(2).bpf(${Math.round(1200 + ALT * 500)}).crush(5).distort(${g3(0.6 + EDGE)}).postgain(.3).gain(${g}).mask("${MASKS.texture}")`,
    },
    {
      id: 'texture-deep', kind: 'texture', layer: 'texture', role: 'texture', deep: true,
      section: 'DEEP TEXTURE', gain: 0.018 + EDGE * 0.01,
      code: (g) => `s("white*16").degradeBy(.58).hpf(8200).gain(${g}).mask("${MASKS.textureDeep}")`,
    },
    {
      id: 'tension-pulse', kind: 'bass', layer: 'bass', role: 'bass', deep: false,
      section: '10 — TENSION ENGINE', gain: 0.09 + WIND * 0.04,
      code: (g) => `note("c2 c2 db2 c2").s("pulse").slow(2).lpf(${Math.round(350 + ALT * 900)}).lpq(12).decay(.08).distort(${g3(0.7 + EDGE)}).postgain(.25).gain(${g}).orbit(2).mask("${MASKS.tension}")`,
    },
    {
      id: 'tension-drone', kind: 'sub', layer: 'bass', role: 'bass', deep: false,
      section: 'TENSION SUB DRONE', gain: 0.38 + WIND * 0.12,
      code: (g) => `note("<c1 c1 bb0 c1>").s("sine").slow(2).lpf(82).attack(.15).decay(.6).sustain(.55).release(.35).gain(${g}).orbit(2).mask("${MASKS.tension}")`,
    },
    {
      id: 'tension-air', kind: 'noise', layer: 'texture', role: 'texture', deep: false,
      section: 'TENSION AIR', gain: 0.025 + WIND * 0.02,
      code: (g) => `s("white*8").degradeBy(.4).hpf(5000).gain(${g}).room(.5).mask("${MASKS.tension}")`,
    },
    {
      id: 'climax-bass', kind: 'bass', layer: 'bass', role: 'bass', deep: true,
      section: '11 — CLIMAX BASS', gain: 0.12 + WIND * 0.04,
      code: (g) => `note("~ ~ ~ eb2 ~ c2 db2 ~").s("square").hpf(170).lpf(${Math.round(620 + ALT * 180)}).lpq(10).decay(.065).distort(${g3(2 + EDGE)}).postgain(.23).gain(${g}).orbit(2).mask("${MASKS.climax}")`,
    },
    {
      id: 'climax-toms', kind: 'perc', layer: 'drums', role: 'snare', deep: true,
      section: '12 — CLIMAX TOM / PERCUSSION', gain: 0.15 + WIND * 0.04,
      code: (g) => `s("lt ~ mt [ht mt] ~ lt [mt ht] ~").bank("OberheimDMX").hpf(300).distort(${g3(0.4 + EDGE * 0.5)}).gain(${g}).mask("${MASKS.climax}")`,
    },
    {
      id: 'climax-ride', kind: 'hat', layer: 'drums', role: 'hats', deep: true,
      section: 'CLIMAX RIDE', gain: 0.07 + WIND * 0.02,
      code: (g) => `s("rd*8").bank("RolandTR909").hpf(5000).degradeBy(.18).gain(${g}).mask("${MASKS.climax}")`,
    },
    {
      id: 'climax-signal', kind: 'melody', layer: 'melody', role: 'melody', deep: true,
      section: '13 — CLIMAX METALLIC SIGNAL', gain: 0.03,
      code: (g) => `note("~ g5 ~ db5 ~ eb5 g5 ~").s("tubularbells").hpf(1400).decay(.08).distort(${g3(0.25 + EDGE * 0.3)}).room(.3).gain(${g}).mask("${MASKS.climax}")`,
    },
    {
      id: 'transition-pressure', kind: 'texture', layer: 'atmosphere', role: 'texture', deep: false,
      section: 'TRANSITION PRESSURE', gain: 0.075,
      code: (g) => `s("white").clip(1).hpf(4500).attack(.35).release(.3).room(.45).distort(${g3(0.2 + EDGE * 0.25)}).gain(${g}).mask("${MASKS.rise}")`,
    },
  ];

  for (const part of parts) {
    // The AIR is never earned (§94); everything else waits for its rung.
    const earned = part.layer === 'atmosphere' || has(track, part.role, part.deep);
    if (!earned) continue;
    const trim = Math.max(0, controls.mix?.[part.layer] ?? 1);
    const level = part.gain * motion * trim;
    if (level <= 0) continue;
    const primitive = voice(part.id, part.kind, part.layer, part.code(g3(level)));
    primitive.parameters['section'] = part.section;
    graph.layers[part.layer].primitives.push(primitive);
  }
  // §127: nothing you earned may sit under the threshold of noticing.
  return applyAudibilityFloor(graph);
}
