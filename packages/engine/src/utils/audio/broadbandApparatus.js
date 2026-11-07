import { buildModalExcitationAtlas } from "./modalExcitationAtlas.js";
import { buildAudioFeatureBasis } from "./audioFeatureBasis.js";
import { modalTransition } from "./modalTransition.js";
import {
  RESPONSE_SPECTRUM_FRAME_SIZE,
  RESPONSE_SPECTRUM_HOP_SIZE,
} from "./broadbandResponseSpectrum.js";

/** Pure apparatus description. No PCM history, worker, epochs or observations. */
export function createBroadbandApparatus(configuration) {
  const { boundaryMode, cavityAcousticScale, sampleRate } = configuration;
  const exposureSeconds = configuration.exposureSeconds ?? 0.05;
  const atlas = buildModalExcitationAtlas({
    radius: 1,
    boundaryMode,
    cavityAcousticScale,
  });
  const shells = [
    ...new Map(
      atlas.map((family) => [family.responseModeKey, family]),
    ).values(),
  ];
  const indices = new Map(shells.map((shell, i) => [shell.responseModeKey, i]));
  const families = atlas.map((family) => ({
    u: family.u,
    v: family.v,
    w: family.w,
    shellIndex: indices.get(family.responseModeKey),
    sourceAmplitudeOverlap:
      family.sourceCouplingAmplitude * family.sourceProjectionWeight,
  }));
  const spectrum = {
    representation: "finite-response-window-v1",
    frameSize: RESPONSE_SPECTRUM_FRAME_SIZE,
    hopSize: RESPONSE_SPECTRUM_HOP_SIZE,
    transitions: Float64Array.from(
      shells.flatMap((shell) => {
        const angular = 2 * Math.PI * shell.naturalFrequencyHz;
        return modalTransition(
          angular,
          angular / shell.qualityFactor,
          1 / sampleRate,
        );
      }),
    ),
  };
  const basis = buildAudioFeatureBasis({
    configuration,
    families,
    shells,
    boundaryMode,
    exposureSeconds,
    spectrum,
  });
  return { basis, shells };
}
