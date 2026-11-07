import { sameAudioFeatureBasis } from "../../utils/audio/audioFeatureBasis.js";
import {
  assertRendererFeatureUploadContract,
  isAudioFeatureBasis,
} from "../../contracts/audioFeatureProtocol.js";
import { createBroadbandMomentField } from "./broadbandMomentField.js";
import { createBroadbandSpectralExpansion } from "./broadbandSpectralExpansion.js";
import { createBroadbandSpectralProjection } from "./broadbandSpectralProjection.js";

const EPOCH = [
  "sourceGeneration",
  "workerGeneration",
  "timelineRevision",
  "processingRevision",
  "topologyRevision",
];
function spectralConfiguration(topology) {
  return {
    ...topology.spectrum,
    shellCount: topology.shellCount,
    channelCount: topology.channelCount,
    sampleRate: topology.sampleRate,
  };
}
function createResources(topology, apertureRadius) {
  const resources = [];
  let disposed = false;
  try {
    const spectral = spectralConfiguration(topology);
    const expansion = createBroadbandSpectralExpansion(spectral);
    resources.push(expansion);
    const projection = createBroadbandSpectralProjection({
      ...spectral,
      sourceTexture: expansion.texture,
    });
    resources.push(projection);
    const families = Array.from(topology.familyShells, (shellIndex, i) => ({
      u: topology.familyIndices[3 * i],
      v: topology.familyIndices[3 * i + 1],
      w: topology.familyIndices[3 * i + 2],
      shellIndex,
      sourceAmplitudeOverlap: topology.sourceOverlaps[i],
    }));
    const field = createBroadbandMomentField({
      families,
      shellCount: topology.shellCount,
      boundaryMode: topology.boundaryMode,
      spectralMatrixTexture: projection.texture,
      apertureRadius,
    });
    resources.push(field);
    return {
      update(observation, { restartTimeline = false } = {}) {
        expansion.update(
          { ...spectral, ...observation.spectrum },
          { restartTimeline },
        );
        field.update(observation);
      },
      async compile(renderer) {
        await expansion.compile(renderer);
        if (disposed) return;
        await projection.compile(renderer);
        if (disposed) return;
        await field.compile(renderer);
      },
      prepare(renderer) {
        if (expansion.render(renderer)) projection.render(renderer);
        field.render(renderer);
      },
      evaluateAperture: (options) => field.evaluateAperture(options),
      setApertureRadius: (radius) => field.setApertureRadius(radius),
      textureBytes:
        expansion.textureBytes + projection.textureBytes + field.textureBytes,
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const resource of resources) resource.dispose();
      },
    };
  } catch (error) {
    for (const resource of resources) resource.dispose();
    throw error;
  }
}

/**
 * Renderer-owned full-rank derived resources for one immutable v3 basis.
 * Admission never advances acoustic time. A basis is compiled once; a newer
 * source epoch with the same basis only restarts the acoustic timeline, so a
 * new file, track or seek reuses compiled pipelines. Each strictly newer
 * observation uploads once. Camera frames and GPU completion cannot call back
 * into source capture, worker init or packet publication.
 */
export function createBroadbandFieldSource({
  getApertureRadius,
  create = createResources,
}) {
  if (typeof getApertureRadius !== "function")
    throw new TypeError(
      "A broadband field requires its physical aperture radius owner",
    );
  let topology = null,
    basis = null,
    resources = null,
    frameId = 0,
    revision = 0;
  let disposed = false,
    derivedFieldDirty = false,
    basisCompileCount = 0,
    observationUploadCount = 0;
  const hasBasis = (next) =>
    basis !== null && sameAudioFeatureBasis(basis, next);
  return {
    hasBasis,
    /** Allocate a basis from its static apparatus alone so it can compile before the
     * first observation. Uploads still own all acoustic data. */
    ensureBasis(next) {
      if (disposed) throw new Error("Broadband field source is disposed");
      if (!isAudioFeatureBasis(next))
        throw new TypeError("A basis requires a complete static apparatus");
      if (hasBasis(next)) return false;
      const candidate = create(next, getApertureRadius());
      resources?.dispose();
      resources = candidate;
      basis = next;
      derivedFieldDirty = false;
      basisCompileCount++;
      revision++;
      return true;
    },
    upload(frame) {
      if (disposed) throw new Error("Broadband field source is disposed");
      // Only the canonical protocol owner can retain validation provenance.
      // Mutable imported frames must be checked again on every admission.
      assertRendererFeatureUploadContract(frame);
      const next = frame.topology;
      const changed =
        topology && EPOCH.find((key) => topology[key] !== next[key]);
      if (changed && next[changed] < topology[changed])
        return { accepted: false, reason: "stale-topology" };
      const basisRetained = hasBasis(next);
      if (topology && !changed && !sameAudioFeatureBasis(topology, next))
        throw new TypeError("A v3 topology changed without a new revision");
      const epochChanged = !topology || Boolean(changed);
      if (!epochChanged && frame.observation.frameId <= frameId)
        return { accepted: false, reason: "non-increasing-observation" };
      if (!basisRetained) {
        const candidate = create(next, getApertureRadius());
        try {
          candidate.update(frame.observation);
        } catch (error) {
          candidate.dispose();
          throw error;
        }
        resources?.dispose();
        resources = candidate;
        basisCompileCount++;
        revision++;
      } else
        resources.update(frame.observation, {
          restartTimeline: epochChanged,
        });
      basis = next;
      topology = next;
      frameId = frame.observation.frameId;
      observationUploadCount++;
      derivedFieldDirty = true;
      return { accepted: true, epochChanged, revision };
    },
    compile(renderer) {
      if (!resources || disposed)
        throw new Error("Broadband basis unavailable");
      return resources.compile(renderer);
    },
    prepare(renderer) {
      if (!resources || disposed)
        throw new Error("Broadband basis unavailable");
      if (resources.setApertureRadius(getApertureRadius()))
        derivedFieldDirty = true;
      if (!derivedFieldDirty) return false;
      resources.prepare(renderer);
      derivedFieldDirty = false;
      return true;
    },
    evaluateAperture(options) {
      if (!resources || disposed)
        throw new Error("Broadband basis unavailable");
      return resources.evaluateAperture(options);
    },
    read: () => ({
      revision,
      frameId,
      topology,
      basis,
      basisCompileCount,
      observationUploadCount,
      textureBytes: resources?.textureBytes ?? 0,
      disposed,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      resources?.dispose();
      resources = null;
    },
  };
}
