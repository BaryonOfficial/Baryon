import { compileRenderPass } from "./compileRenderPass.js";
import * as THREE from "three";
import { hasRenderAuthority } from "../renderAuthorityContract.js";
import { createRendererFeatureView } from "../../utils/audio/audioFeaturePacketCodec.js";
import { createObservationHistory } from "../../render/observationHistory.js";
import { updateRaymarchReactiveResponse } from "./runtimeReactiveResponse.js";
import {
  clearRaymarchUniformProjection,
  setRaymarchUniformIfChanged,
  syncRaymarchUniformProjection,
} from "./runtimeUniformProjection.js";
import { applyRaymarchModelUpload } from "./runtimeModalUpload.js";
import { clampCymaticObserverGeometryExposureSeconds } from "./cymaticObserverReference.js";
import {
  RAYMARCH_QUANTITY_LEDGER_VERSION,
  RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
  RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
} from "./quantityLedger.js";

const EPOCH_KEYS = [
  "sourceGeneration",
  "workerGeneration",
  "timelineRevision",
  "processingRevision",
  "topologyRevision",
];
const SPECTRAL_SEED = Object.freeze([1, 0]);
function isStaleTopology(previous, next) {
  const changed =
    previous && EPOCH_KEYS.find((key) => previous[key] !== next[key]);
  return Boolean(changed && next[changed] < previous[changed]);
}

/** Cache every admitted endpoint before presentation. This never sends audio commands. */
export function queueRaymarchObservation(runtimeState, model) {
  if (runtimeState.disposed) return false;
  const frame = createRendererFeatureView(model);
  if (runtimeState.presentationReady !== true) return false;
  const next = frame.topology;
  const previous = runtimeState.observationTopology;
  const changed =
    previous && EPOCH_KEYS.find((key) => previous[key] !== next[key]);
  if (changed && next[changed] < previous[changed]) return false;
  if (changed) {
    revokeRaymarchObservationHistory(runtimeState);
    return false;
  }
  if (!previous || changed) {
    runtimeState.observationTopology = next;
    runtimeState.observationHistory = createObservationHistory({
      generation: next,
      capacity: 64,
    });
    runtimeState.latestFeatureFrame = null;
    runtimeState.presentationFailure = null;
  }
  if (frame.frameId <= (runtimeState.latestFeatureFrame?.frameId ?? 0))
    return false;
  if (runtimeState.presentationFailure) return false;
  runtimeState.latestFeatureFrame = frame;
  try {
    return runtimeState.observationHistory.offer(frame.observation);
  } catch (error) {
    runtimeState.presentationFailure =
      error instanceof Error ? error.message : String(error);
    throw error;
  }
}
/** A lost/replaced presentation stream may reseed from one current model.
 * This resets only the observer, never source PCM, epochs or derived field data. */
export function revokeRaymarchObservationHistory(runtimeState) {
  if (runtimeState.disposed) return;
  runtimeState.presentationReady = false;
  runtimeState.presentationRevision =
    (runtimeState.presentationRevision ?? 0) + 1;
  runtimeState.observationTopology = null;
  runtimeState.observationHistory = null;
  runtimeState.latestFeatureFrame = null;
  runtimeState.lastBakedFeatureFrame = null;
  runtimeState.lastObserverResetToken = null;
  runtimeState.volumeMesh.visible = false;
}
function resetToken(runtimeState, topology) {
  const mesh = runtimeState.volumeMesh.userData;
  return JSON.stringify([
    runtimeState.presentationRevision ?? 0,
    ...EPOCH_KEYS.map((key) => topology[key]),
    mesh.raymarchVolumeShape,
    mesh.raymarchBaseRadius,
    runtimeState.cymaticObserverTuning.geometryExposureSeconds,
  ]);
}
function publishDiagnostics(runtimeState, frame) {
  const source = runtimeState.fieldSource.read();
  runtimeState.debugSnapshot = {
    renderQuantityLedgerVersion: RAYMARCH_QUANTITY_LEDGER_VERSION,
    opticalFieldRepresentation: RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
    spectralPhaseRepresentation: RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
    volumeVisible: runtimeState.volumeMesh.visible,
    idleOverlayVisible: runtimeState.idleOverlay.visible,
    protocolVersion: frame?.topology.protocolVersion ?? null,
    familyCount: frame?.topology.familyCount ?? 0,
    shellCount: frame?.topology.shellCount ?? 0,
    normalizationEnergy: frame?.observation.normalizationEnergy ?? null,
    latestAcceptedEndSample: frame?.observation.endSample ?? null,
    observationEndSample:
      runtimeState.lastBakedFeatureFrame?.observation.endSample ?? null,
    sourcePhase: frame?.observation.sourcePhase ?? null,
    renderAuthority: hasRenderAuthority(frame),
    presentationReady: runtimeState.presentationReady === true,
    preparationPending: Boolean(
      runtimeState.preparation && !runtimeState.preparation.error,
    ),
    preparationError: runtimeState.preparation?.error ?? null,
    basisCompileCount: source.basisCompileCount,
    observationUploadCount: source.observationUploadCount,
    derivedTextureBytes: source.textureBytes,
    observationHistory: runtimeState.observationHistory?.read() ?? null,
    observer: runtimeState.fieldCache.getObserverState(),
    presentationFailure: runtimeState.presentationFailure ?? null,
  };
}
function bakeObservation(runtimeState, frame, renderer) {
  runtimeState.volumeMesh.userData.raymarchBoundaryMode =
    frame.topology.boundaryMode;
  runtimeState.cymaticObserverBakeResult = runtimeState.fieldCache.bake(
    renderer,
    {
      boundaryMode: frame.topology.boundaryMode,
      volumeShape: runtimeState.volumeMesh.userData.raymarchVolumeShape,
      observationTimeSeconds:
        frame.observation.endSample / frame.topology.sampleRate,
      observationAdvancing: frame.observation.sourcePhase !== "paused",
      geometryExposureSeconds: clampCymaticObserverGeometryExposureSeconds(
        runtimeState.cymaticObserverTuning.geometryExposureSeconds,
      ),
      observationResetToken: resetToken(runtimeState, frame.topology),
      observationCheckpointKey: null,
      modalFieldSpectralSeedDirection: SPECTRAL_SEED,
    },
  );
  runtimeState.lastObserverResetToken = resetToken(
    runtimeState,
    frame.topology,
  );
  if (runtimeState.cymaticObserverBakeResult.baked)
    runtimeState.lastBakedFeatureFrame = frame;
  return runtimeState.cymaticObserverBakeResult;
}
export function tickRaymarchRuntime(
  runtimeState,
  featureFrame,
  time,
  _deltaTime,
  renderer = null,
) {
  if (runtimeState.disposed) return;
  if (
    featureFrame?.topology &&
    isStaleTopology(
      runtimeState.fieldSource.read().topology,
      featureFrame.topology,
    )
  )
    return;
  runtimeState.cymaticObserverBakeResult = null;
  setRaymarchUniformIfChanged(runtimeState.uniforms.uTime, time);
  if (
    !hasRenderAuthority(featureFrame) ||
    runtimeState.presentationFailure ||
    runtimeState.presentationReady !== true
  ) {
    runtimeState.volumeMesh.visible = false;
    runtimeState.idleOverlay.visible =
      featureFrame?.isLiveInputActive !== true &&
      featureFrame?.isPlaying !== true;
    updateRaymarchReactiveResponse(runtimeState, null, "idle", false);
    clearRaymarchUniformProjection(runtimeState);
    publishDiagnostics(runtimeState, null);
    return;
  }
  // The live subscription normally queued this already. Genuine renderer replay
  // may supply the latest complete model once; duplicates cannot republish it.
  queueRaymarchObservation(runtimeState, featureFrame);
  if (renderer) {
    // Drain the bounded batch present at this tick. A per-frame bake limit
    // makes the fixed audio-time observer fall behind below that render rate,
    // eventually faulting healthy audio. Retain every endpoint and let the
    // observer clock alone decide which ones require GPU evolution.
    const queued = runtimeState.observationHistory.read().queued;
    for (let i = 0; i < queued; i++) {
      const observation = runtimeState.observationHistory.take();
      if (!observation) break;
      const frame = createRendererFeatureView({
        topology: runtimeState.observationTopology,
        observation,
      });
      applyRaymarchModelUpload({ runtimeState, featureFrame: frame });
      bakeObservation(runtimeState, frame, renderer);
    }
  }
  // Only an explicit apparatus change can reseed a held observation here.
  if (
    renderer &&
    runtimeState.uploadedFeatureFrame &&
    runtimeState.lastObserverResetToken !==
      resetToken(runtimeState, runtimeState.uploadedFeatureFrame.topology)
  )
    bakeObservation(runtimeState, runtimeState.uploadedFeatureFrame, renderer);
  const latest = runtimeState.latestFeatureFrame;
  updateRaymarchReactiveResponse(runtimeState, latest, "active", true);
  syncRaymarchUniformProjection(runtimeState);
  runtimeState.volumeMesh.visible =
    runtimeState.fieldCache.getObserverState().hasHistory;
  runtimeState.idleOverlay.visible = false;
  publishDiagnostics(runtimeState, latest);
}

/** Prepare one real model's derived resources, never an observer step or source.
 * Completion only records flags. Ordinary ticks own derived dispatch/activation. */
export function prepareRaymarchRuntime(
  runtimeState,
  featureFrame,
  renderer,
  { camera = null, scene = null, outputTarget = null, outputMrt = null } = {},
) {
  if (runtimeState.disposed) return { ready: false, pending: false };
  const frame = createRendererFeatureView(featureFrame);
  if (
    frame &&
    isStaleTopology(runtimeState.fieldSource.read().topology, frame.topology)
  )
    return { ready: false, pending: false, reason: "stale-topology" };
  if (!hasRenderAuthority(frame)) return { ready: false, pending: false };
  if (!renderer?.compileAsync || !camera || !scene)
    return {
      ready: false,
      pending: false,
      reason: "renderer-unavailable",
    };
  const mesh = runtimeState.volumeMesh;
  const key = JSON.stringify([
    ...EPOCH_KEYS.map((name) => frame.topology[name]),
    mesh.material.uuid,
    mesh.userData.raymarchVolumeShape,
    outputTarget?.uuid ?? "canvas",
    outputMrt?.id ?? null,
  ]);
  let preparation = runtimeState.preparation;
  if (!preparation && runtimeState.preparedPresentationKey === key) {
    const activated = runtimeState.presentationReady !== true;
    runtimeState.presentationReady = true;
    return { ready: true, pending: false, activated };
  }
  runtimeState.presentationReady = false;
  if (preparation?.key === key && preparation.error)
    return {
      ready: false,
      pending: false,
      error: preparation.error,
    };
  if (preparation && !preparation.settled)
    return { ready: false, pending: true };
  if (preparation?.key === key && preparation.compiled) {
    if (!preparation.derivedPrepared) {
      // This dispatch belongs to the ordinary frame, whose existing submission
      // gate waits for it before a later ordinary frame activates the observer.
      runtimeState.fieldSource.prepare(renderer);
      preparation.derivedPrepared = true;
      return { ready: false, pending: true };
    }
    runtimeState.preparedPresentationKey = key;
    runtimeState.preparation = null;
    runtimeState.presentationReady = true;
    return { ready: true, pending: false, activated: true };
  }
  revokeRaymarchObservationHistory(runtimeState);
  runtimeState.presentationFailure = null;
  runtimeState.preparedPresentationKey = null;
  preparation = {
    key,
    settled: false,
    compiled: false,
    derivedPrepared: false,
    error: null,
    promise: null,
  };
  runtimeState.preparation = preparation;
  const fail = (error) => {
    if (!runtimeState.disposed) {
      preparation.error =
        error instanceof Error ? error.message : String(error);
      runtimeState.presentationFailure = preparation.error;
    }
  };
  let target;
  try {
    applyRaymarchModelUpload({ runtimeState, featureFrame: frame });
    target = mesh.clone();
    target.visible = true;
  } catch (error) {
    fail(error);
    preparation.settled = true;
    return {
      ready: false,
      pending: false,
      error: preparation.error,
    };
  }
  preparation.promise = (async () => {
    await runtimeState.fieldSource.compile(renderer);
    if (runtimeState.disposed) return;
    await runtimeState.fieldCache.compile(renderer);
    if (runtimeState.disposed) return;
    await compileRenderPass(renderer, {
      scene,
      camera,
      object: target,
      target: outputTarget,
      mrt: outputMrt,
    });
  })()
    .then(() => {
      if (!runtimeState.disposed) preparation.compiled = true;
    })
    .catch(fail)
    .finally(() => {
      preparation.settled = true;
    });
  return { ready: false, pending: true };
}
export function disposeRaymarchRuntime(runtimeState) {
  if (!runtimeState || runtimeState.disposed) return;
  runtimeState.disposed = true;
  runtimeState.observationHistory = null;
  runtimeState.latestFeatureFrame = null;
  runtimeState.fieldCache.dispose();
  runtimeState.fieldSource.dispose();
  runtimeState.plasmaProfileLookup?.dispose();
  runtimeState.points?.traverse?.((child) => {
    child.geometry?.dispose();
    const materials = child.userData?.raymarchMaterialCache;
    if (materials)
      Object.values(materials).forEach((material) => material.dispose());
    else child.material?.dispose();
    child.shadow?.map?.dispose();
  });
}

export function createRaymarchSceneRoot({ volumeMesh, idleOverlay, radius }) {
  const root = new THREE.Group();
  const visualRoot = new THREE.Group();
  const cymaticRoot = new THREE.Group();
  cymaticRoot.add(volumeMesh);
  visualRoot.add(cymaticRoot);
  visualRoot.add(idleOverlay);
  root.add(visualRoot);

  // Fixed illumination: the acoustic field owns structure while this
  // symmetric optical rig owns the direct-light response.
  const primaryLight = new THREE.PointLight(0xe6f7ff, 1.25, radius * 6, 2);
  primaryLight.position.set(radius * 1.15, radius * 0.85, radius * 1.8);
  primaryLight.castShadow = false;
  root.add(primaryLight);

  const secondaryLight = new THREE.PointLight(0xe6f7ff, 1.25, radius * 6, 2);
  secondaryLight.position.set(-radius * 1.15, radius * 0.85, radius * 1.8);
  secondaryLight.castShadow = false;
  root.add(secondaryLight);

  return {
    root,
    visualRoot,
    cymaticRoot,
    sceneLighting: {
      primary: primaryLight,
      secondary: secondaryLight,
    },
  };
}
