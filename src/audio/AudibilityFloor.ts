import type { LayerName, MusicalLayerGraph } from './MusicalPrimitives';

/**
 * §127 NOTHING YOU EARNED IS INAUDIBLE.
 *
 * Measured across all six worlds with a full track: melody sat 22–25 dB under
 * the loudest voice and texture 28–35 dB. You fly to earn those rungs, the
 * strip fills to 7/7, and they are below the threshold of noticing — earning a
 * layer and hearing nothing is the same broken promise as §94's ghost sub.
 *
 * This is a FLOOR, not a mix. It never moves a voice the documents already
 * placed sensibly and it never pushes one above its floor — the documents keep
 * saying what the world sounds like (§110), this only refuses to let a part
 * disappear underneath the drums. Written as a rewrite of the rendered
 * `.gain()` so the code overlay keeps showing exactly what is playing.
 *
 * The numbers are ordinary mix practice: a lead sits about ten under the kick,
 * air sits about twenty. They are deliberately easy to move.
 */
const FLOOR_DB: Partial<Record<LayerName, number>> = {
  harmony: -14,
  melody: -12,
  texture: -18,
  atmosphere: -20,
};

const GAIN = /\.gain\(([0-9]*\.?[0-9]+)\)/;

/** Loudest single voice in the graph — the kick, in every world we have. */
function loudest(graph: MusicalLayerGraph): number {
  let top = 0;
  for (const layer of Object.values(graph.layers)) {
    for (const primitive of layer.primitives) {
      const found = GAIN.exec(String(primitive.parameters.code ?? ''));
      if (found) top = Math.max(top, Number(found[1]));
    }
  }
  return top;
}

export function applyAudibilityFloor(graph: MusicalLayerGraph): MusicalLayerGraph {
  const reference = loudest(graph);
  if (reference <= 0) return graph;
  for (const [name, layer] of Object.entries(graph.layers)) {
    const floorDb = FLOOR_DB[name as LayerName];
    if (floorDb === undefined) continue;
    const floor = reference * Math.pow(10, floorDb / 20);
    for (const primitive of layer.primitives) {
      const code = String(primitive.parameters.code ?? '');
      const found = GAIN.exec(code);
      if (!found) continue;
      const gain = Number(found[1]);
      // Only ever lifts, and only up to the floor. A part the document already
      // placed above it is left exactly as written.
      if (gain >= floor) continue;
      primitive.parameters.code = code.replace(
        GAIN,
        `.gain(${Number(floor.toFixed(3))})`,
      );
    }
  }
  return graph;
}
