import { hasRenderAuthority } from "@baryon/engine/core/renderAuthorityContract";

export const RENDER_PROBE_SCHEMA_VERSION = "baryon-render-probe-v3";
export const RENDER_PROBE_MATERIAL_FIELDS = Object.freeze([
  "plasmaProbeLocalRadiance",
  "plasmaProbePersistence",
  "plasmaProbeOrganizedDensity",
  "plasmaProbeExtinction",
  "plasmaProbePreBloomRadiance",
  "plasmaProbePostBloomRisk",
  "plasmaProbeBloomAmplification",
]);

// Metadata proves submission/state ownership, never the measured optical field.
// A material probe is available only when an explicit complete readback exists;
// missing measurements remain null, including during valid quiet geometry.
export function buildRenderProbeSnapshot({
  renderDiagnostics = null,
  debugSnapshot = null,
  runtimeState = null,
  featureFrame = null,
  nowMs = null,
} = {}) {
  const materialProbe = renderDiagnostics?.materialProbe;
  const available =
    materialProbe?.available === true &&
    RENDER_PROBE_MATERIAL_FIELDS.every((key) =>
      Number.isFinite(materialProbe[key]),
    );
  const observation = featureFrame?.observation;
  const source = runtimeState?.fieldSource?.read?.();
  const renderAuthority = featureFrame
    ? hasRenderAuthority(featureFrame)
    : debugSnapshot?.renderAuthority === true;
  const volumeVisible =
    runtimeState?.volumeMesh?.visible ?? debugSnapshot?.volumeVisible ?? false;
  return {
    schemaVersion: RENDER_PROBE_SCHEMA_VERSION,
    capturedAtMs: Number.isFinite(nowMs) ? nowMs : null,
    health: {
      available,
      activeCandidate: renderAuthority && volumeVisible,
      status: available ? "available" : "unavailable",
      unavailableReason: available ? null : "material-readback-unavailable",
    },
    state: {
      renderAuthority,
      sourcePhase:
        observation?.sourcePhase ?? debugSnapshot?.sourcePhase ?? null,
      familyCount:
        featureFrame?.topology.familyCount ?? debugSnapshot?.familyCount ?? 0,
      shellCount:
        featureFrame?.topology.shellCount ?? debugSnapshot?.shellCount ?? 0,
      normalizationEnergy:
        observation?.normalizationEnergy ??
        debugSnapshot?.normalizationEnergy ??
        null,
      latestAcceptedEndSample:
        observation?.endSample ??
        debugSnapshot?.latestAcceptedEndSample ??
        null,
      observerConsumedEndSample:
        runtimeState?.lastBakedFeatureFrame?.observation.endSample ??
        debugSnapshot?.observationEndSample ??
        null,
      basisCompileCount:
        source?.basisCompileCount ?? debugSnapshot?.basisCompileCount ?? 0,
      observationUploadCount:
        source?.observationUploadCount ??
        debugSnapshot?.observationUploadCount ??
        0,
      presentationFailure:
        runtimeState?.presentationFailure ??
        debugSnapshot?.presentationFailure ??
        null,
    },
    material: Object.fromEntries(
      RENDER_PROBE_MATERIAL_FIELDS.map((key) => [
        key,
        available ? materialProbe[key] : null,
      ]),
    ),
    visual: {
      volumeVisible,
      idleOverlayVisible:
        runtimeState?.idleOverlay?.visible ??
        debugSnapshot?.idleOverlayVisible ??
        false,
      bloomEnabled: renderDiagnostics?.bloomEnabled === true,
      screenshotMetricSource: null,
    },
  };
}
