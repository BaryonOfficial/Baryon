import { assertRendererFeatureUploadContract } from "../../contracts/audioFeatureProtocol.js";
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
const ARRAYS = [
  "familyIndices",
  "familyShells",
  "sourceOverlaps",
  "naturalFrequenciesHz",
  "qualityFactors",
];
function sameTopology(a, b) {
  if (a === b) return true;
  return (
    [
      "protocolVersion",
      "basisConvention",
      "boundaryMode",
      "sampleRate",
      "channelCount",
      "exposureSeconds",
      "familyCount",
      "shellCount",
    ].every((key) => a[key] === b[key]) &&
    ARRAYS.every(
      (key) =>
        a[key].length === b[key].length &&
        a[key].every((value, i) => value === b[key][i]),
    ) &&
    ["representation", "frameSize", "hopSize"].every(
      (key) => a.spectrum[key] === b.spectrum[key],
    ) &&
    a.spectrum.transitions.every(
      (value, i) => value === b.spectrum.transitions[i],
    )
  );
}
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
      update(observation) {
        expansion.update({ ...spectral, ...observation.spectrum });
        field.update(observation);
      },
      async compile(renderer) {
        await expansion.compile(renderer);
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
 * Admission never advances acoustic time. A topology is compiled once; each
 * strictly newer observation uploads once. Camera frames and GPU completion
 * cannot call back into source capture, worker init or packet publication.
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
    resources = null,
    frameId = 0,
    revision = 0;
  let disposed = false,
    derivedFieldDirty = false,
    basisCompileCount = 0,
    observationUploadCount = 0;
  return {
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
      if (topology && !changed && !sameTopology(topology, next))
        throw new TypeError("A v3 topology changed without a new revision");
      const topologyChanged = !topology || Boolean(changed);
      if (!topologyChanged && frame.observation.frameId <= frameId)
        return { accepted: false, reason: "non-increasing-observation" };
      if (topologyChanged) {
        const candidate = create(next, getApertureRadius());
        try {
          candidate.update(frame.observation);
        } catch (error) {
          candidate.dispose();
          throw error;
        }
        resources?.dispose();
        resources = candidate;
        topology = next;
        basisCompileCount++;
        revision++;
      } else resources.update(frame.observation);
      frameId = frame.observation.frameId;
      observationUploadCount++;
      derivedFieldDirty = true;
      return { accepted: true, topologyChanged, revision };
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
