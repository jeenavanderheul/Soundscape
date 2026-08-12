import {
  createEmptyLayerGraph,
  type LayerName,
  type MusicalLayerGraph,
  type MusicalPrimitive,
  type PrimitiveKind,
} from '../audio/MusicalPrimitives';
import type { TrackState } from '../music/TrackState';

export interface SubPressureControls {
  motion?: number;
  mix?: Partial<Record<LayerName, number>>;
  track?: Readonly<TrackState>;
}

const ALT = 0.55;
const WIND = 0.85;
const EDGE = 0.65;
export const SUB_PRESSURE_SEED = 1301;
export const SUB_PRESSURE_BPM = 138 + ALT * 6;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const formatGain = (value: number): string => String(Number(value.toFixed(5)));

function voice(
  id: string,
  kind: PrimitiveKind,
  layer: LayerName,
  code: string,
): MusicalPrimitive {
  return { id, kind, layer, parameters: { code }, allowedTransforms: [] };
}

export function buildSubPressureGraph(
  controls: SubPressureControls = {},
): MusicalLayerGraph {
  const graph = createEmptyLayerGraph(SUB_PRESSURE_BPM);
  const motion = clamp01(controls.motion ?? 1);
  const gain = (layer: LayerName, value: number): string =>
    formatGain(value * motion * Math.max(0, controls.mix?.[layer] ?? 1));

  graph.layers.atmosphere.primitives = [
    voice(
      'sub-pressure-atmosphere',
      'texture',
      'atmosphere',
      `s("brown").clip(1).lpf(645).gain(${gain('atmosphere', 0.035 + WIND * 0.025)}).room(.8).orbit(3)`,
    ),
    voice(
      'sub-pressure-rise',
      'texture',
      'atmosphere',
      `s("white").clip(1).hpf(3500).attack(.4).release(.3).room(.55).gain(${gain('atmosphere', 0.09)}).mask("<0!15 1 0!15 1>")`,
    ),
  ];

  graph.layers.drums.primitives = [
    voice(
      'sub-pressure-hats',
      'hat',
      'drums',
      `s("hh ~ hh [hh hh] ~ hh ~ [hh hh]").bank("EmuSP12").hpf(7410).gain(${gain('drums', 0.11 + WIND * 0.05)}).pan(.58).mask("<1!24 0!4 1!4>")`,
    ),
    voice(
      'sub-pressure-hats-deep',
      'hat',
      'drums',
      `s("hh*32").bank("AkaiMPC60").degradeBy(.4525).hpf(9500).gain(${gain('drums', 0.025 + EDGE * 0.025)}).pan(.72).mask("<0!8 1!16 0!4 1!4>")`,
    ),
    voice(
      'sub-pressure-kick',
      'kick',
      'drums',
      `s("bd ~ bd ~ ~ bd [bd ~] ~").bank("AkaiMPC60").shape(.4125).distort(.59).postgain(.7).gain(${gain('drums', 0.92 + WIND * 0.12)}).mask("<0!4 1!20 0!4 1!4>")`,
    ),
    voice(
      'sub-pressure-kick-deep',
      'kick',
      'drums',
      `s("~ ~ ~ bd ~ ~ ~ bd").bank("OberheimDMX").lpf(1900).gain(${gain('drums', 0.16 + EDGE * 0.1)}).mask("<0!12 1!12 0!4 1!4>")`,
    ),
    voice(
      'sub-pressure-snare',
      'snare',
      'drums',
      `s("~ ~ sd ~ ~ ~ sd ~").bank("EmuSP12").shape(.337).distort(.3775).gain(${gain('drums', 0.72 + WIND * 0.12)}).mask("<0!8 1!16 0!4 1!4>")`,
    ),
    voice(
      'sub-pressure-snare-deep',
      'snare',
      'drums',
      `s("~ ~ cp ~ ~ ~ cp ~").bank("AkaiMPC60").hpf(2500).late(.012).room(.15).gain(${gain('drums', 0.13 + EDGE * 0.07)}).mask("<0!12 1!12 0!4 1!4>")`,
    ),
  ];

  graph.layers.bass.primitives = [
    voice(
      'sub-pressure-sub',
      'sub',
      'bass',
      `note("~ c1 ~ c1 ~ ~ bb0 db1").s("sine").lpf(90).attack(.002).decay(.38).sustain(.38).release(.08).gain(${gain('bass', 0.82 + WIND * 0.18)}).orbit(2).mask("<0!12 1!12 0!4 1!4>")`,
    ),
    voice(
      'sub-pressure-body',
      'bass',
      'bass',
      `note("~ c2 ~ c2 ~ ~ bb1 db2").s("sawtooth").lpf(379).lpq(10.6).distort(2.21).postgain(.3).decay(.16).release(.05).gain(${gain('bass', 0.42 + WIND * 0.12)}).orbit(2).mask("<0!16 1!8 0!4 1!4>")`,
    ),
    voice(
      'sub-pressure-reese',
      'bass',
      'bass',
      `note("~ ~ c2 ~ db2 ~ ~ c2").s("square").hpf(145).lpf(865).lpq(8).distort(2.575).postgain(.22).gain(${gain('bass', 0.12 + EDGE * 0.08)}).orbit(2).mask("<0!20 1!4 0!4 1!4>")`,
    ),
  ];

  graph.layers.harmony.primitives = [
    voice(
      'sub-pressure-stab',
      'chord',
      'harmony',
      `note("<~ [c3,db3,g3] ~ ~ ~ [bb2,db3,gb3] ~ ~>").s("square").lpf(1130).decay(.065).distort(.855).postgain(.35).gain(${gain('harmony', 0.11 + WIND * 0.04)}).orbit(3).mask("<0!16 1!8 0!4 1!4>")`,
    ),
  ];

  graph.layers.melody.primitives = [
    voice(
      'sub-pressure-signal',
      'melody',
      'melody',
      `note("~ c5 ~ ~ db5 ~ g4 ~").s("clavisynth").decay(.04).hpf(850).distort(.625).delay(.12).gain(${gain('melody', 0.045 + EDGE * 0.025)}).mask("<0!20 1!4 0!4 1!4>")`,
    ),
  ];

  graph.layers.texture.primitives = [
    voice(
      'sub-pressure-texture',
      'texture',
      'texture',
      `s("bytebeat").slow(2).bpf(1300).crush(5).distort(1.15).postgain(.3).gain(${gain('texture', 0.018 + EDGE * 0.015)}).mask("<0!8 1!16 0!4 1!4>")`,
    ),
  ];

  const track = controls.track;
  if (track) {
    if (!track.texture.unlocked) {
      graph.layers.atmosphere.primitives = [];
      graph.layers.texture.primitives = [];
    }
    graph.layers.drums.primitives = graph.layers.drums.primitives.filter((primitive) => {
      if (primitive.kind === 'hat') return track.drums.hats.unlocked;
      if (primitive.kind === 'kick') return track.drums.kick.unlocked;
      return track.drums.snare.unlocked;
    });
    graph.layers.bass.primitives = graph.layers.bass.primitives.filter((primitive) =>
      primitive.id === 'sub-pressure-sub' ? track.bass.unlocked : track.harmony.unlocked,
    );
    if (!track.harmony.unlocked) graph.layers.harmony.primitives = [];
    if (!track.melody.unlocked) graph.layers.melody.primitives = [];
  }

  return graph;
}
