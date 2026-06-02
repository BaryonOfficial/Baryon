export const RENDER_PROBE_SCHEMA_VERSION = "baryon-render-probe-v1";

export const RENDER_PROBE_MATERIAL_FIELDS = Object.freeze([
  "materialProbePhysicalDensity",
  "materialProbeCausticVisibleDensity",
  "materialProbeSupportVisibleDensity",
  "materialProbePreBloomRadiance",
  "materialProbePostBloomRisk",
  "materialProbeBloomAmplification",
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
        "materialProbePreBloomRadiance",
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
  const observationEnergy = readFirstFinite(
    render.observationEnergy,
    raymarchDebug.observationEnergy,
    featureFrame?.observationEnergy,
  );
  const volumeVisible = readBoolean(
    debugSnapshot?.volumeVisible ?? raymarchDebug.volumeVisible,
    true,
  );
  const activeCandidate =
    volumeVisible === true &&
    renderAuthority === true &&
    (projectedRenderEnergy > 0 || observationEnergy > 0);
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
      totalSlotAmplitude: readFiniteNumber(
        runtimeState?.uniforms?.uTotalSlotAmplitude?.value ??
          raymarchDebug.totalSlotAmplitude ??
          render.totalSlotAmplitude,
      ),
      structuralProjectionDrive: readFiniteNumber(
        runtimeState?.uniforms?.uStructuralProjectionDrive?.value ??
          raymarchDebug.structuralProjectionDrive ??
          render.structuralProjectionDrive,
      ),
      structuralProjectionConcentration: readFiniteNumber(
        runtimeState?.uniforms?.uStructuralProjectionConcentration?.value ??
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
      observationEnergy,
      observationSampledDensityFloor: readFiniteNumber(
        render.observationSampledDensityFloor ??
          raymarchDebug.observationSampledDensityFloor,
      ),
      observationSampledContourSupport: readFiniteNumber(
        render.observationSampledContourSupport ??
          raymarchDebug.observationSampledContourSupport,
      ),
      materialProbePhysicalDensity: readFiniteNumber(
        render.materialProbePhysicalDensity ??
          raymarchDebug.materialProbePhysicalDensity,
      ),
      materialProbeCausticVisibleDensity: readFiniteNumber(
        render.materialProbeCausticVisibleDensity ??
          raymarchDebug.materialProbeCausticVisibleDensity,
      ),
      materialProbeSupportVisibleDensity: readFiniteNumber(
        render.materialProbeSupportVisibleDensity ??
          raymarchDebug.materialProbeSupportVisibleDensity,
      ),
      materialProbePreBloomRadiance: readFiniteNumber(
        render.materialProbePreBloomRadiance ??
          raymarchDebug.materialProbePreBloomRadiance,
      ),
      materialProbePostBloomRisk: readFiniteNumber(
        render.materialProbePostBloomRisk ??
          raymarchDebug.materialProbePostBloomRisk,
      ),
      materialProbeBloomAmplification: readFiniteNumber(
        render.materialProbeBloomAmplification ??
          raymarchDebug.materialProbeBloomAmplification,
        1,
      ),
    },
    visual: {
      volumeVisible,
      idleOverlayVisible: readBoolean(
        debugSnapshot?.idleOverlayVisible ?? raymarchDebug.idleOverlayVisible,
      ),
      bloomEnabled: readBoolean(render.bloomEnabled),
      renderScale: readFiniteNumber(render.renderScale, 1),
      screenshotMetricSource: null,
    },
  };
}
