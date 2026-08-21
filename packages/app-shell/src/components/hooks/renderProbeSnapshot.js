import {
  RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
  RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
} from "@baryon/engine/core/raymarch/quantityLedger";

export const RENDER_PROBE_SCHEMA_VERSION = "baryon-render-probe-v2";

export const RENDER_PROBE_MATERIAL_FIELDS = Object.freeze([
  "plasmaProbeLocalRadiance",
  "plasmaProbePersistence",
  "plasmaProbeOrganizedDensity",
  "plasmaProbeExtinction",
  "plasmaProbePreBloomRadiance",
  "plasmaProbePostBloomRisk",
  "plasmaProbeBloomAmplification",
]);

function readFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function readBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function readString(value, fallback = null) {
  return typeof value === "string" ? value : fallback;
}

function readStringArrayMap(value, fallback = null) {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entries]) => [
      key,
      Array.isArray(entries) ? [...entries] : [],
    ]),
  );
}

function readRaymarchDebug(debugSnapshot = null) {
  if (!debugSnapshot || typeof debugSnapshot !== "object") {
    return {};
  }
  return debugSnapshot.raymarchDebug ?? debugSnapshot;
}

function hasRaymarchProbe(debugSnapshot = null) {
  const raymarchDebug = readRaymarchDebug(debugSnapshot);
  return (
    Boolean(debugSnapshot) &&
    (Object.prototype.hasOwnProperty.call(raymarchDebug, "renderAuthority") ||
      Object.prototype.hasOwnProperty.call(
        raymarchDebug,
        "plasmaProbePreBloomRadiance",
      ) ||
      Object.prototype.hasOwnProperty.call(raymarchDebug, "avgDensity"))
  );
}

function readFirstFinite(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

export function buildRenderProbeSnapshot({
  renderDiagnostics = null,
  debugSnapshot = null,
  runtimeState = null,
  featureFrame = null,
  nowMs = null,
} = {}) {
  const render = renderDiagnostics ?? {};
  const raymarchDebug = readRaymarchDebug(debugSnapshot);
  const available = hasRaymarchProbe(debugSnapshot);
  const renderAuthority = readBoolean(
    raymarchDebug.renderAuthority ?? featureFrame?.renderAuthority,
    false,
  );
  const projectedRenderEnergy = readFirstFinite(
    featureFrame?.energyLedger?.projectedRenderEnergy,
    raymarchDebug.projectedRenderEnergy,
  );
  const observerLocalRadiance = readFirstFinite(
    render.plasmaProbeLocalRadiance,
    raymarchDebug.plasmaProbeLocalRadiance,
    featureFrame?.observationEnergy,
  );
  const volumeVisible = readBoolean(
    debugSnapshot?.volumeVisible ?? raymarchDebug.volumeVisible,
    true,
  );
  const activeCandidate =
    volumeVisible === true &&
    renderAuthority === true &&
    (projectedRenderEnergy > 0 || observerLocalRadiance > 0);
  const status = available ? "available" : "unavailable";

  return {
    schemaVersion: RENDER_PROBE_SCHEMA_VERSION,
    capturedAtMs: Number.isFinite(nowMs) ? nowMs : null,
    lanes: ["state", "material", "visual"],
    health: {
      available,
      activeCandidate,
      status,
      unavailableReason: available ? null : "raymarch-debug-missing",
    },
    source: {
      runtimeDiagnostics: Boolean(renderDiagnostics),
      debugSnapshot: Boolean(debugSnapshot),
      raymarchDebug: available,
    },
    state: {
      fieldState: readString(
        raymarchDebug.fieldState ?? featureFrame?.fieldState,
        "idle",
      ),
      renderAuthority,
      projectedRenderEnergy,
      activeModeCount: readFiniteNumber(
        render.activeModeCount ??
          raymarchDebug.uploadedModeSlotCount ??
          raymarchDebug.modeSlotCount,
      ),
      visibilityGateState: readString(
        render.visibilityGateState ?? raymarchDebug.visibilityGateState,
        available ? "unknown" : "unavailable",
      ),
      visibilityGateBlockedReason: readString(
        render.visibilityGateBlockedReason ??
          raymarchDebug.visibilityGateBlockedReason,
      ),
      spectralPresentationEnabled: readBoolean(
        render.spectralPresentationEnabled ??
          raymarchDebug.spectralPresentationEnabled,
      ),
      spectralColorFieldImplementationState: readString(
        render.spectralColorFieldImplementationState ??
          raymarchDebug.spectralColorFieldImplementationState,
        RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
      ),
      opticalFieldRepresentation: readString(
        render.opticalFieldRepresentation ??
          raymarchDebug.opticalFieldRepresentation,
        RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
      ),
      totalSlotAmplitude: readFiniteNumber(
        runtimeState?.raymarchStructuralProjection?.amplitudeSum ??
          raymarchDebug.totalSlotAmplitude ??
          render.totalSlotAmplitude,
      ),
      structuralProjectionDrive: readFiniteNumber(
        runtimeState?.raymarchStructuralProjection?.projectionEnergyDrive ??
          raymarchDebug.structuralProjectionDrive ??
          render.structuralProjectionDrive,
      ),
      radiationPotentialObservedCoefficientEnergy: readFiniteNumber(
        runtimeState?.radiationPotentialCoefficientFrame
          ?.observedCoefficientEnergy ??
          raymarchDebug.radiationPotentialObservedCoefficientEnergy ??
          render.radiationPotentialObservedCoefficientEnergy,
      ),
      radiationPotentialObservedCoefficientNorm: readFiniteNumber(
        runtimeState?.radiationPotentialCoefficientFrame
          ?.observedCoefficientNorm ??
          raymarchDebug.radiationPotentialObservedCoefficientNorm ??
          render.radiationPotentialObservedCoefficientNorm,
      ),
      radiationPotentialNormalizedEnergyNorm: readFiniteNumber(
        raymarchDebug.radiationPotentialNormalizedEnergyNorm ??
          render.radiationPotentialNormalizedEnergyNorm,
      ),
      radiationPotentialBakeModeCount: readFiniteNumber(
        raymarchDebug.radiationPotentialBakeModeCount ??
          render.radiationPotentialBakeModeCount,
      ),
      radiationPotentialExposureDrive: readFiniteNumber(
        raymarchDebug.radiationPotentialExposureDrive ??
          render.radiationPotentialExposureDrive,
      ),
      structuralProjectionConcentration: readFiniteNumber(
        runtimeState?.raymarchStructuralProjection?.structuralConcentration ??
          raymarchDebug.structuralProjectionConcentration ??
          render.structuralProjectionConcentration,
      ),
      renderQuantityLedgerVersion: readString(
        render.renderQuantityLedgerVersion ??
          raymarchDebug.renderQuantityLedgerVersion,
      ),
      renderQuantityForbiddenConsumers: readStringArrayMap(
        render.renderQuantityForbiddenConsumers ??
          raymarchDebug.renderQuantityForbiddenConsumers,
      ),
    },
    material: {
      observerLocalRadiance,
      observerGeometryExposureSeconds: readFiniteNumber(
        render.observerGeometryExposureSeconds ??
          raymarchDebug.observerGeometryExposureSeconds,
      ),
      observerRadianceExposureSeconds: readFiniteNumber(
        render.observerRadianceExposureSeconds ??
          raymarchDebug.observerRadianceExposureSeconds,
      ),
      observerSpectralExposureSeconds: readFiniteNumber(
        render.observerSpectralExposureSeconds ??
          raymarchDebug.observerSpectralExposureSeconds,
      ),
      plasmaProbePersistence: readFiniteNumber(
        render.plasmaProbePersistence ?? raymarchDebug.plasmaProbePersistence,
      ),
      plasmaProbeOrganizedDensity: readFiniteNumber(
        render.plasmaProbeOrganizedDensity ??
          raymarchDebug.plasmaProbeOrganizedDensity,
      ),
      plasmaProbeExtinction: readFiniteNumber(
        render.plasmaProbeExtinction ?? raymarchDebug.plasmaProbeExtinction,
      ),
      plasmaProbePreBloomRadiance: readFiniteNumber(
        render.plasmaProbePreBloomRadiance ??
          raymarchDebug.plasmaProbePreBloomRadiance,
      ),
      plasmaProbePostBloomRisk: readFiniteNumber(
        render.plasmaProbePostBloomRisk ??
          raymarchDebug.plasmaProbePostBloomRisk,
      ),
      plasmaProbeBloomAmplification: readFiniteNumber(
        render.plasmaProbeBloomAmplification ??
          raymarchDebug.plasmaProbeBloomAmplification,
        1,
      ),
    },
    visual: {
      volumeVisible,
      idleOverlayVisible: readBoolean(
        debugSnapshot?.idleOverlayVisible ?? raymarchDebug.idleOverlayVisible,
      ),
      bloomEnabled: readBoolean(render.bloomEnabled),
      screenshotMetricSource: null,
    },
  };
}
