import { describe, expect, it } from "vitest";
import * as audioFeatures from "./audioFeatures.js";

describe("public audio feature surface", () => {
  it("exposes the canonical runtime without the removed flat analysis APIs", () => {
    expect(audioFeatures).toMatchObject({
      createAudioFeatureRuntime: expect.any(Function),
      createRendererFeatureView: expect.any(Function),
      AUDIO_FEATURE_AUTHORITY_ROLES: {
        localProducer: "local-producer",
        externalConsumer: "external-consumer",
      },
    });

    for (const removedApi of [
      "createAudioFeatureEngine",
      "createNoopAudioFeatureEngine",
      "buildAudioFeatureTransportFrame",
      "reviveSerializedReplayFrame",
      "reviveSerializedReplayFrames",
      "mergeFastSignalPatchIntoSnapshot",
      "createAudioFeatureState",
      "buildAudioFeatureFrame",
      "buildAudioFeatureAnalysisSnapshot",
      "buildCurrentAudioFeatureAnalysisResult",
      "buildFastSignalPatchedAudioFeatureAnalysisResult",
      "composeAudioFeatureFrame",
      "prepareAudioFeatureFrameInputs",
      "runHeavyAudioFeatureAnalysis",
      "updateAudioFeatureFastSignalState",
      "updateAudioFeatureStructuralState",
      "updateAudioFeatureChromaState",
      "updateAudioFeatureTempoState",
    ]) {
      expect(audioFeatures).not.toHaveProperty(removedApi);
    }
  });
});
