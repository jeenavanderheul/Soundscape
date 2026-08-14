import {
  createEmptyLayerGraph,
  genreGrammar,
  regionBpm,
  type LayerName,
  type MusicalLayerGraph,
  type MusicalPrimitive,
  type PrimitiveKind,
} from '../audio/MusicalPrimitives';
import { isFinale, sectionMix } from '../music/ArrangementEngine';
import type { Performance } from '../music/Performance';
import { LEVEL_DEEP, type TrackState } from '../music/TrackState';

/**
 * §81 SUB PRESSURE — a world, not a recording.
 *
 * It arrived as a finished 32-cycle composition, which made it the odd one out:
 * the flight did nothing to it, its arrangement was baked into masks the
 * ArrangementEngine could not touch, and its deep voices came in with their
 * base voices instead of being earned. The HUD said BUILD while the audio
 * played its own loop.
 *
 * So it is written the way every other world is written. Height, wind and
 * movement energy shape it continuously (§3), `track.form` decides which parts
 * are present (§76), and each role doubles onto a second machine only once it
 * has actually grown deep (§78). The lab renders it with everything earned and
 * deep — that IS the end result the game converges on.
 */

export interface SubPressureControls {
  /** What has been earned so far. Absent means: play it finished. */
  track?: Readonly<TrackState>;
  /** §42: no movement, no music. */
  motion?: number;
  /** §3: height, wind and register, already quantized. */
  performance?: Readonly<Performance>;
  /** §62: movement energy — what this world spends on edge. */
  energy?: number;
  /** The lab's per-layer trim. The game never sets it. */
  mix?: Partial<Record<LayerName, number>>;
}

export const SUB_PRESSURE_SEED = 1301;
export const SUB_PRESSURE_BPM = regionBpm(genreGrammar('sub-pressure'));

/** Which roles the seven rungs of this world's ladder open (§58). */
type Role = 'texture' | 'hats' | 'kick' | 'snare' | 'bass' | 'harmony' | 'melody';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const formatGain = (value: number): string => String(Number(value.toFixed(3)));
/**
 * §11: a continuously drifting number re-evaluates the pattern every frame,
 * which is heard as stuttering — a snare or a bass note retriggering over and
 * over instead of playing. Everything the flight feeds in lands on eight steps
 * first, exactly like Performance already does with its own values.
 */
const step8 = (value: number): number => Math.round(clamp01(value) * 8) / 8;

function voice(
  id: string,
  kind: PrimitiveKind,
  layer: LayerName,
  code: string,
): MusicalPrimitive {
  return { id, kind, layer, parameters: { code }, allowedTransforms: [] };
}

/**
 * Has this role been earned, and — for the second machine — grown deep? With
 * no track at all everything is present, which is how the lab plays it.
 */
function reveals(track: Readonly<TrackState> | undefined, role: Role, deep: boolean): boolean {
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

export function buildSubPressureGraph(
  controls: SubPressureControls = {},
): MusicalLayerGraph {
  const graph = createEmptyLayerGraph(SUB_PRESSURE_BPM);
  const track = controls.track;
  const motion = step8(controls.motion ?? 1);
  const performance = controls.performance;
  // §3.1: `weight` is 1 skimming the ground and 0 in the air, so its inverse
  // is the height this world is flown at. The frozen 0.55 is gone.
  const alt = performance ? step8(1 - performance.weight) : 0.55;
  // §3.2: the wind in your hand. `push` runs 0.75..1.20, so it normalizes back.
  const wind = performance ? step8((performance.push - 0.75) / 0.45) : 0.85;
  // §62: movement energy is what turns into edge — distortion and dust.
  const edge = step8(controls.energy ?? 0.65);
  // §76: the section decides which parts are even here. 'driven' is this
  // world's style: the bottom leaves in the build and comes back in the drop.
  const mix = sectionMix(track?.form ?? 'none', 'driven');

  const parts: { id: string; kind: PrimitiveKind; layer: LayerName; role: Role; deep: boolean; gain: number; code: (g: string) => string }[] = [
    {
      id: 'sub-pressure-atmosphere', kind: 'texture', layer: 'atmosphere', role: 'texture', deep: false,
      gain: 0.035 + wind * 0.025,
      code: (g) => `s("brown").clip(1).lpf(${Math.round(560 + alt * 220)}).gain(${g}).room(.8).orbit(3)`,
    },
    {
      id: 'sub-pressure-rise', kind: 'texture', layer: 'atmosphere', role: 'texture', deep: true,
      gain: 0.09,
      code: (g) => `s("white").clip(1).hpf(3500).attack(.4).release(.3).room(.55).gain(${g})`,
    },
    {
      id: 'sub-pressure-hats', kind: 'hat', layer: 'drums', role: 'hats', deep: false,
      gain: 0.11 + wind * 0.05,
      // §105: accents across the bar, so the shuffle is heard as a shuffle.
      code: (g) => `s("hh ~ hh [hh hh] ~ hh ~ [hh hh]").bank("EmuSP12").velocity("1 .55 .8 .45").hpf(${Math.round(6600 + alt * 1600)}).gain(${g}).pan(.58)`,
    },
    {
      id: 'sub-pressure-hats-deep', kind: 'hat', layer: 'drums', role: 'hats', deep: true,
      gain: 0.025 + edge * 0.025,
      code: (g) => `s("hh*32").bank("AkaiMPC60").degradeBy(${formatGain(0.6 - edge * 0.2)}).hpf(9500).gain(${g}).pan(.72)`,
    },
    {
      id: 'sub-pressure-kick', kind: 'kick', layer: 'drums', role: 'kick', deep: false,
      gain: 0.92 + wind * 0.12,
      // §105: played, not triggered — the syncopated hit leans back.
      code: (g) => `s("bd ~ bd ~ ~ bd [bd ~] ~").bank("AkaiMPC60").velocity("1 .9 .84 .78").shape(${formatGain(0.3 + edge * 0.18)}).distort(${formatGain(0.4 + edge * 0.3)}).postgain(.7).gain(${g})`,
    },
    {
      id: 'sub-pressure-kick-deep', kind: 'kick', layer: 'drums', role: 'kick', deep: true,
      gain: 0.16 + edge * 0.1,
      code: (g) => `s("~ ~ ~ bd ~ ~ ~ bd").bank("OberheimDMX").lpf(1900).gain(${g})`,
    },
    {
      id: 'sub-pressure-snare', kind: 'snare', layer: 'drums', role: 'snare', deep: false,
      gain: 0.72 + wind * 0.12,
      // §105: the backbeat plus ghosts, one sound at two strengths.
      code: (g) => `stack(s("~ ~ sd ~ ~ ~ sd ~").bank("EmuSP12").shape(.337).distort(${formatGain(0.28 + edge * 0.15)}).gain(${g}), s("~ ~ ~ sd ~ ~ ~ sd").bank("EmuSP12").velocity(.2).hpf(2200).gain(${g}))`,
    },
    {
      id: 'sub-pressure-snare-deep', kind: 'snare', layer: 'drums', role: 'snare', deep: true,
      gain: 0.13 + edge * 0.07,
      code: (g) => `s("~ ~ cp ~ ~ ~ cp ~").bank("AkaiMPC60").hpf(2500).late(.012).room(.15).gain(${g})`,
    },
    {
      id: 'sub-pressure-sub', kind: 'sub', layer: 'bass', role: 'bass', deep: false,
      // §3.1: flying low IS the low register — the sub is heaviest by the ground.
      gain: 0.82 + wind * 0.18,
      code: (g) => `note("~ c1 ~ c1 ~ ~ bb0 db1").s("sine").lpf(90).attack(.002).decay(.38).sustain(.38).release(.08).gain(${g}).orbit(2)`,
    },
    {
      id: 'sub-pressure-body', kind: 'bass', layer: 'bass', role: 'bass', deep: false,
      gain: 0.42 + wind * 0.12,
      code: (g) => `note("~ c2 ~ c2 ~ ~ bb1 db2").s("sawtooth").lpf(379).lpq(10.6).distort(${formatGain(1.8 + edge * 0.6)}).postgain(.3).decay(.16).release(.05).gain(${g}).orbit(2)`,
    },
    {
      id: 'sub-pressure-reese', kind: 'bass', layer: 'bass', role: 'bass', deep: true,
      gain: 0.12 + edge * 0.08,
      code: (g) => `note("~ ~ c2 ~ db2 ~ ~ c2").s("square").hpf(145).lpf(865).lpq(8).distort(${formatGain(2.2 + edge * 0.5)}).postgain(.22).gain(${g}).orbit(2)`,
    },
    {
      id: 'sub-pressure-stab', kind: 'chord', layer: 'harmony', role: 'harmony', deep: false,
      gain: 0.11 + wind * 0.04,
      // §105: four chords over four bars, played at four strengths, with a pad
      // an octave down moving with them. One held voicing is texture, not music.
      code: (g) => `stack(note("<[c3,eb3,g3,bb3] [f3,ab3,c4,eb4] [db3,f3,ab3,c4] [g3,bb3,d4,f4]>").struct("~ x ~ ~ ~ x ~ ~").velocity("1 .6 .8 .5").s("square").lpf(${Math.round(820 + alt * 620)}).decay(.065).distort(.855).postgain(.35).gain(${g}).orbit(3), note("<[c2,eb2,g2] [f2,ab2,c3] [db2,f2,ab2] [g2,bb2,d3]>").s("supersaw").attack(.9).release(1.4).lpf(620).lpq(2).room(.55).gain(${formatGain(Number(g) * 0.45)}).orbit(3))`,
    },
    {
      id: 'sub-pressure-signal', kind: 'melody', layer: 'melody', role: 'melody', deep: false,
      gain: 0.045 + edge * 0.025,
      code: (g) => `note("~ c5 ~ ~ db5 ~ g4 ~").s("clavisynth").decay(.04).hpf(850).distort(.625).delay(.3).dfb(.35).dt(60/141).gain(${g})`,
    },
    {
      // §94: this world OPENS on texture, so the rung has to bring a voice of
      // its own — the air is always there, so gating this behind depth made
      // DISCOVERY I add nothing you could hear.
      id: 'sub-pressure-texture', kind: 'texture', layer: 'texture', role: 'texture', deep: false,
      gain: 0.018 + edge * 0.015,
      code: (g) => `s("bytebeat").slow(2).bpf(1300).crush(5).distort(1.15).postgain(.3).gain(${g}).orbit(3)`,
    },
  ];

  // §85: DROP II is the only place these exist. Not a louder mix — parts that
  // were impossible before the flight had been all the way through.
  if (isFinale(track?.form ?? 'none') && reveals(track, 'bass', true)) {
    parts.push(
      {
        id: 'sub-pressure-finale-response', kind: 'response', layer: 'bass', role: 'bass', deep: true,
        gain: 0.3 + wind * 0.1,
        code: (g) => `note("~ ~ c1 ~ ~ c1 ~ [c1 bb0]").s("sine").lpf(96).decay(.3).sustain(.2).distort(.4).gain(${g}).orbit(2)`,
      },
      {
        id: 'sub-pressure-finale-noise', kind: 'noise', layer: 'texture', role: 'texture', deep: true,
        gain: 0.08 + edge * 0.05,
        code: (g) => `s("white").clip(1).hpf(4200).attack(.45).release(.35).room(.5).distort(1.2).gain(${g}).mask("<1 0!7>")`,
      },
      {
        id: 'sub-pressure-finale-mutation', kind: 'perc', layer: 'drums', role: 'hats', deep: true,
        gain: 0.06 + edge * 0.06,
        code: (g) => `s("hh*16").bank("AkaiMPC60").degradeBy(${formatGain(0.7 - edge * 0.3)}).speed("<1 1.5 .75 2>").hpf(6000).gain(${g})`,
      },
    );
  }

  for (const part of parts) {
    // §94: the AIR of a world is never earned — ENTER BIOME is the air and
    // nothing else, and gating it on the texture rung left the first four
    // cycles of this world completely silent.
    const earned = part.layer === 'atmosphere' || reveals(track, part.role, part.deep);
    if (!earned) continue;
    const section = mix[part.layer as keyof typeof mix] ?? 1;
    if (section === 0) continue;
    const trim = Math.max(0, controls.mix?.[part.layer] ?? 1);
    const level = part.gain * motion * section * trim;
    if (level <= 0) continue;
    graph.layers[part.layer].primitives.push(
      voice(part.id, part.kind, part.layer, part.code(formatGain(level))),
    );
  }

  return graph;
}
