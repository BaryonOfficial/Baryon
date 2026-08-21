import { requireModalQualityFactor } from "./modalDamping.js";

const TWO_PI = Math.PI * 2;

/**
 * Complex driven-cavity modal transfer,
 * `G_n(w) = 1 / (wn^2 - w^2 + i w wn / Q_n)`, referenced to the mode's own
 * response at resonance so `G(wn) = -i` and `|G| = 1` for every mode.
 *
 * This is forced modal superposition, not resonant absorption. The difference
 * is what a mode does when the drive is not on top of it: absorption falls to
 * nothing, so a cavity whose modes are far apart answers almost no frequency at
 * all, while the forced term falls off only as `1/(wn^2 - w^2)`. Two
 * consequences that used to need their own machinery come for free. Below the
 * lowest mode the response tends to the stiffness-controlled limit rather than
 * zero, so drive under the cavity's acoustic floor genuinely forces the
 * fundamental. And away from resonance the result barely depends on Q, so Q is
 * free to mean what it physically means — the height and width of the peak —
 * instead of deciding whether the instrument responds at all.
 *
 * The resonant reference matters as much as the transfer. Without it the raw
 * transfer carries the `1/wn^2` of a constant-force drive, which is right for a
 * displacement but wrong here: the modal basis is unit-mean-square normalized
 * so a coefficient reads as that mode's energy, and the raw form buries treble
 * under bass by `1/wn^4` — measured at 16700x across 59 Hz to 672 Hz.
 *
 * @param {{ driveHz: number, modeHz: number, qualityFactor: number }} args
 * @returns {{real:number, imaginary:number, energy:number, phaseRad:number}}
 */
export function computeForcedModalTransfer({ driveHz, modeHz, qualityFactor }) {
  const driveFrequency = Number.isFinite(driveHz) ? Math.max(0, driveHz) : 0;
  const modeFrequency = Number.isFinite(modeHz) ? Math.max(0, modeHz) : 0;
  if (!(modeFrequency > 0)) {
    return { real: 0, imaginary: 0, energy: 0, phaseRad: 0 };
  }
  const quality = requireModalQualityFactor(qualityFactor, "Modal transfer");

  const driveAngular = TWO_PI * driveFrequency;
  const modeAngular = TWO_PI * modeFrequency;
  const resistive = modeAngular * modeAngular - driveAngular * driveAngular;
  const reactive = (driveAngular * modeAngular) / quality;
  const magnitudeSquared = resistive * resistive + reactive * reactive;
  if (!(magnitudeSquared > 0)) {
    return { real: 0, imaginary: 0, energy: 0, phaseRad: 0 };
  }
  const resonantScale = (modeAngular * modeAngular) / quality;
  const real = (resonantScale * resistive) / magnitudeSquared;
  const imaginary = (-resonantScale * reactive) / magnitudeSquared;
  return {
    real,
    imaginary,
    energy: real * real + imaginary * imaginary,
    phaseRad: Math.atan2(imaginary, real),
  };
}

export function computeForcedModalTransferEnergy(options) {
  return computeForcedModalTransfer(options).energy;
}

/**
 * Write one drive component's absolute response energy for every mode.
 *
 * Modal density is a property of the apparatus. Column-normalizing these
 * transfers would make every drive frequency deposit the same total response
 * regardless of how many physical modes it excites, deleting that property.
 * The downstream projected-energy budget remains the sole bounded display
 * normalization and does not alter these relative physical responses.
 *
 * Returns the strongest single mode's transfer, which is the cavity's own
 * response at this drive frequency: 1 when the drive sits on a mode, small when
 * it falls between them. The caller scales the component's energy by it, so
 * "how hard the cavity answers" stays separate from "which modes answer".
 * Without that scale every component delivers its full energy no matter where
 * it sits, and the render stops reacting to the music — patterns vibrate in
 * place instead of following it.
 *
 * @param {{
 *   driveHz: number,
 *   modeFrequenciesHz: ArrayLike<number>,
 *   modeQualityFactors: ArrayLike<number>,
 *   modeCount: number,
 *   out: Float64Array,
 * }} args
 */
export function distributeForcedModalTransfer({
  driveHz,
  modeFrequenciesHz,
  modeQualityFactors,
  modeCount,
  out,
}) {
  let peak = 0;
  for (let modeIndex = 0; modeIndex < modeCount; modeIndex += 1) {
    const energy = computeForcedModalTransferEnergy({
      driveHz,
      modeHz: modeFrequenciesHz[modeIndex],
      qualityFactor: modeQualityFactors[modeIndex],
    });
    out[modeIndex] = energy;
    if (energy > peak) {
      peak = energy;
    }
  }
  if (!(peak > 0)) {
    out.fill(0, 0, modeCount);
    return 0;
  }
  return peak;
}
