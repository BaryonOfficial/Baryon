import { expect, it } from "vitest";
import { createBroadbandApparatus } from "./broadbandApparatus.js";
import { createBroadbandModalResponse } from "./broadbandModalResponse.js";
import {
  isAudioFeatureBasis,
  isAudioFeatureTopologyPacket,
} from "../../contracts/audioFeatureProtocol.js";
import { CAVITY_ACOUSTIC_DEFAULTS } from "../../defaults.js";

it.each(
  [44100, 48000, 96000].flatMap((sampleRate) =>
    ["neumann", "dirichlet"].map((boundaryMode) => ({
      sampleRate,
      boundaryMode,
    })),
  ),
)(
  "startup basis matches the actual response window at $sampleRate Hz / $boundaryMode",
  ({ sampleRate, boundaryMode }) => {
    const { basis, shells } = createBroadbandApparatus({
      sampleRate,
      boundaryMode,
      channelCount: 2,
      exposureSeconds: 0.05,
      cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
    });
    const response = createBroadbandModalResponse({
      shells,
      sampleRate,
      channelCount: 2,
      exposureSeconds: 0.05,
    });
    expect(isAudioFeatureBasis(basis)).toBe(true);
    expect(isAudioFeatureTopologyPacket(basis)).toBe(false);
    expect(response.read().spectral).toMatchObject(basis.spectrum);
    expect(response.read().sampleIndex).toBe(0);
  },
);
