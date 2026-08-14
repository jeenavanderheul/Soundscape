import { Color } from 'three';

/**
 * The poster palette as a function of pitch (§3.1): low is red mass, mid is
 * purple harmonics, high is green detail. These three are the only accent
 * colours the world has, and §136.2 says no fourth one may appear.
 *
 * All that is left of the old ForestSystem, which §36's ForestRenderer
 * replaced — the resonator markers still name their pitch this way.
 */

const ZONE_LOW = new Color(1.0, 0.28, 0.22);
const ZONE_MID = new Color(0.62, 0.38, 1.0);
const ZONE_HIGH = new Color(0.5, 1.0, 0.4);

export function zoneColor(hzn: number): Color {
  return hzn < 0.4
    ? ZONE_LOW.clone().lerp(ZONE_MID, hzn / 0.4)
    : ZONE_MID.clone().lerp(ZONE_HIGH, (hzn - 0.4) / 0.6);
}
