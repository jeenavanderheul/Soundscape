import { ARC_PHASES, CYCLES_PER_PHASE, arcFor, sectionLabel } from '../music/ArrangementEngine';
import type { Section, SectionStyle } from '../music/ArrangementEngine';
import { LEVEL_DEEP } from '../music/TrackState';
import type { TrackLayerName, TrackState } from '../music/TrackState';

/**
 * §90/§93 TRACK STRIP — the layers, and nothing else.
 *
 * §93 (user decision): every WORD is gone — the phase names, the genre and
 * tempo header, and the layer name that used to flash on the bar it arrived.
 * A name is a claim about what you are hearing, and any drift between the two
 * makes the screen a liar. What is left claims nothing it cannot show: seven
 * slots that fill as the parts are earned — hollow for not yet, half for
 * earned, solid for grown deep — and an arrow at whichever one is standing in
 * the world waiting to be flown through.
 *
 * `arcBar` is kept and tested but no longer drawn; it is the position display
 * without any naming, ready if the shape is wanted back on screen.
 */

const LAYERS: readonly { key: TrackLayerName; label: string }[] = [
  { key: 'kick', label: 'KICK' },
  { key: 'snare', label: 'SNR' },
  { key: 'hats', label: 'HAT' },
  { key: 'bass', label: 'BASS' },
  { key: 'harmony', label: 'HARM' },
  { key: 'melody', label: 'MEL' },
  { key: 'texture', label: 'TEX' },
];

const TOTAL_CYCLES = ARC_PHASES * CYCLES_PER_PHASE;

export interface TrackStripState {
  track: TrackState;
  /** Which of the thirty-two cycles the flight is in. */
  cycle: number;
  style: SectionStyle;
  trackNumber: number;
  /** The layer standing in the world right now, if any (§86). */
  beaconLayer: TrackLayerName | null;
}

function levelOf(track: TrackState, layer: TrackLayerName): number {
  if (layer === 'kick' || layer === 'hats' || layer === 'snare') {
    return track.drums[layer].unlocked ? track.drums[layer].level : 0;
  }
  return track[layer].unlocked ? track[layer].level : 0;
}

/**
 * The arc drawn as thirty-two marks, with the phase boundaries visible so the
 * shape of a track can be LEARNED rather than just experienced.
 */
export function arcBar(cycle: number, style: SectionStyle): string {
  const arc = arcFor(style);
  let out = '';
  for (let c = 0; c < TOTAL_CYCLES; c += 1) {
    if (c > 0 && c % CYCLES_PER_PHASE === 0) out += ' ';
    out += c === cycle ? '◆' : c < cycle ? '▬' : '·';
  }
  return `${out}  ${String(cycle + 1).padStart(2, '0')}/${TOTAL_CYCLES} · ${sectionLabel(arc[Math.floor(cycle / CYCLES_PER_PHASE) % ARC_PHASES] ?? 'groove')}`;
}

/** The seven layers: hollow, half, solid — and an arrow at the one on offer. */
export function layerRow(state: TrackStripState): string {
  return LAYERS.map(({ key, label }) => {
    const level = levelOf(state.track, key);
    const mark = level >= LEVEL_DEEP ? '▰▰' : level > 0 ? '▰▱' : '▱▱';
    const offered = state.beaconLayer === key ? '›' : ' ';
    return `${offered}${label} ${mark}`;
  }).join('  ');
}

export class TrackStrip {
  private readonly root = document.createElement('div');
  private readonly layers = document.createElement('div');

  constructor(container: HTMLElement) {
    Object.assign(this.root.style, {
      position: 'absolute',
      left: '50%',
      bottom: '18px',
      transform: 'translateX(-50%)',
      color: 'rgba(226, 240, 244, 0.82)',
      font: '12px/1.7 var(--font-mono)',
      letterSpacing: '0.08em',
      whiteSpace: 'pre',
      textAlign: 'center',
      pointerEvents: 'none',
      textShadow: '0 0 12px rgba(0, 0, 0, 0.8)',
      zIndex: '10',
    });
    this.layers.style.opacity = '0.78';
    this.root.append(this.layers);
    container.appendChild(this.root);
  }

  update(state: TrackStripState): void {
    this.layers.textContent = layerRow(state);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'block' : 'none';
  }

  dispose(): void {
    this.root.remove();
  }
}

/** Exposed for the phase word, so nothing reads a raw section name (§84). */
export function phaseOf(cycle: number, style: SectionStyle): Section {
  return arcFor(style)[Math.floor(cycle / CYCLES_PER_PHASE) % ARC_PHASES] ?? 'groove';
}
