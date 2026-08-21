import * as THREE from "three";
import { normalizeCavityGeometry } from "../cavityGeometry.js";
import {
  hasPreparationAuthority,
  hasRenderAuthority,
} from "../renderAuthorityContract.js";
import { publishRaymarchRuntimeAuditSnapshot } from "./runtimeDiagnostics.js";
import { getRuntimeEffectiveCavityGeometry } from "./runtimeStateSelectors.js";
import { updateRaymarchReactiveResponse } from "./runtimeReactiveResponse.js";
import {
  clearRaymarchUniformProjection,
  setRaymarchUniformIfChanged,
  syncRaymarchUniformProjection,
} from "./runtimeUniformProjection.js";
import {
  applyRaymarchModalPacketUploads,
  resetRaymarchUploadState,
} from "./runtimeModalUpload.js";
import { inferModalFieldCapacity } from "./fieldAnalysis.js";
import { setRaymarchCavityGeometry } from "./material.js";
import { resolveIdleOverlayVisible } from "../idleLogoVisibility.js";
import { hasActiveFilePlaybackTransport } from "../sourceTransportContract.js";
import {
  clampCymaticObserverGeometryExposureSeconds,
  resolveCymaticObserverStepIndex,
} from "./cymaticObserverReference.js";
import { RAYMARCH_SPECTRAL_PHASE_REPRESENTATION } from "./quantityLedger.js";

function readRuntimeTimeSec(time) {
  return Number.isFinite(time) ? Math.max(0, time) : 0;
}

function isExplicitStoppedTransport(featureFrame) {
  return (
    featureFrame?.sourceEvidence?.transport?.playbackEndReason === "stopped"
  );
}

function clearRenderAuthorityDisplayHold(runtimeState) {
  runtimeState.renderAuthorityDisplayHoldActive = false;
  runtimeState.renderAuthorityDisplayHoldAgeSec = null;
}

function readCymaticObserverGeometryExposureSeconds(runtimeState) {
  return clampCymaticObserverGeometryExposureSeconds(
    runtimeState?.cymaticObserverTuning?.geometryExposureSeconds,
  );
}

function clearBufferNode(bufferNode) {
  const array = bufferNode?.value?.array;
  if (!array?.fill) {
    return;
  }

  let hasNonZero = false;
  for (let index = 0; index < array.length; index += 1) {
    if (array[index] !== 0) {
      hasNonZero = true;
      break;
    }
  }
  if (!hasNonZero) {
    return;
  }

  array.fill(0);
  bufferNode.value.needsUpdate = true;
  bufferNode.syncUniforms?.();
}

function resetRenderAuthorityState(runtimeState) {
  clearBufferNode(runtimeState.modalFieldModeBuffer);
  clearBufferNode(runtimeState.modalFieldSpectralMomentBuffer);
  clearBufferNode(runtimeState.modalFieldCoefficientBuffer);
  clearBufferNode(runtimeState.modalFieldResponseBuffer);
  runtimeState.raymarchFieldAnalysis = null;
  if (runtimeState.bloomTuning) {
    runtimeState.bloomTuning.bloomAllowed = false;
  }
  runtimeState.renderAuthorityLastVisibleAtSec = null;
  runtimeState.renderAuthorityHoldEvaluatedAtSec = null;
  clearRenderAuthorityDisplayHold(runtimeState);
  runtimeState.currentModalDescriptor = null;
  runtimeState.preparedObserverFrameKey = null;
  resetRaymarchUploadState(runtimeState);
  runtimeState.renderAuthorityResetApplied = true;
}

function resolveFatalModalDescriptorBlockReason(fieldAuthority) {
  if (
    !fieldAuthority ||
    fieldAuthority === "complete" ||
    fieldAuthority === "capacity-limited"
  ) {
    return null;
  }

  return "descriptor-blocked";
}

function blockNonAuthoritativeModalDescriptor(
  runtimeState,
  featureFrame,
  fieldState,
  renderAuthority,
) {
  clearBufferNode(runtimeState.modalFieldModeBuffer);
  clearBufferNode(runtimeState.modalFieldSpectralMomentBuffer);
  clearBufferNode(runtimeState.modalFieldCoefficientBuffer);
  clearBufferNode(runtimeState.modalFieldResponseBuffer);
  runtimeState.raymarchFieldAnalysis = null;
  if (runtimeState.bloomTuning) {
    runtimeState.bloomTuning.bloomAllowed = false;
  }
  runtimeState.renderAuthorityLastVisibleAtSec = null;
  runtimeState.renderAuthorityHoldEvaluatedAtSec = null;
  clearRenderAuthorityDisplayHold(runtimeState);
  resetRaymarchUploadState(runtimeState);
  clearRaymarchUniformProjection(runtimeState);
  runtimeState.volumeMesh.visible = false;
  runtimeState.idleOverlay.visible = resolveIdleOverlayVisible(
    runtimeState,
    featureFrame,
    renderAuthority,
  );
  publishRaymarchRuntimeAuditSnapshot(
    runtimeState,
    featureFrame,
    fieldState,
    renderAuthority,
  );
}

/**
 * Fill the field cache from the packet that was just uploaded.
 *
 * Ordering is the whole contract: the bake must follow the modal upload that
 * feeds it and precede the frame that reads it, so the march never samples a
 * cache built from a stale packet. Both hold inside the tick — uploads run
 * above, and the pipeline renders after the tick returns.
 */
function buildCymaticObserverApparatusIdentity(runtimeState) {
  const meshState = runtimeState.volumeMesh?.userData;
  return {
    observerAppearanceRepresentation: RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
    boundaryMode: meshState?.raymarchBoundaryMode ?? null,
    volumeShape: meshState?.raymarchVolumeShape ?? null,
    cavityGeometry: meshState?.raymarchCavityGeometry ?? null,
    radius: meshState?.raymarchBaseRadius ?? null,
    geometryExposureSeconds:
      readCymaticObserverGeometryExposureSeconds(runtimeState),
  };
}

function buildCymaticObserverResetToken(runtimeState, featureFrame) {
  return JSON.stringify({
    session: featureFrame?.observationSessionKey ?? null,
    ...buildCymaticObserverApparatusIdentity(runtimeState),
  });
}

function buildCymaticObserverCheckpointKey(runtimeState, featureFrame) {
  const sourceKey = featureFrame?.observationSourceKey;
  if (typeof sourceKey !== "string" || !sourceKey.startsWith("file:")) {
    return null;
  }
  return JSON.stringify({
    source: sourceKey,
    step: resolveCymaticObserverStepIndex(featureFrame?.observationTimeSeconds),
    ...buildCymaticObserverApparatusIdentity(runtimeState),
  });
}

function buildRaymarchPreparationFrameKey(runtimeState, featureFrame) {
  return JSON.stringify({
    observer: buildCymaticObserverResetToken(runtimeState, featureFrame),
    observationTimeSeconds: Number.isFinite(
      featureFrame?.observationTimeSeconds,
    )
      ? Math.max(0, featureFrame.observationTimeSeconds)
      : 0,
    topologyRevision: featureFrame?.topologyRevision ?? null,
    basisIdentityHash: featureFrame?.basisIdentityHash ?? null,
    observationInputSignature: featureFrame?.observationInputSignature ?? null,
    modalFieldModeCount:
      featureFrame?.modalDescriptor?.counts?.modalFieldModeCount ??
      featureFrame?.activeModalFieldModeCount ??
      0,
  });
}

function buildRaymarchPreparationCompileKey(runtimeState) {
  const meshState = runtimeState.volumeMesh?.userData;
  return JSON.stringify({
    material: runtimeState.volumeMesh?.material?.uuid ?? null,
    boundaryMode: meshState?.raymarchBoundaryMode ?? null,
    volumeShape: meshState?.raymarchVolumeShape ?? null,
    cavityGeometry: meshState?.raymarchCavityGeometry ?? null,
  });
}

function requestRaymarchMaterialCompilation(
  runtimeState,
  renderer,
  { camera = null, scene = null } = {},
) {
  if (
    typeof renderer?.compileAsync !== "function" ||
    !camera ||
    !scene ||
    !runtimeState.volumeMesh
  ) {
    return null;
  }

  const compileKey = buildRaymarchPreparationCompileKey(runtimeState);
  if (
    runtimeState.preparedMaterialCompileKey === compileKey ||
    runtimeState.pendingMaterialCompileKey === compileKey ||
    runtimeState.failedMaterialCompileKey === compileKey
  ) {
    return runtimeState.pendingMaterialCompilePromise ?? null;
  }

  // compileAsync skips invisible objects. A detached clone shares the exact
  // production geometry and material while letting the presented mesh remain
  // hidden throughout preparation.
  const compileTarget = runtimeState.volumeMesh.clone();
  compileTarget.visible = true;
  compileTarget.frustumCulled = false;
  runtimeState.pendingMaterialCompileKey = compileKey;
  runtimeState.materialPreparationError = null;

  const compilePromise = Promise.resolve(
    renderer.compileAsync(compileTarget, camera, scene),
  )
    .then(() => {
      if (runtimeState.pendingMaterialCompileKey === compileKey) {
        runtimeState.preparedMaterialCompileKey = compileKey;
      }
    })
    .catch((error) => {
      if (runtimeState.pendingMaterialCompileKey === compileKey) {
        runtimeState.failedMaterialCompileKey = compileKey;
        runtimeState.materialPreparationError =
          error instanceof Error ? error.message : String(error);
      }
    })
    .finally(() => {
      if (runtimeState.pendingMaterialCompileKey === compileKey) {
        runtimeState.pendingMaterialCompileKey = null;
        runtimeState.pendingMaterialCompilePromise = null;
      }
    });

  runtimeState.pendingMaterialCompilePromise = compilePromise;
  return compilePromise;
}

function bakeModalFieldCache(runtimeState, featureFrame, renderer) {
  const fieldCache = runtimeState.fieldCache;
  if (!fieldCache || !renderer) {
    return null;
  }

  const result = fieldCache.bake(renderer, {
    boundaryMode: runtimeState.volumeMesh?.userData?.raymarchBoundaryMode,
    volumeShape: runtimeState.volumeMesh?.userData?.raymarchVolumeShape,
    observationTimeSeconds: featureFrame?.observationTimeSeconds,
    observationAdvancing:
      featureFrame?.observationAdvancing === true &&
      featureFrame?.observationPaused !== true,
    geometryExposureSeconds:
      readCymaticObserverGeometryExposureSeconds(runtimeState),
    observationResetToken: buildCymaticObserverResetToken(
      runtimeState,
      featureFrame,
    ),
    observationCheckpointKey: buildCymaticObserverCheckpointKey(
      runtimeState,
      featureFrame,
    ),
    modalFieldSpectralSeedDirection:
      featureFrame?.modalFieldSpectralSeedDirection,
  });
  runtimeState.cymaticObserverBakeResult = result;
  if (result?.checkpointSaved === true) {
    runtimeState.cymaticObserverCheckpointSaveCount =
      (runtimeState.cymaticObserverCheckpointSaveCount ?? 0) + 1;
    runtimeState.cymaticObserverCheckpointLastEvent = "saved";
  } else if (result?.checkpointRestored === true) {
    runtimeState.cymaticObserverCheckpointRestoreCount =
      (runtimeState.cymaticObserverCheckpointRestoreCount ?? 0) + 1;
    runtimeState.cymaticObserverCheckpointLastEvent = "restored";
  }
  return result;
}

function clearCymaticObserverBakeResult(runtimeState) {
  if (runtimeState) {
    runtimeState.cymaticObserverBakeResult = null;
  }
}

function applyRaymarchRuntimeFrame(
  runtimeState,
  featureFrame,
  time,
  deltaTime,
  renderer = null,
  allowPreparationFrame = false,
) {
  // This is a per-tick event result, not retained observer state. Clear it
  // before any early return so diagnostics cannot replay a previous bake.
  clearCymaticObserverBakeResult(runtimeState);
  const { uniforms, volumeMesh, idleOverlay } = runtimeState;
  const modalFieldCapacity = inferModalFieldCapacity(
    runtimeState.modalFieldCapacity,
    runtimeState?.raymarchUploadState?.basisPlan?.identitySlots,
  );
  uniforms.uTime.value = time;
  const fieldState = featureFrame?.fieldState ?? "idle";
  const renderAuthority = hasRenderAuthority(featureFrame);
  const preparationAuthority =
    allowPreparationFrame === true && hasPreparationAuthority(featureFrame);
  const projectionAuthority = renderAuthority || preparationAuthority;
  const fatalModalDescriptorBlockReason =
    resolveFatalModalDescriptorBlockReason(
      featureFrame?.modalDescriptor?.fieldAuthority,
    );
  const observerState = runtimeState.fieldCache?.getObserverState?.() ?? null;
  const observerTerminated =
    featureFrame?.renderAuthorityRevoked === true ||
    isExplicitStoppedTransport(featureFrame) ||
    Boolean(fatalModalDescriptorBlockReason);
  const observerContinuationOwned =
    projectionAuthority || hasActiveFilePlaybackTransport(featureFrame);
  const observerContinuation =
    observerState?.hasHistory === true &&
    observerTerminated !== true &&
    observerContinuationOwned;
  if (!renderAuthority) {
    updateRaymarchReactiveResponse(
      runtimeState,
      featureFrame,
      fieldState,
      renderAuthority,
      deltaTime,
    );
  }
  setRaymarchUniformIfChanged(
    uniforms.uFieldState,
    runtimeState.fieldStateValues[fieldState] ??
      runtimeState.fieldStateValues.idle,
  );

  if (!projectionAuthority && fatalModalDescriptorBlockReason) {
    runtimeState.currentModalDescriptor = featureFrame.modalDescriptor;
    blockNonAuthoritativeModalDescriptor(
      runtimeState,
      featureFrame,
      fieldState,
      renderAuthority,
    );
    return;
  }

  if (!projectionAuthority && !observerContinuation) {
    if (
      featureFrame?.renderAuthorityRevoked === true ||
      isExplicitStoppedTransport(featureFrame)
    ) {
      runtimeState.renderAuthorityLastVisibleAtSec = null;
      clearRenderAuthorityDisplayHold(runtimeState);
    }
    if (runtimeState.renderAuthorityResetApplied !== true) {
      resetRenderAuthorityState(runtimeState);
    }
    clearRaymarchUniformProjection(runtimeState);
    volumeMesh.visible = false;
    idleOverlay.visible = resolveIdleOverlayVisible(
      runtimeState,
      featureFrame,
      renderAuthority,
    );
    publishRaymarchRuntimeAuditSnapshot(
      runtimeState,
      featureFrame,
      fieldState,
      renderAuthority,
    );
    return;
  }
  clearRenderAuthorityDisplayHold(runtimeState);
  runtimeState.renderAuthorityResetApplied = false;

  const effectiveCavityGeometry =
    getRuntimeEffectiveCavityGeometry(runtimeState);
  const modalDescriptor = featureFrame?.modalDescriptor ?? null;
  if (!modalDescriptor) {
    if (observerContinuation) {
      volumeMesh.visible = true;
      idleOverlay.visible = false;
      publishRaymarchRuntimeAuditSnapshot(
        runtimeState,
        featureFrame,
        fieldState,
        renderAuthority,
      );
      return;
    }
    blockNonAuthoritativeModalDescriptor(
      runtimeState,
      featureFrame,
      fieldState,
      renderAuthority,
    );
    return;
  }
  runtimeState.currentModalDescriptor = modalDescriptor;
  const rebuiltFatalModalDescriptorBlockReason =
    resolveFatalModalDescriptorBlockReason(modalDescriptor.fieldAuthority);
  if (rebuiltFatalModalDescriptorBlockReason) {
    blockNonAuthoritativeModalDescriptor(
      runtimeState,
      featureFrame,
      fieldState,
      renderAuthority,
    );
    return;
  }
  // The descriptor, upload buffers, and potential-cache bake share one modal
  // capacity. No render-side alias may narrow the canonical descriptor.
  const productUploadCapacity = modalFieldCapacity;
  const modalFrameProjection = applyRaymarchModalPacketUploads({
    runtimeState,
    featureFrame,
    modalDescriptor,
    productUploadCapacity,
    effectiveCavityGeometry,
  });
  updateRaymarchReactiveResponse(
    runtimeState,
    featureFrame,
    fieldState,
    renderAuthority,
    deltaTime,
  );
  syncRaymarchUniformProjection(
    runtimeState,
    featureFrame,
    deltaTime,
    modalFrameProjection,
  );

  const normalizedCavityGeometry = normalizeCavityGeometry(
    effectiveCavityGeometry,
  );
  if (
    runtimeState.volumeMesh?.userData?.raymarchCavityGeometry !==
    normalizedCavityGeometry
  ) {
    setRaymarchCavityGeometry(
      runtimeState.volumeMesh,
      normalizedCavityGeometry,
    );
  }
  const shouldAdvanceObserver =
    modalFrameProjection.modalFieldModeCount > 0 || observerContinuation;
  if (shouldAdvanceObserver) {
    bakeModalFieldCache(runtimeState, featureFrame, renderer);
  }
  const nextObserverState =
    runtimeState.fieldCache?.getObserverState?.() ?? observerState;
  volumeMesh.visible =
    modalFrameProjection.modalFieldModeCount > 0 ||
    nextObserverState?.hasHistory === true;
  if (renderAuthority && volumeMesh.visible) {
    runtimeState.renderAuthorityLastVisibleAtSec = readRuntimeTimeSec(time);
    runtimeState.renderAuthorityHoldEvaluatedAtSec = null;
  }
  const resolvedIdleOverlayVisible = resolveIdleOverlayVisible(
    runtimeState,
    featureFrame,
    renderAuthority,
  );
  idleOverlay.visible = volumeMesh.visible ? false : resolvedIdleOverlayVisible;
  publishRaymarchRuntimeAuditSnapshot(
    runtimeState,
    featureFrame,
    fieldState,
    renderAuthority,
  );
}

export function tickRaymarchRuntime(
  runtimeState,
  featureFrame,
  time,
  deltaTime,
  renderer = null,
) {
  return applyRaymarchRuntimeFrame(
    runtimeState,
    featureFrame,
    time,
    deltaTime,
    renderer,
    false,
  );
}

/**
 * Prepare the production field and material while the loaded file remains
 * visually idle.
 *
 * This is a seed operation, never an evolution step. Repeated render ticks and
 * camera motion resolve to the same key and do no field work. A source or
 * apparatus change produces a new key and seeds the new observer exactly once.
 */
export function prepareRaymarchRuntime(
  runtimeState,
  featureFrame,
  renderer,
  { camera = null, scene = null } = {},
) {
  clearCymaticObserverBakeResult(runtimeState);
  if (
    !runtimeState ||
    !featureFrame?.modalDescriptor ||
    (!hasRenderAuthority(featureFrame) &&
      !hasPreparationAuthority(featureFrame))
  ) {
    return {
      prepared: false,
      seeded: false,
      reason: "authoritative-frame-unavailable",
    };
  }

  const preparationFrame = {
    ...featureFrame,
    observationAdvancing: false,
    observationPaused: true,
  };
  const frameKey = buildRaymarchPreparationFrameKey(
    runtimeState,
    preparationFrame,
  );
  const seeded = runtimeState.preparedObserverFrameKey !== frameKey;

  if (seeded) {
    applyRaymarchRuntimeFrame(
      runtimeState,
      preparationFrame,
      preparationFrame.observationTimeSeconds ?? 0,
      0,
      renderer,
      true,
    );
    runtimeState.preparedObserverFrameKey = frameKey;
  }

  requestRaymarchMaterialCompilation(runtimeState, renderer, {
    camera,
    scene,
  });

  runtimeState.volumeMesh.visible = false;
  runtimeState.idleOverlay.visible = resolveIdleOverlayVisible(
    runtimeState,
    preparationFrame,
    false,
  );
  publishRaymarchRuntimeAuditSnapshot(
    runtimeState,
    preparationFrame,
    "idle",
    false,
  );

  return {
    prepared: true,
    seeded,
    frameKey,
    materialReady:
      runtimeState.preparedMaterialCompileKey ===
      buildRaymarchPreparationCompileKey(runtimeState),
    materialPending: Boolean(runtimeState.pendingMaterialCompilePromise),
    materialError: runtimeState.materialPreparationError ?? null,
  };
}

export function disposeRaymarchRuntime(runtimeState) {
  runtimeState?.fieldCache?.dispose?.();
  runtimeState?.plasmaProfileLookup?.dispose?.();
  [
    runtimeState?.modalFieldModeBuffer,
    runtimeState?.modalFieldSpectralMomentBuffer,
    runtimeState?.modalFieldCoefficientBuffer,
    runtimeState?.modalFieldResponseBuffer,
  ].forEach((buffer) => buffer?.dispose?.());
  runtimeState?.points?.traverse?.((child) => {
    child.geometry?.dispose?.();
    // One material per volume shape. This used to be nested one level deeper,
    // keyed by boundary family as well, and walking it as if it still were
    // reaches the materials' own properties instead of the materials.
    const materialCache = child.userData?.raymarchMaterialCache;
    if (materialCache) {
      Object.values(materialCache).forEach((material) => {
        material?.dispose?.();
      });
    } else {
      child.material?.dispose?.();
    }
    if (child.isLight && child.shadow?.map) {
      child.shadow.map.dispose?.();
    }
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
