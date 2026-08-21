import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import {
  createRaymarchSceneRoot,
  prepareRaymarchRuntime,
  tickRaymarchRuntime as tickRaymarchRuntimeBase,
} from "./runtime.js";
import { buildCanonicalFullModalDescriptor } from "../modalDescriptor.js";
import { MODAL_SEMANTIC_DESCRIPTOR_CAPACITY } from "../modalBudgets.js";
import { STRUCTURAL_PROJECTION_REFERENCE_ENERGY } from "./fieldObservation.js";
import { CYMATIC_OBSERVER_REFERENCE } from "./cymaticObserverReference.js";
import { SPECTRAL_PHASE_FIELD_REFERENCE } from "./spectralPhaseFieldReference.js";
import {
  CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_EMISSION_COEFFICIENT,
  CYMATIC_PLASMA_EXTINCTION_COEFFICIENT,
  CYMATIC_PLASMA_RADIANCE_GAIN,
} from "./cymaticPlasmaTransfer.js";
import { deriveModalFieldCacheTransferAmplitude } from "./fieldCachePassband.js";
import {
  RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
  RAYMARCH_QUANTITY_LEDGER_VERSION,
  RAYMARCH_RENDER_QUANTITY_LANES,
  RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
} from "./quantityLedger.js";
import { auditRaymarchSourceSurface } from "./quantityLedgerAudit.js";
import {
  deriveLowStepBloomGuard,
  deriveStepCompensation,
  STEP_REFERENCE,
} from "./stepStability.js";
import { RAYMARCH_DEFAULTS } from "../../defaults.js";

const RUNTIME_SOURCE = readFileSync(
  new URL("./runtime.js", import.meta.url),
  "utf8",
);
const RUNTIME_DIAGNOSTICS_SOURCE = readFileSync(
  new URL("./runtimeDiagnostics.js", import.meta.url),
  "utf8",
);
const RUNTIME_REACTIVE_RESPONSE_SOURCE = readFileSync(
  new URL("./runtimeReactiveResponse.js", import.meta.url),
  "utf8",
);
const RUNTIME_UNIFORM_PROJECTION_SOURCE = readFileSync(
  new URL("./runtimeUniformProjection.js", import.meta.url),
  "utf8",
);
const RUNTIME_MODAL_UPLOAD_SOURCE = readFileSync(
  new URL("./runtimeModalUpload.js", import.meta.url),
  "utf8",
);

function createRuntimeState() {
  return {
    modalFieldCapacity: 16,
    modalFieldModeBuffer: {
      value: {
        array: new Float32Array(64),
        needsUpdate: false,
      },
    },
    modalFieldResponseBuffer: {
      value: {
        array: new Float32Array(64),
        needsUpdate: false,
      },
    },
    modalFieldSpectralMomentBuffer: {
      value: {
        array: new Float32Array(64),
        needsUpdate: false,
      },
    },
    modalFieldMetadataBuffer: {
      value: {
        array: new Float32Array(64),
        needsUpdate: false,
      },
    },
    modalFieldCoefficientBuffer: {
      value: {
        array: new Float32Array(64),
        needsUpdate: false,
      },
    },
    backboneModeBuffer: {
      value: {
        array: new Float32Array(32),
        needsUpdate: false,
      },
    },
    detailModeBuffer: {
      value: {
        array: new Float32Array(32),
        needsUpdate: false,
      },
    },
    backbonePhaseBuffer: {
      value: {
        array: new Float32Array(8),
        needsUpdate: false,
      },
    },
    detailPhaseBuffer: {
      value: {
        array: new Float32Array(24),
        needsUpdate: false,
      },
    },
    uniforms: {
      uTime: { value: 0 },
      uFieldState: { value: 0 },
      uRadius: { value: 3 },
      uModalFieldModeCount: { value: 0 },
      uBackboneModeCount: { value: 0 },
      uDetailModeCount: { value: 0 },
      uAverageAmplitude: { value: 0 },
      uBoundaryMode: { value: 1 },
      uTransientEnergy: { value: 0 },
      uSpectralCentroid: { value: 0 },
      uSpectralFlux: { value: 0 },
      uSpectralPresentationEnabled: { value: 1 },
      uBandEnergies: { value: new THREE.Vector4() },
      uDensityGain: { value: 2.8 },
      uCausticStrength: { value: 0.45 },
      uLaserFocus: { value: 3.2 },
      uStructureSignal: { value: 0 },
      uEnergySignal: { value: 0 },
      uChangeSignal: { value: 0 },
      uBassSalience: { value: 0 },
      uTimbreSpread: { value: 0 },
      uSpectralNovelty: { value: 0 },
      uBeatPulse: { value: 0 },
      uBeatPhase: { value: 0 },
      uTempoNorm: { value: 0 },
      uRhythmicDensity: { value: 0 },
      uTrebleBroadbandEnergy: { value: 0 },
      uModeCoherence: { value: 0 },
      uTotalSlotAmplitude: { value: 0 },
      uModalResponseEnergy: { value: 0 },
    },
    visualRoot: {
      scale: {
        x: 1,
        setScalar(value) {
          this.x = value;
        },
      },
    },
    reactivityTuning: {
      motionAmount: 1,
    },
    cymaticObserverTuning: {
      geometryExposureSeconds:
        CYMATIC_OBSERVER_REFERENCE.geometryExposureSeconds,
    },
    bloomTuning: {
      stepReference: STEP_REFERENCE,
      stepCompensation: deriveStepCompensation(64),
      lowStepBloomGuard: deriveLowStepBloomGuard(64),
      effectiveStrength: 0.11,
      effectiveRadius: 0.09,
      effectiveThreshold: 0.44,
    },
    baseDensityGain: 2.8,
    responseEnvelope: 0,
    accentEnvelope: 0,
    beatPulseEnvelope: 0,
    shaderBeatPhase: null,
    motionSignal: 0,
    scaleSignal: 0,
    bloomResponseSignal: 0,
    volumeMesh: {
      visible: false,
      material: {
        steps: 64,
      },
      userData: {
        raymarchBoundaryMode: "neumann",
        raymarchVolumeShape: "sphere",
        raymarchCavityGeometry: "rectangular",
      },
    },
    idleOverlay: {
      visible: true,
    },
    fieldStateValues: {
      idle: 0,
      active: 1,
      decay: 2,
      test: 3,
    },
    stabilityStats: {
      avgRaySegmentLength: 1.2,
      missRatio: 0.15,
    },
    auditEnabled: true,
    requestedCavityGeometry: "rectangular",
    effectiveCavityGeometry: "rectangular",
    debugSnapshot: null,
  };
}

function attachObserverFieldCache(runtimeState) {
  const observerState = {
    hasHistory: false,
    stepIndex: null,
  };
  const fieldCache = {
    bake: vi.fn((_renderer, options) => {
      observerState.hasHistory = true;
      observerState.stepIndex = Math.floor(
        (options?.observationTimeSeconds ?? 0) * 60,
      );
      return {
        baked: options?.observationAdvancing === true,
        reset: fieldCache.bake.mock.calls.length === 1,
        advanced: fieldCache.bake.mock.calls.length > 1,
        stepIndex: observerState.stepIndex,
      };
    }),
    getObserverState: vi.fn(() => ({ ...observerState })),
  };
  runtimeState.fieldCache = fieldCache;
  return fieldCache;
}

async function flushMicrotasks(count = 3) {
  for (let i = 0; i < count; i += 1) {
    await Promise.resolve();
  }
}

function expectSourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function countActiveSlots(slots) {
  let count = 0;
  for (let offset = 3; offset < (slots?.length ?? 0); offset += 4) {
    if ((slots[offset] ?? 0) > 0) count += 1;
  }
  return count;
}

function appendMetadataSlots({
  targetSlots,
  targetPhaseSlots,
  targetSpectralMomentSlots,
  targetMetadataSlots,
  sourceSlots,
  sourcePhaseSlots,
  sourceSpectralMomentSlots,
  writeIndex,
}) {
  let written = writeIndex;
  for (let offset = 0; offset < (sourceSlots?.length ?? 0); offset += 4) {
    if (!((sourceSlots[offset + 3] ?? 0) > 0)) continue;
    const targetOffset = written * 4;
    targetSlots.set(sourceSlots.slice(offset, offset + 4), targetOffset);
    targetPhaseSlots.set(
      sourcePhaseSlots?.slice(offset, offset + 4) ?? new Float32Array(4),
      targetOffset,
    );
    targetSpectralMomentSlots.set(
      sourceSpectralMomentSlots?.slice(offset, offset + 4) ?? new Float32Array(4),
      targetOffset,
    );
    const u = sourceSlots[offset] ?? 0;
    const v = sourceSlots[offset + 1] ?? 0;
    const w = sourceSlots[offset + 2] ?? 0;
    const coefficient = sourceSlots[offset + 3] ?? 0;
    const qualityFactor = 4 + Math.hypot(u, v, w) * 0.2;
    targetMetadataSlots[targetOffset] = (u + v + w) * 32;
    targetMetadataSlots[targetOffset + 1] = qualityFactor;
    targetMetadataSlots[targetOffset + 2] = 1 / (2 * qualityFactor);
    targetMetadataSlots[targetOffset + 3] = coefficient;
    written += 1;
  }
  return written;
}

const AUTO_PRODUCER_DESCRIPTOR_FRAME = Symbol(
  "auto-producer-modal-descriptor-frame",
);
let nextAutoRendererFrameId = 1;
let nextAutoRendererTopologyRevision = 1;

function splitRendererModalSlots(modalFieldSlots) {
  const activeModeCount = Math.floor((modalFieldSlots?.length ?? 0) / 4);
  const modalIdentitySlots = new Float32Array(activeModeCount * 3);
  const modalCoefficientSlots = new Float32Array(activeModeCount);
  for (let index = 0; index < activeModeCount; index += 1) {
    const sourceOffset = index * 4;
    const identityOffset = index * 3;
    modalIdentitySlots[identityOffset] = modalFieldSlots[sourceOffset] ?? 0;
    modalIdentitySlots[identityOffset + 1] =
      modalFieldSlots[sourceOffset + 1] ?? 0;
    modalIdentitySlots[identityOffset + 2] =
      modalFieldSlots[sourceOffset + 2] ?? 0;
    modalCoefficientSlots[index] = modalFieldSlots[sourceOffset + 3] ?? 0;
  }
  return { modalIdentitySlots, modalCoefficientSlots };
}

function toRendererModalDescriptor(descriptor) {
  const slotViews = descriptor?.slotViews;
  if (!slotViews?.modalFieldSlots) return descriptor;
  const { modalFieldSlots, ...staticSlotViews } = slotViews;
  const modeCount = Math.max(
    0,
    Math.floor(descriptor?.counts?.modalFieldModeCount ?? 0),
  );
  const slotLength = modeCount * 4;
  const splitSlots = splitRendererModalSlots(
    modalFieldSlots.subarray(0, slotLength),
  );
  return {
    ...descriptor,
    slotViews: {
      ...staticSlotViews,
      modalFieldPhaseSlots: staticSlotViews.modalFieldPhaseSlots.subarray(
        0,
        slotLength,
      ),
      modalFieldSpectralMomentSlots:
        staticSlotViews.modalFieldSpectralMomentSlots.subarray(0, slotLength),
      modalFieldMetadataSlots: staticSlotViews.modalFieldMetadataSlots.subarray(
        0,
        slotLength,
      ),
      ...splitSlots,
    },
  };
}

function withProducerModalDescriptor(frame) {
  if (!frame || frame[AUTO_PRODUCER_DESCRIPTOR_FRAME] === true) return frame;
  if (!frame.modalDescriptor && !frame.modalFieldSlots) return frame;

  const activeModeCount = Math.max(1, (frame.modalFieldSlots?.length ?? 0) / 4);
  const producerDescriptor =
    frame.modalDescriptor ??
    buildCanonicalFullModalDescriptor({
      maxTotalModes: frame.modalDescriptorCapacity ?? activeModeCount,
      modalFieldSlots: frame.modalFieldSlots,
      modalFieldPhaseSlots: frame.modalFieldPhaseSlots,
      modalFieldSpectralMomentSlots: frame.modalFieldSpectralMomentSlots,
      modalFieldMetadataSlots: frame.modalFieldMetadataSlots,
      activeModalFieldModeCount:
        frame.activeModalFieldModeCount ?? frame.activeModeCount,
    });
  const rendererDescriptor = toRendererModalDescriptor(producerDescriptor);
  const rendererSlots = rendererDescriptor?.slotViews ?? {};
  frame.modalDescriptor = rendererDescriptor;
  frame.modalIdentitySlots = rendererSlots.modalIdentitySlots;
  frame.modalCoefficientSlots = rendererSlots.modalCoefficientSlots;
  frame.modalFieldPhaseSlots = rendererSlots.modalFieldPhaseSlots;
  frame.modalFieldSpectralMomentSlots = rendererSlots.modalFieldSpectralMomentSlots;
  frame.modalFieldMetadataSlots = rendererSlots.modalFieldMetadataSlots;
  delete frame.modalFieldSlots;
  frame.frameId ??= nextAutoRendererFrameId++;
  frame.sourceGeneration ??= 1;
  frame.workerGeneration ??= 1;
  frame.topologyRevision ??= nextAutoRendererTopologyRevision++;
  frame.activeModeCount = rendererDescriptor?.counts?.modalFieldModeCount ?? 0;
  frame.activeModalFieldModeCount = frame.activeModeCount;
  frame.basisIdentityHash ??= `runtime-test-basis:${frame.topologyRevision}`;
  frame[AUTO_PRODUCER_DESCRIPTOR_FRAME] = true;
  return frame;
}

function withUnifiedModalFields(frame) {
  if (!frame) return frame;
  if (frame[AUTO_PRODUCER_DESCRIPTOR_FRAME] === true) return frame;
  if (frame.renderAuthority === true && !frame.energyLedger) {
    frame.energyLedger = {
      projectedRenderEnergy: Math.max(
        frame.modalResponseRenderEnergy ?? 0,
        frame.modalResponseEnergy ?? 0,
        0.2,
      ),
      renderEnergyEpsilon: 1e-6,
    };
  }
  if (frame.modalFieldSlots && !frame.backboneSlots && !frame.detailSlots) {
    return withProducerModalDescriptor(frame);
  }
  const activeBackboneModeCount =
    frame.activeBackboneModeCount ?? countActiveSlots(frame.backboneSlots);
  const activeDetailModeCount =
    frame.activeDetailModeCount ?? countActiveSlots(frame.detailSlots);
  const candidateCount = activeBackboneModeCount + activeDetailModeCount;
  const modalFieldSlots = new Float32Array(candidateCount * 4);
  const modalFieldPhaseSlots = new Float32Array(candidateCount * 4);
  const modalFieldSpectralMomentSlots = new Float32Array(candidateCount * 4);
  const modalFieldMetadataSlots = new Float32Array(candidateCount * 4);
  let writeIndex = appendMetadataSlots({
    targetSlots: modalFieldSlots,
    targetPhaseSlots: modalFieldPhaseSlots,
    targetSpectralMomentSlots: modalFieldSpectralMomentSlots,
    targetMetadataSlots: modalFieldMetadataSlots,
    sourceSlots: frame.backboneSlots,
    sourcePhaseSlots: frame.backbonePhaseSlots,
    sourceSpectralMomentSlots: frame.backboneSpectralMomentSlots,
    writeIndex: 0,
  });
  writeIndex = appendMetadataSlots({
    targetSlots: modalFieldSlots,
    targetPhaseSlots: modalFieldPhaseSlots,
    targetSpectralMomentSlots: modalFieldSpectralMomentSlots,
    targetMetadataSlots: modalFieldMetadataSlots,
    sourceSlots: frame.detailSlots,
    sourcePhaseSlots: frame.detailPhaseSlots,
    sourceSpectralMomentSlots: frame.detailSpectralMomentSlots,
    writeIndex,
  });
  frame.activeBackboneModeCount = activeBackboneModeCount;
  frame.activeDetailModeCount = activeDetailModeCount;
  frame.activeModeCount = frame.activeModeCount ?? writeIndex;
  frame.modalResponseEnergy = Math.max(
    frame.modalResponseEnergy ?? 0,
    frame.modalResponseRenderEnergy ?? 0,
    frame.debug?.modalResponseEnergy ?? 0,
    frame.modalResponseRenderSourceCoupledEnergy ?? 0,
    frame.modalResponseRenderResonantEnergy ?? 0,
  );
  frame.modalFieldSlots = modalFieldSlots;
  frame.modalFieldPhaseSlots = modalFieldPhaseSlots;
  frame.modalFieldSpectralMomentSlots = modalFieldSpectralMomentSlots;
  frame.modalFieldMetadataSlots = modalFieldMetadataSlots;
  return withProducerModalDescriptor(frame);
}

function withDefaultTextureCopy(renderer) {
  if (
    renderer &&
    typeof renderer.computeAsync === "function" &&
    !Object.prototype.hasOwnProperty.call(renderer, "copyTextureToTexture")
  ) {
    renderer.copyTextureToTexture = vi.fn();
  }
  return renderer;
}

function tickRaymarchRuntime(runtimeState, featureFrame, ...args) {
  if (args.length >= 3) {
    args[2] = withDefaultTextureCopy(args[2]);
  }
  return tickRaymarchRuntimeBase(
    runtimeState,
    withUnifiedModalFields(featureFrame),
    ...args,
  );
}

function createActiveFeatureFrame(overrides = {}) {
  return withUnifiedModalFields({
    fieldState: "active",
    renderAuthority: true,
    averageAmplitude: 48,
    backboneSlots: new Float32Array([3, 4, 6, 0.8]),
    detailSlots: new Float32Array([4, 5, 5, 0.55]),
    backboneSpectralMomentSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
    detailSpectralMomentSlots: new Float32Array([0.2, 0.5, 1, 0.5]),
    modalFieldSpectralSeedDirection: new Float32Array([1, 0]),
    backbonePhaseSlots: new Float32Array([0.1, 0.2, 0.8, 0.9]),
    detailPhaseSlots: new Float32Array([0.3, 0.4, 0.8, 0.7]),
    bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
    transientEnergy: 0.7,
    spectralCentroid: 0.42,
    spectralFlux: 0.28,
    structureSignal: 0.74,
    energySignal: 0.68,
    changeSignal: 0.61,
    pulseSignal: 0.32,
    ...overrides,
  });
}

function makeModeSlots(count, amplitudeAt = () => 0.25, uOffset = 0) {
  const slots = new Float32Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    slots[offset] = (index % 5) + 1 + uOffset;
    slots[offset + 1] = ((index + 1) % 7) + 1;
    slots[offset + 2] = ((index + 2) % 9) + 1;
    slots[offset + 3] = amplitudeAt(index);
  }
  return slots;
}

function makeSpectralMomentSlots(count) {
  const slots = new Float32Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    slots[offset] = 0.2 + index * 0.01;
    slots[offset + 1] = 0.4;
    slots[offset + 2] = 0.7;
    slots[offset + 3] = 0.8;
  }
  return slots;
}

function makePhaseSlots(count) {
  const slots = new Float32Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    slots[offset] = index * 0.05;
    slots[offset + 1] = 0.2 + index * 0.01;
    slots[offset + 2] = 0.9;
    slots[offset + 3] = 0.8;
  }
  return slots;
}

describe("tickRaymarchRuntime", () => {
  it("clears the previous observer bake result when the current tick does not bake", () => {
    const runtimeState = createRuntimeState();
    const fieldCache = attachObserverFieldCache(runtimeState);
    runtimeState.cymaticObserverBakeResult = {
      baked: true,
      advanced: true,
      stepCount: 2,
    };

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        fieldState: "idle",
        renderAuthority: false,
      }),
      1,
      1 / 60,
    );

    expect(fieldCache.bake).not.toHaveBeenCalled();
    expect(runtimeState.cymaticObserverBakeResult).toBeNull();
  });

  it("prepares one idle observer seed without letting render ticks advance it", async () => {
    const runtimeState = createRuntimeState();
    const fieldCache = attachObserverFieldCache(runtimeState);
    const compileTarget = {
      visible: false,
      frustumCulled: true,
    };
    runtimeState.volumeMesh.clone = vi.fn(() => compileTarget);
    const renderer = {
      compileAsync: vi.fn(() => Promise.resolve()),
    };
    const scene = {};
    const camera = {};
    const frame = createActiveFeatureFrame({
      renderAuthority: false,
      energyLedger: {
        projectedRenderEnergy: 0.2,
        renderEnergyEpsilon: 1e-6,
      },
      sourceEvidence: {
        sourceKind: "file",
        sourceBoundaryState: "prepared",
        currentSourceEvidence: false,
        transport: {
          playing: false,
          preparationOnly: true,
        },
      },
      observationSessionKey: "file:prepared-demo",
      observationTimeSeconds: 0,
      observationAdvancing: false,
      observationPaused: false,
      topologyRevision: 4,
      basisIdentityHash: "basis-a",
    });

    tickRaymarchRuntime(runtimeState, frame, 0, 0, renderer);
    expect(fieldCache.bake).not.toHaveBeenCalled();
    expect(runtimeState.volumeMesh.visible).toBe(false);

    const first = prepareRaymarchRuntime(runtimeState, frame, renderer, {
      scene,
      camera,
    });
    const second = prepareRaymarchRuntime(runtimeState, frame, renderer, {
      scene,
      camera,
    });

    expect(first).toMatchObject({
      prepared: true,
      seeded: true,
      materialPending: true,
    });
    expect(second).toMatchObject({
      prepared: true,
      seeded: false,
    });
    expect(fieldCache.bake).toHaveBeenCalledTimes(1);
    expect(runtimeState.cymaticObserverBakeResult).toBeNull();
    expect(fieldCache.bake.mock.calls[0][1]).toMatchObject({
      observationTimeSeconds: 0,
      observationAdvancing: false,
      modalFieldSpectralSeedDirection: new Float32Array([1, 0]),
    });
    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.idleOverlay.visible).toBe(true);
    expect(renderer.compileAsync).toHaveBeenCalledTimes(1);
    expect(renderer.compileAsync).toHaveBeenCalledWith(
      compileTarget,
      camera,
      scene,
    );
    expect(compileTarget).toMatchObject({
      visible: true,
      frustumCulled: false,
    });

    await flushMicrotasks();
    const third = prepareRaymarchRuntime(runtimeState, frame, renderer, {
      scene,
      camera,
    });
    expect(third).toMatchObject({
      seeded: false,
      materialReady: true,
      materialPending: false,
    });
    expect(fieldCache.bake).toHaveBeenCalledTimes(1);
    expect(renderer.compileAsync).toHaveBeenCalledTimes(1);
  });

  it("keeps material density and observation exposure independent of reactive scale", () => {
    const quietRuntime = createRuntimeState();
    const reactiveRuntime = createRuntimeState();
    const quietFrame = createActiveFeatureFrame({
      backboneSlots: new Float32Array([1, 1, 1, 0.5]),
      detailSlots: new Float32Array([2, 1, 1, 0.5]),
      averageAmplitude: 2,
      spectralCentroid: 0.08,
      structureSignal: 0,
      energySignal: 0,
      changeSignal: 0,
      pulseSignal: 0,
    });
    const reactiveFrame = createActiveFeatureFrame({
      backboneSlots: new Float32Array([8, 8, 8, 0.5]),
      detailSlots: new Float32Array([7, 8, 8, 0.5]),
      averageAmplitude: 96,
      spectralCentroid: 0.92,
      structureSignal: 1,
      energySignal: 1,
      changeSignal: 1,
      pulseSignal: 1,
    });

    tickRaymarchRuntime(quietRuntime, quietFrame, 1, 1 / 60);
    tickRaymarchRuntime(reactiveRuntime, reactiveFrame, 1, 1 / 60);

    expect(reactiveRuntime.scaleSignal).toBeGreaterThan(
      quietRuntime.scaleSignal,
    );
    expect(reactiveRuntime.uniforms.uDensityGain.value).toBeCloseTo(
      quietRuntime.uniforms.uDensityGain.value,
    );
    const quietDebug =
      quietRuntime.debugSnapshot.raymarchDebug ?? quietRuntime.debugSnapshot;
    const reactiveDebug =
      reactiveRuntime.debugSnapshot.raymarchDebug ??
      reactiveRuntime.debugSnapshot;
    expect(reactiveDebug.observerGeometryExposureSeconds).toBe(
      CYMATIC_OBSERVER_REFERENCE.geometryExposureSeconds,
    );
    expect(reactiveDebug.observerRadianceExposureSeconds).toBe(
      CYMATIC_OBSERVER_REFERENCE.radianceExposureSeconds,
    );
    expect(reactiveDebug.observerSpectralExposureSeconds).toBe(
      SPECTRAL_PHASE_FIELD_REFERENCE.spectralExposureSeconds,
    );
    expect(reactiveDebug.observerSheetFwhmWorld).toBe(
      quietDebug.observerSheetFwhmWorld,
    );
    expect(reactiveRuntime.uniforms).not.toHaveProperty(
      "uModalEnergyAmplitude",
    );
  });

  it("has no audio-owned density or observation-exposure modulation path", () => {
    const presentationSources = `${RUNTIME_SOURCE}\n${RUNTIME_REACTIVE_RESPONSE_SOURCE}\n${RUNTIME_UNIFORM_PROJECTION_SOURCE}`;

    expect(presentationSources).not.toContain("DENSITY_RESPONSE_AMOUNT");
    expect(presentationSources).not.toContain("visibilityDriveEnvelope");
    expect(presentationSources).not.toContain(
      "deriveRuntimeObservationVisibilityDrive",
    );
  });

  it("never reconstructs producer-owned modal descriptor semantics", () => {
    expect(RUNTIME_SOURCE).not.toContain("buildCanonicalFullModalDescriptor");
    expect(RUNTIME_SOURCE).not.toContain("buildRuntimeModalDescriptor");
    expect(RUNTIME_SOURCE).not.toContain("rendererFeatureModalSlots");
    expect(RUNTIME_SOURCE).not.toContain("rendererFeatureTopologyRevision");
  });

  it("does not own envelope-derived display radiance limiting", () => {
    const presentationSources = `${RUNTIME_SOURCE}\n${RUNTIME_REACTIVE_RESPONSE_SOURCE}\n${RUNTIME_UNIFORM_PROJECTION_SOURCE}`;

    expect(presentationSources).not.toContain("compressDisplayRadiance");
    expect(presentationSources).not.toContain("deriveBloomRadianceScale");
    expect(presentationSources).not.toContain("DISPLAY_RADIANCE_DEFAULTS");
    expect(presentationSources).not.toMatch(
      /display(?:Bloom|Highlight|Radiance).*(?:responseEnvelope|accentEnvelope|bloomResponseSignal)/s,
    );
  });

  it("uses the executable ledger audit for the runtime plasma probe", () => {
    expect(
      auditRaymarchSourceSurface(
        "runtimePlasmaProbe",
        RUNTIME_DIAGNOSTICS_SOURCE,
      ),
    ).toBe(true);
  });

  it("keeps the runtime probe on the canonical emission-extinction transfer", () => {
    const materialProbeBlock = expectSourceBlock(
      RUNTIME_DIAGNOSTICS_SOURCE,
      "function buildPlasmaProbe",
      "function buildDebugSnapshot",
    );

    expect(materialProbeBlock).toContain("deriveCymaticPlasmaCarrier({");
    expect(materialProbeBlock).toContain("deriveCymaticPlasmaTransfer({");
    expect(materialProbeBlock).toContain("localRadiance,");
    expect(materialProbeBlock).toContain(
      "continuitySpineDensity: carrier.continuitySpineDensity",
    );
    expect(materialProbeBlock).toContain(
      "detailSpineDensity: carrier.detailSpineDensity",
    );
    expect(materialProbeBlock).toContain("coreDensity: carrier.coreDensity");
    expect(materialProbeBlock).toContain(
      "sheathDensity: carrier.sheathDensity",
    );
    expect(materialProbeBlock).toContain(
      "Math.max(0, runtimeState.uniforms.uDensityGain?.value ?? 0) /",
    );
    expect(materialProbeBlock).toContain("normalDotRay: 1");
    expect(materialProbeBlock).toContain("audioAccentGain: 0");
    expect(materialProbeBlock).not.toContain("deriveObservationTransfer");
    expect(materialProbeBlock).not.toContain("trapWeighted");
    expect(materialProbeBlock).not.toContain("densityFloor");
  });

  it("classifies material output from physical transfer quantities", () => {
    const visibilityGateBlock = expectSourceBlock(
      RUNTIME_DIAGNOSTICS_SOURCE,
      "function deriveVisibilityGate({",
      "function buildPlasmaProbe",
    );
    const materialOutputBlock = expectSourceBlock(
      visibilityGateBlock,
      "const materialOutputVisible =",
      "if (!renderAuthority) {",
    );

    expect(materialOutputBlock).toContain("extinction");
    expect(materialOutputBlock).toContain("preBloomRadiance");
    expect(materialOutputBlock).toContain("postBloomRisk");
    expect(materialOutputBlock).not.toContain("structuralProjection");
  });

  it("keeps diagnostic structural-body metrics out of material-control ownership", () => {
    const materialControlsBlock = expectSourceBlock(
      RUNTIME_UNIFORM_PROJECTION_SOURCE,
      "function syncRaymarchMaterialUniforms",
      "function syncBaseDensityUniform",
    );

    expect(materialControlsBlock).not.toMatch(
      /modalStructuralDetailAuthority|structuralBodyBloomSuppression/,
    );
    expect(RUNTIME_DIAGNOSTICS_SOURCE).not.toMatch(
      /modalStructuralDetailAuthority|structuralBodyBloomSuppression/,
    );
  });

  it("keeps plasma sheet widths out of runtime audiovisual reactivity", () => {
    const presentationSources = `${RUNTIME_SOURCE}\n${RUNTIME_REACTIVE_RESPONSE_SOURCE}\n${RUNTIME_UNIFORM_PROJECTION_SOURCE}`;

    expect(presentationSources).not.toContain("spineWidthRatio");
    expect(presentationSources).not.toContain("coreWidthRatio");
    expect(presentationSources).not.toContain("sheathWidthRatio");
    expect(presentationSources).not.toContain("uCarrierCoreFwhmWorld");
  });

  it("builds direct runtime uploads from one modal field signature", () => {
    expect(RUNTIME_SOURCE).toContain("modalFieldModeBuffer");
    expect(RUNTIME_SOURCE).not.toContain("modalFieldPhaseBuffer");
    expect(RUNTIME_MODAL_UPLOAD_SOURCE).toContain(
      "applyRaymarchModalPacketUploads({",
    );
    expect(RUNTIME_UNIFORM_PROJECTION_SOURCE).toContain(
      "uniforms.uModalFieldModeCount",
    );
    expect(RUNTIME_SOURCE).not.toContain("backboneSignature");
    expect(RUNTIME_SOURCE).not.toContain("detailSignature");
    expect(RUNTIME_SOURCE).not.toContain("uBackboneModeCount");
    expect(RUNTIME_SOURCE).not.toContain("uDetailModeCount");
    expect(RUNTIME_SOURCE).not.toContain("DETAIL_LAYER_WEIGHT");
  });

  it("orders modal-potential uploads, uniform projection, diagnostics, and visibility explicitly", () => {
    const tickBlock = expectSourceBlock(
      RUNTIME_SOURCE,
      "function applyRaymarchRuntimeFrame",
      "export function tickRaymarchRuntime",
    );
    const uploadIndex = tickBlock.indexOf("applyRaymarchModalPacketUploads({");
    const uniformIndex = tickBlock.indexOf("syncRaymarchUniformProjection(");
    const visibilityIndex = tickBlock.lastIndexOf("volumeMesh.visible =");
    const diagnosticsIndex = tickBlock.lastIndexOf(
      "publishRaymarchRuntimeAuditSnapshot(",
    );

    expect(uploadIndex).toBeGreaterThanOrEqual(0);
    expect(tickBlock).not.toContain("updateRaymarchEvaluationModes(");
    expect(tickBlock).not.toContain("buildCurrentModalBasisCacheDescriptor({");
    expect(uploadIndex).toBeLessThan(uniformIndex);
    expect(uniformIndex).toBeLessThan(visibilityIndex);
    expect(visibilityIndex).toBeLessThan(diagnosticsIndex);
  });

  it("uploads every mode admitted by the canonical descriptor capacity", () => {
    const admittedPerLayer = 10;
    const admittedTotal = admittedPerLayer * 2;
    const runtimeState = createRuntimeState();
    runtimeState.modalFieldCapacity = admittedTotal;
    runtimeState.modalFieldModeBuffer.value.array = new Float32Array(
      admittedTotal * 4,
    );
    runtimeState.modalFieldResponseBuffer.value.array = new Float32Array(
      admittedTotal * 4,
    );
    runtimeState.modalFieldSpectralMomentBuffer.value.array = new Float32Array(
      admittedTotal * 4,
    );
    runtimeState.modalFieldCoefficientBuffer.value.array = new Float32Array(
      admittedTotal * 4,
    );
    const featureFrame = createActiveFeatureFrame({
      backboneSlots: makeModeSlots(admittedPerLayer, (index) =>
        index === 0 ? 1 : 0.08,
      ),
      detailSlots: makeModeSlots(
        admittedPerLayer,
        (index) => (index === 0 ? 0.9 : 0.06),
        admittedPerLayer,
      ),
      backboneSpectralMomentSlots: makeSpectralMomentSlots(admittedPerLayer),
      detailSpectralMomentSlots: makeSpectralMomentSlots(admittedPerLayer),
      backbonePhaseSlots: makePhaseSlots(admittedPerLayer),
      detailPhaseSlots: makePhaseSlots(admittedPerLayer),
      activeBackboneModeCount: admittedPerLayer,
      activeDetailModeCount: admittedPerLayer,
      activeModeCount: admittedTotal,
      modalPhaseAuthority: 1,
    });

    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);

    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(
      admittedTotal,
    );
    expect(runtimeState.currentModalDescriptor).toMatchObject({
      capacity: {
        maxTotalModes: admittedTotal,
      },
      counts: {
        validModeCount: admittedTotal,
        modalFieldModeCount: admittedTotal,
      },
      diagnostics: {
        descriptorOverflow: false,
      },
    });
    expect(
      runtimeState.raymarchFieldAnalysis.modalField.selectedIndices,
    ).toBeUndefined();
  });

  it("keeps direct analytic mode count owned by contributing modal terms", () => {
    const runtimeState = createRuntimeState();
    runtimeState.uniforms.uSpectralPresentationEnabled.value = 0;
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const featureFrame = createActiveFeatureFrame({
      backboneSlots: new Float32Array([1, 1, 1, 0.6, 2, 2, 2, 0.4]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array(8),
      detailPhaseSlots: new Float32Array(0),
      backboneSpectralMomentSlots: new Float32Array(8),
      detailSpectralMomentSlots: new Float32Array(0),
      activeBackboneModeCount: 2,
      activeDetailModeCount: 0,
      activeModeCount: 2,
      modalPhaseAuthority: 0,
    });

    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60, renderer);

    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(2);
    expect(
      runtimeState.debugSnapshot.modalDescriptorPhaseAuthorityModeCount,
    ).toBe(0);
    expect(
      (runtimeState.debugSnapshot.raymarchDebug ?? runtimeState.debugSnapshot)
        .modalFieldModeCount,
    ).toBe(2);
    expect(runtimeState.volumeMesh.visible).toBe(true);
    expect(renderer.computeAsync).not.toHaveBeenCalled();
    // An authoritative frame must resolve every diagnostic from a real source.
    // Anything listed here published its fallback because its producer was
    // missing, which reads downstream as a measurement of zero.
    expect(
      (runtimeState.debugSnapshot.raymarchDebug ?? runtimeState.debugSnapshot)
        .absentDiagnosticSources,
    ).toEqual([]);
  });

  it("publishes fixed observer calibration without diagnostic fallbacks", () => {
    const runtimeState = createRuntimeState();
    runtimeState.auditEnabled = true;
    const renderer = { computeAsync: vi.fn() };
    const featureFrame = createActiveFeatureFrame({
      backboneSlots: new Float32Array([1, 1, 1, 0.6, 2, 2, 2, 0.4]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array(8),
      detailPhaseSlots: new Float32Array(0),
      backboneSpectralMomentSlots: new Float32Array(8),
      detailSpectralMomentSlots: new Float32Array(0),
      activeBackboneModeCount: 2,
      activeDetailModeCount: 0,
      activeModeCount: 2,
      modalPhaseAuthority: 0,
    });
    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60, renderer);

    const snapshot =
      runtimeState.debugSnapshot.raymarchDebug ?? runtimeState.debugSnapshot;
    expect(snapshot.observerFineApertureFwhmWorld).toBe(
      CYMATIC_OBSERVER_REFERENCE.fineApertureFwhmWorld,
    );
    expect(snapshot.observerTopologyApertureFwhmWorld).toBe(
      CYMATIC_OBSERVER_REFERENCE.topologyApertureFwhmWorld,
    );
    expect(snapshot.observerFineResidualDetailLimit).toBe(
      CYMATIC_OBSERVER_REFERENCE.fineResidualDetailLimit,
    );
    expect(snapshot.observerSheetFwhmWorld).toBe(
      CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld,
    );
    expect(snapshot.plasmaRadianceGain).toBe(CYMATIC_PLASMA_RADIANCE_GAIN);
    expect(snapshot.plasmaContinuitySpineRadiancePerExtinctionLimit).toBe(
      CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
    );
    expect(snapshot.plasmaDetailSpineRadiancePerExtinctionLimit).toBe(
      CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
    );
    expect(snapshot.plasmaBodyRadiancePerExtinctionLimit).toBe(
      CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT,
    );
    expect(snapshot.absentDiagnosticSources).toEqual([]);
    expect(snapshot).not.toHaveProperty("effectiveContourSharpness");
  });

  it("publishes bounded topology when descriptor capacity overflows", () => {
    const runtimeState = createRuntimeState();
    runtimeState.modalFieldCapacity = 4;
    runtimeState.modalFieldModeBuffer.value.array = new Float32Array(16);
    runtimeState.modalFieldSpectralMomentBuffer.value.array = new Float32Array(16);
    runtimeState.uniforms.uTotalSlotAmplitude.value = 0.9;
    const featureFrame = createActiveFeatureFrame({
      backboneSlots: makeModeSlots(3, () => 0.4),
      detailSlots: makeModeSlots(3, () => 0.35, 10),
      backboneSpectralMomentSlots: makeSpectralMomentSlots(3),
      detailSpectralMomentSlots: makeSpectralMomentSlots(3),
      backbonePhaseSlots: makePhaseSlots(3),
      detailPhaseSlots: makePhaseSlots(3),
      activeBackboneModeCount: 3,
      activeDetailModeCount: 3,
      activeModeCount: 6,
      modalDescriptorCapacity: 4,
      modalPhaseAuthority: 1,
    });

    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);

    expect(
      runtimeState.currentModalDescriptor.diagnostics.descriptorOverflow,
    ).toBe(true);
    expect(runtimeState.currentModalDescriptor.fieldAuthority).toBe(
      "capacity-limited",
    );
    expect(runtimeState.debugSnapshot.modalDescriptorOverflow).toBe(true);
    expect(runtimeState.debugSnapshot.modalDescriptorFieldAuthority).toBe(
      "capacity-limited",
    );
    expect(runtimeState.currentModalDescriptor.counts.overflowModeCount).toBe(
      2,
    );
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(4);
    expect(runtimeState.uniforms.uTotalSlotAmplitude.value).toBeGreaterThan(0);
    expect(
      runtimeState.raymarchStructuralProjection.projectionEnergyDrive,
    ).toBeGreaterThan(0);
    expect(runtimeState.debugSnapshot.totalSlotAmplitude).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.structuralProjectionDrive,
    ).toBeGreaterThan(0);
    expect(runtimeState.debugSnapshot.opticalFieldRepresentation).toBe(
      RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
    );
  });

  it("fails closed on malformed descriptor authority", () => {
    const runtimeState = createRuntimeState();
    runtimeState.modalFieldCapacity = 8;
    runtimeState.modalFieldModeBuffer.value.array = makeModeSlots(2, () => 0.6);
    runtimeState.modalFieldSpectralMomentBuffer.value.array =
      makeSpectralMomentSlots(2);
    runtimeState.uniforms.uModalFieldModeCount.value = 2;
    runtimeState.uniforms.uTotalSlotAmplitude.value = 1.2;
    const sourceDescriptor = {
      ...buildCanonicalFullModalDescriptor({
        maxTotalModes: 8,
        directOpticalModeCapacity: 4,
        modalFieldSlots: makeModeSlots(2, () => 0.2),
        activeModalFieldModeCount: 2,
      }),
      fieldAuthority: "malformed",
    };
    const featureFrame = createActiveFeatureFrame({
      backboneSlots: makeModeSlots(2, () => 0.2),
      backboneSpectralMomentSlots: makeSpectralMomentSlots(2),
      backbonePhaseSlots: makePhaseSlots(2),
      detailSlots: new Float32Array(),
      detailSpectralMomentSlots: new Float32Array(),
      detailPhaseSlots: new Float32Array(),
      activeBackboneModeCount: 2,
      activeDetailModeCount: 0,
      activeModeCount: 2,
      modalDescriptor: sourceDescriptor,
    });

    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);

    expect(runtimeState.currentModalDescriptor).toBe(
      featureFrame.modalDescriptor,
    );
    expect(runtimeState.currentModalDescriptor).not.toBe(sourceDescriptor);
    expect(runtimeState.currentModalDescriptor.fieldAuthority).toBe(
      "malformed",
    );
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(0);
    expect(runtimeState.uniforms.uTotalSlotAmplitude.value).toBe(0);
    expect(runtimeState.raymarchStructuralProjection).toBeNull();
    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.debugSnapshot.modalDescriptorFieldAuthority).toBe(
      "malformed",
    );
    expect(runtimeState).not.toHaveProperty("currentModalBasisCacheDescriptor");
  });

  it("preserves capacity-limited descriptors when runtime capacity could represent them", () => {
    const runtimeState = createRuntimeState();
    runtimeState.modalFieldCapacity = 8;
    const sourceSlots = makeModeSlots(3, () => 0.35);
    const sourceDescriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      directOpticalModeCapacity: 4,
      modalFieldSlots: sourceSlots,
      activeModalFieldModeCount: 3,
    });
    expect(sourceDescriptor.fieldAuthority).toBe("capacity-limited");

    const featureFrame = createActiveFeatureFrame({
      backboneSlots: sourceSlots,
      backboneSpectralMomentSlots: makeSpectralMomentSlots(3),
      backbonePhaseSlots: makePhaseSlots(3),
      detailSlots: new Float32Array(),
      detailSpectralMomentSlots: new Float32Array(),
      detailPhaseSlots: new Float32Array(),
      activeBackboneModeCount: 3,
      activeDetailModeCount: 0,
      activeModeCount: 3,
      modalDescriptor: sourceDescriptor,
    });

    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);

    expect(runtimeState.currentModalDescriptor).toBe(
      featureFrame.modalDescriptor,
    );
    expect(runtimeState.currentModalDescriptor).not.toBe(sourceDescriptor);
    expect(runtimeState.currentModalDescriptor.fieldAuthority).toBe(
      "capacity-limited",
    );
    expect(
      runtimeState.currentModalDescriptor.diagnostics.descriptorOverflow,
    ).toBe(true);
    expect(runtimeState.currentModalDescriptor.counts.validModeCount).toBe(3);
    expect(runtimeState.currentModalDescriptor.counts.modalFieldModeCount).toBe(
      2,
    );
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(2);
    expect(runtimeState.volumeMesh.visible).toBe(true);
    expect(runtimeState).not.toHaveProperty("currentModalBasisCacheDescriptor");
  });

  it("creates a fixed symmetric optical lighting rig", () => {
    const volumeMesh = new THREE.Mesh();
    const idleOverlay = new THREE.LineSegments();
    const { root, visualRoot, cymaticRoot, sceneLighting } =
      createRaymarchSceneRoot({
        volumeMesh,
        idleOverlay,
        radius: 3,
      });

    expect(root.children).toContain(visualRoot);
    expect(visualRoot.children).toContain(cymaticRoot);
    expect(cymaticRoot.children).toContain(volumeMesh);
    expect(visualRoot.children).toContain(idleOverlay);
    expect(root.children.filter((child) => child.isLight)).toHaveLength(2);
    expect(sceneLighting.primary.color.getHex()).toBe(0xe6f7ff);
    expect(sceneLighting.secondary.color.getHex()).toBe(0xe6f7ff);
    expect(sceneLighting.primary.intensity).toBeCloseTo(1.25);
    expect(sceneLighting.secondary.intensity).toBeCloseTo(1.25);
    expect(sceneLighting.primary.position.x).toBeCloseTo(3 * 1.15);
    expect(sceneLighting.secondary.position.x).toBeCloseTo(-3 * 1.15);
    expect(sceneLighting.primary.position.y).toBeCloseTo(3 * 0.85);
    expect(sceneLighting.secondary.position.y).toBeCloseTo(3 * 0.85);
    expect(sceneLighting.primary.position.z).toBeCloseTo(3 * 1.8);
    expect(sceneLighting.secondary.position.z).toBeCloseTo(3 * 1.8);
  });

  it("writes split modal basis and drive state with modulation metrics", () => {
    const runtimeState = createRuntimeState();
    const featureFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 48,
      backboneSlots: new Float32Array([3, 4, 6, 0.8, 1, 3, 7, 0.6]),
      detailSlots: new Float32Array([4, 5, 5, 0.55, 2, 2, 6, 0.4]),
      backboneSpectralMomentSlots: new Float32Array([
        1, 0.1, 0.1, 0.9, 0.8, 0.2, 0.1, 0.7,
      ]),
      detailSpectralMomentSlots: new Float32Array([0.2, 0.5, 1, 0.5, 0.7, 0.2, 1, 0.45]),
      backbonePhaseSlots: new Float32Array([
        0.1, 0.2, 0.7, 0.5, -0.2, 0.1, 0.6, 0.4,
      ]),
      detailPhaseSlots: new Float32Array([
        0.4, 0.32, 0.8, 0.7, -0.6, -0.2, 0.74, 0.5,
      ]),
      bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
      transientEnergy: 0.7,
      spectralCentroid: 0.42,
      spectralFlux: 0.28,
      structureSignal: 0.74,
      energySignal: 0.68,
      changeSignal: 0.61,
      changeBreakdown: {
        flux: 0.12,
        hit: 0.14,
        slotDelta: 0.1,
        turnover: 0.08,
        timbre: 0.07,
        hint: 0.1,
      },
      pulseSignal: 0.32,
      modeCoherence: 0.58,
      modalPhaseAuthority: 0.42,
      trebleBroadbandEnergy: 0.18,
      trebleTonalEnergy: 0.24,
      beatDetected: true,
      beatPulseId: 3,
      beatStrength: 0.82,
      beatConfidence: 0.76,
      modalResponseRenderSourceCoupledEnergy: 0.37,
      modalResponseRenderResonantEnergy: 0.12,
      debug: {
        dominantFrequency: 440,
        projectionLoad: 0.72,
        projectionResonantProtection: 0.09,
        projectionRawEnergySourceCoupled: 0.68,
        projectionRawEnergyResonant: 0.57,
        projectionOverlapPressureSourceCoupled: 0.23,
        projectionOverlapPressureResonant: 0.41,
      },
    };

    tickRaymarchRuntime(runtimeState, featureFrame, 12.5, 1 / 60);

    expect(
      Array.from(
        runtimeState.modalFieldModeBuffer.value.array.slice(0, 16),
      ).map((value) => Number(value.toFixed(6))),
    ).toEqual([4, 5, 5, 1, 3, 4, 6, 1, 1, 3, 7, 1, 2, 2, 6, 1]);
    expect(
      runtimeState.radiationPotentialCoefficientFrame.normalizedEnergySum,
    ).toBeCloseTo(1, 6);
    expect(
      runtimeState.modalFieldSpectralMomentBuffer.value.array[2],
    ).toBeCloseTo(1);
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(4);
    expect(runtimeState.uniforms.uTransientEnergy.value).toBe(0.7);
    expect(runtimeState.uniforms.uSpectralCentroid.value).toBe(0.42);
    expect(runtimeState.uniforms.uSpectralFlux.value).toBe(0.28);
    expect(runtimeState.uniforms).not.toHaveProperty("uCarrierCoreFwhmWorld");
    expect(runtimeState.uniforms).not.toHaveProperty("uContourSharpness");
    expect(runtimeState.responseEnvelope).toBeGreaterThan(0);
    expect(runtimeState.scaleSignal).toBeGreaterThan(0);
    expect(runtimeState.bloomResponseSignal).toBeGreaterThan(0);
    expect(runtimeState.visualRoot.scale.x).toBe(1);
    expect(runtimeState.uniforms.uModeCoherence.value).toBeCloseTo(0.58);
    expect(runtimeState.uniforms.uModalResponseEnergy.value).toBeCloseTo(0.37);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observerGeometryExposureSeconds,
    ).toBe(CYMATIC_OBSERVER_REFERENCE.geometryExposureSeconds);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observerRadianceExposureSeconds,
    ).toBe(CYMATIC_OBSERVER_REFERENCE.radianceExposureSeconds);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observerSpectralExposureSeconds,
    ).toBe(SPECTRAL_PHASE_FIELD_REFERENCE.spectralExposureSeconds);
    expect(runtimeState.uniforms.uTrebleBroadbandEnergy.value).toBeCloseTo(
      0.18,
    );
    expect(runtimeState.uniforms.uTotalSlotAmplitude.value).toBeCloseTo(
      0.8 + 0.6 + 0.55 + 0.4,
    );
    const expectedStructuralEnergy =
      0.8 * 0.8 + 0.6 * 0.6 + 0.55 * 0.55 + 0.4 * 0.4;
    const expectedProjectionDrive =
      expectedStructuralEnergy /
      (expectedStructuralEnergy + STRUCTURAL_PROJECTION_REFERENCE_ENERGY);
    expect(
      runtimeState.raymarchStructuralProjection.projectionEnergyDrive,
    ).toBeCloseTo(expectedProjectionDrive);
    expect(
      runtimeState.raymarchStructuralProjection.structuralConcentration,
    ).toBeCloseTo(expectedStructuralEnergy / (2.35 * 2.35));
    const modalTerms = [
      { amplitude: 0.8, wavenumberSquared: 3 ** 2 + 4 ** 2 + 6 ** 2 },
      { amplitude: 0.6, wavenumberSquared: 1 ** 2 + 3 ** 2 + 7 ** 2 },
      { amplitude: 0.55, wavenumberSquared: 4 ** 2 + 5 ** 2 + 5 ** 2 },
      { amplitude: 0.4, wavenumberSquared: 2 ** 2 + 2 ** 2 + 6 ** 2 },
    ];
    const observedTerms = modalTerms.map((term) => {
      const transfer = deriveModalFieldCacheTransferAmplitude(
        Math.sqrt(term.wavenumberSquared),
      );
      return {
        ...term,
        energy: term.amplitude ** 2 * transfer ** 2,
      };
    });
    const expectedObservedEnergy = observedTerms.reduce(
      (sum, term) => sum + term.energy,
      0,
    );
    const expectedObservedRmsSpatialWavenumber = Math.sqrt(
      observedTerms.reduce(
        (sum, term) => sum + term.energy * term.wavenumberSquared,
        0,
      ) / expectedObservedEnergy,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observerSheetFwhmWorld,
    ).toBe(CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld);
    expect(runtimeState.uniforms).not.toHaveProperty(
      "uCarrierColumnDensityScale",
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .structuralProjectionObservedEnergy,
    ).toBeCloseTo(expectedObservedEnergy);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .structuralProjectionObservedRmsSpatialWavenumber,
    ).toBeCloseTo(expectedObservedRmsSpatialWavenumber);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .structuralProjectionResolvedObservationEnergyFraction,
    ).toBeCloseTo(expectedObservedEnergy / expectedStructuralEnergy);
    expect(runtimeState.uniforms).not.toHaveProperty(
      "uCarrierObservationBandwidthScale",
    );
    const [sub, lowMid, highMid, air] =
      runtimeState.uniforms.uBandEnergies.value.toArray();
    expect(sub).toBeCloseTo(0.4);
    expect(lowMid).toBeCloseTo(0.3);
    expect(highMid).toBeCloseTo(0.2);
    expect(air).toBeCloseTo(0.1);
    expect(runtimeState.volumeMesh.visible).toBe(true);
    expect(
      (runtimeState.debugSnapshot.raymarchDebug ?? runtimeState.debugSnapshot)
        .visibilityGateState,
    ).toBe("visible");
    expect(
      runtimeState.debugSnapshot.raymarchDebug.visibilityGateBlockedReason,
    ).toBeNull();
    expect(runtimeState.idleOverlay.visible).toBe(false);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.backboneModeCount,
    ).toBeUndefined();
    expect(
      runtimeState.debugSnapshot.raymarchDebug.detailModeCount,
    ).toBeUndefined();
    expect(runtimeState.debugSnapshot.raymarchDebug.modalFieldModeCount).toBe(
      4,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.renderedModalFieldModeCount,
    ).toBe(4);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .renderedModalFieldSpectralMomentRadiusMax,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.renderedModalFieldAmplitudeTotal,
    ).toBeCloseTo(2.35);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.structuralProjectionAmplitudeSum,
    ).toBeCloseTo(2.35);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.structuralProjectionEnergy,
    ).toBeCloseTo(expectedStructuralEnergy);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.structuralProjectionDrive,
    ).toBeCloseTo(expectedProjectionDrive);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .structuralProjectionConcentration,
    ).toBeCloseTo(expectedStructuralEnergy / (2.35 * 2.35));
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalDescriptorOverflow,
    ).toBe(false);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalDescriptorFieldAuthority,
    ).toBe("complete");
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalDescriptorValidModeCount,
    ).toBe(4);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.renderQuantityLedgerVersion,
    ).toBe(RAYMARCH_QUANTITY_LEDGER_VERSION);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.renderQuantityOwnershipLanes,
    ).toBe(RAYMARCH_RENDER_QUANTITY_LANES);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.renderQuantityForbiddenConsumers
        .observerAudioClock,
    ).toEqual(
      expect.arrayContaining([
        "renderFrameClock",
        "camera",
        "bloom",
        "performanceTier",
      ]),
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.renderQuantityForbiddenConsumers
        .performanceResolution,
    ).toEqual(
      expect.arrayContaining([
        "modalAdmission",
        "observerClock",
        "observerExposure",
        "plasmaCalibration",
      ]),
    );
    const materialProbe = runtimeState.debugSnapshot.raymarchDebug;
    expect(materialProbe.plasmaProbeFineDetailAuthority).toBe(1);
    expect(materialProbe.plasmaProbeSpineDensity).toBeGreaterThan(0);
    expect(materialProbe.plasmaProbeCoreDensity).toBeGreaterThan(0);
    expect(materialProbe.plasmaProbeSheathDensity).toBeGreaterThan(0);
    expect(materialProbe.plasmaProbeLocalRadiance).toBeCloseTo(
      expectedProjectionDrive,
    );
    expect(materialProbe.plasmaProbeMaterialDensityScale).toBeCloseTo(
      runtimeState.uniforms.uDensityGain.value / RAYMARCH_DEFAULTS.densityGain,
    );
    expect(materialProbe.plasmaProbeOrganizedDensity).toBeCloseTo(
      materialProbe.plasmaProbeOrganizedSpineDensity +
        materialProbe.plasmaProbeOrganizedCoreDensity +
        materialProbe.plasmaProbeOrganizedSheathDensity,
      8,
    );
    expect(materialProbe.plasmaExtinctionCoefficient).toBe(
      CYMATIC_PLASMA_EXTINCTION_COEFFICIENT,
    );
    expect(materialProbe.plasmaEmissionCoefficient).toBe(
      CYMATIC_PLASMA_EMISSION_COEFFICIENT,
    );
    expect(materialProbe.plasmaProbeEmissionSourceStrength).toBeCloseTo(
      materialProbe.plasmaProbeSpineEmissionSourceStrength +
        materialProbe.plasmaProbeCoreEmissionSourceStrength +
        materialProbe.plasmaProbeSheathEmissionSourceStrength,
      8,
    );
    expect(materialProbe.plasmaProbeExtinction).toBeCloseTo(
      materialProbe.plasmaProbeOrganizedDensity *
        CYMATIC_PLASMA_EXTINCTION_COEFFICIENT,
    );
    expect(materialProbe.plasmaRadianceGain).toBe(CYMATIC_PLASMA_RADIANCE_GAIN);
    expect(materialProbe.plasmaProbeBaseRadiance[2]).toBeGreaterThan(0);
    expect(materialProbe.plasmaProbeAccentRadiance).toEqual([0, 0, 0]);
    expect(materialProbe.plasmaProbeModalPacketReady).toBe(true);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.plasmaProbePreBloomRadiance,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.plasmaProbePostBloomRisk,
    ).toBeGreaterThanOrEqual(
      runtimeState.debugSnapshot.raymarchDebug.plasmaProbePreBloomRadiance,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.plasmaProbeBloomAmplification,
    ).toBeGreaterThanOrEqual(1);
    expect(runtimeState.debugSnapshot.raymarchDebug.boundaryMode).toBe(
      "neumann",
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.requestedCavityGeometry,
    ).toBe("rectangular");
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveCavityGeometry,
    ).toBe("rectangular");
    expect(
      runtimeState.debugSnapshot.raymarchDebug.materialCavityGeometry,
    ).toBe("rectangular");
    expect(runtimeState.debugSnapshot.raymarchDebug.transientEnergy).toBe(0.7);
    expect(runtimeState.debugSnapshot.raymarchDebug.structureSignal).toBe(0.74);
    expect(runtimeState.debugSnapshot.raymarchDebug.energySignal).toBe(0.68);
    expect(runtimeState.debugSnapshot.raymarchDebug.changeSignal).toBe(0.61);
    expect(runtimeState.debugSnapshot.raymarchDebug.changeBreakdown).toEqual({
      flux: 0.12,
      hit: 0.14,
      slotDelta: 0.1,
      turnover: 0.08,
      timbre: 0.07,
      hint: 0.1,
    });
    expect(runtimeState.debugSnapshot.raymarchDebug.pulseSignal).toBe(0.32);
    expect(runtimeState.debugSnapshot.raymarchDebug.modeCoherence).toBe(0.58);
    expect(runtimeState.debugSnapshot.raymarchDebug.modalResponseEnergy).toBe(
      0.37,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.plasmaProbeLocalRadiance,
    ).toBeCloseTo(expectedProjectionDrive);
    expect(runtimeState.debugSnapshot.raymarchDebug.projectionLoad).toBe(0.72);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionResonantProtection,
    ).toBe(0.09);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionConservationApplied,
    ).toBe(false);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionRawEnergySourceCoupled,
    ).toBe(0.68);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionRawEnergyResonant,
    ).toBe(0.57);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .projectionOverlapPressureSourceCoupled,
    ).toBe(0.23);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .projectionOverlapPressureResonant,
    ).toBe(0.41);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observerFineApertureFwhmWorld,
    ).toBe(CYMATIC_OBSERVER_REFERENCE.fineApertureFwhmWorld);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .observerTopologyApertureFwhmWorld,
    ).toBe(CYMATIC_OBSERVER_REFERENCE.topologyApertureFwhmWorld);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observerSpineWidthRatio,
    ).toBe(CYMATIC_OBSERVER_REFERENCE.spineWidthRatio);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observerCoreWidthRatio,
    ).toBe(CYMATIC_OBSERVER_REFERENCE.coreWidthRatio);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observerSheathWidthRatio,
    ).toBe(CYMATIC_OBSERVER_REFERENCE.sheathWidthRatio);
    expect(runtimeState.debugSnapshot.raymarchDebug.trebleBroadbandEnergy).toBe(
      0.18,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.trebleTonalEnergy).toBe(
      0.24,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.stepReference).toBe(96);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.stepCompensation,
    ).toBeCloseTo(deriveStepCompensation(64));
    expect(runtimeState.debugSnapshot.raymarchDebug.lowStepBloomGuard).toBe(0);
    expect(runtimeState.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "rimBloomBias",
    );
    expect(runtimeState.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "rimCompression",
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.causticStrength).toBe(0.45);
    expect(runtimeState.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "holographicShift",
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.laserFocus).toBe(3.2);
    expect(runtimeState.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "bloomResponseBias",
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveBloomStrength,
    ).toBe(0.11);
    expect(runtimeState.debugSnapshot.raymarchDebug.effectiveBloomRadius).toBe(
      0.09,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveBloomThreshold,
    ).toBe(0.44);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observerSheetFwhmWorld,
    ).toBe(CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld);
    expect(runtimeState.debugSnapshot.raymarchDebug.sceneLightAsymmetry).toBe(
      0,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.bloomRisk).toBeGreaterThan(
      0,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.spectralPresentationEnabled,
    ).toBe(true);
    expect(runtimeState.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "spectralMix",
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.earlyExitEnabled).toBe(
      true,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.earlyExitThreshold).toBe(
      0.005,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.earlyExitRatio,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.plasmaEmissionCoefficient,
    ).toBe(CYMATIC_PLASMA_EMISSION_COEFFICIENT);
  });

  it("does not recompile immutable topology for same-revision moment mutations", () => {
    const runtimeState = createRuntimeState();
    const featureFrame = {
      fieldState: "active",
      renderAuthority: true,
      hasModalField: true,
      activeModeCount: 1,
      activeModalFieldModeCount: 1,
      averageAmplitude: 0.7,
      modalResponseEnergy: 0.5,
      modalFieldSlots: new Float32Array([1, 2, 3, 0.8]),
      modalFieldPhaseSlots: new Float32Array(4),
      modalFieldSpectralMomentSlots: new Float32Array([1, 0, 1, 0]),
      modalFieldMetadataSlots: new Float32Array(4),
    };

    tickRaymarchRuntime(runtimeState, featureFrame, 13.25, 1 / 60);
    runtimeState.modalFieldSpectralMomentBuffer.value.needsUpdate = false;

    featureFrame.modalFieldSpectralMomentSlots = new Float32Array([0, 1, -1, 0]);
    tickRaymarchRuntime(runtimeState, featureFrame, 13.25 + 1 / 60, 1 / 60);

    expect(runtimeState.modalFieldSpectralMomentBuffer.value.needsUpdate).toBe(
      false,
    );
  });

  it("builds internal render probe snapshots without publishing the audit overlay", async () => {
    const previousWindow = globalThis.window;
    globalThis.window = {};
    const runtimeState = createRuntimeState();
    runtimeState.auditEnabled = false;
    runtimeState.renderProbeEnabled = true;
    runtimeState.uniforms.uSpectralPresentationEnabled.value = 0;
    runtimeState.uniforms.uColor = { value: new THREE.Color("#5be3f4") };
    const renderer = { computeAsync: vi.fn(async () => undefined) };
    const featureFrame = createActiveFeatureFrame({
      backboneSlots: new Float32Array([1, 1, 1, 0.9]),
      detailSlots: new Float32Array(0),
      backboneSpectralMomentSlots: new Float32Array(4),
      detailSpectralMomentSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      modalPhaseAuthority: 1,
    });

    try {
      tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60, renderer);
      await flushMicrotasks();

      expect(runtimeState.debugSnapshot).toBeTruthy();
      const raymarchDebug =
        runtimeState.debugSnapshot.raymarchDebug ?? runtimeState.debugSnapshot;
      expect(raymarchDebug.renderAuthority).toBe(true);
      expect(raymarchDebug.plasmaProbePreBloomRadiance).toBeGreaterThanOrEqual(
        0,
      );
      const expectedStaticColorLinearRgb = new THREE.Color("#5be3f4").toArray();
      expect(raymarchDebug.spectralPresentationEnabled).toBe(false);
      expect(raymarchDebug).not.toHaveProperty("spectralMix");
      expect(raymarchDebug.staticColorActive).toBe(true);
      expect(raymarchDebug.staticMaterialColorLinearRgb).toEqual(
        expectedStaticColorLinearRgb,
      );
      expect(raymarchDebug.expectedOutputChromaticityLinearRgb).not.toBeNull();
      expect(
        raymarchDebug.expectedOutputChromaticityLinearRgb[2],
      ).toBeGreaterThan(raymarchDebug.expectedOutputChromaticityLinearRgb[0]);
      expect(
        raymarchDebug.expectedOutputChromaticityLinearRgb[0] * 0.2126 +
          raymarchDebug.expectedOutputChromaticityLinearRgb[1] * 0.7152 +
          raymarchDebug.expectedOutputChromaticityLinearRgb[2] * 0.0722,
      ).toBeCloseTo(1);
      expect(raymarchDebug.outputChromaticitySemantic).toBe(
        "derived-from-static-uColor-linear-rgb;expected-not-gpu-readback",
      );
      expect(globalThis.window.__baryonAuditSnapshot).toBeUndefined();
      expect(raymarchDebug.opticalFieldRepresentation).toBe(
        RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
      );
    } finally {
      globalThis.window = previousWindow;
    }
  });

  it("reports requested spherical geometry while keeping the effective backend rectangular", () => {
    const runtimeState = createRuntimeState();
    runtimeState.requestedCavityGeometry = "spherical";

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 22,
        backboneSlots: new Float32Array([3, 4, 6, 0.8]),
        detailSlots: new Float32Array([4, 5, 5, 0.55]),
        backboneSpectralMomentSlots: new Float32Array(16),
        detailSpectralMomentSlots: new Float32Array(16),
        bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
        transientEnergy: 0.7,
        spectralCentroid: 0.42,
        spectralFlux: 0.28,
        structureSignal: 0.74,
        energySignal: 0.68,
        changeSignal: 0.61,
        pulseSignal: 0.32,
      },
      1,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.userData.raymarchCavityGeometry).toBe(
      "rectangular",
    );
    expect(runtimeState.debugSnapshot.requestedCavityGeometry).toBe(
      "spherical",
    );
    expect(runtimeState.debugSnapshot.effectiveCavityGeometry).toBe(
      "rectangular",
    );
  });

  it("hides the volume and shows the idle overlay in idle state", () => {
    const runtimeState = createRuntimeState();
    runtimeState.backboneModeBuffer.value.needsUpdate = false;
    runtimeState.detailModeBuffer.value.needsUpdate = false;
    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "idle",
        averageAmplitude: 0,
        backboneSlots: new Float32Array(32),
        detailSlots: new Float32Array(32),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array(4),
        transientEnergy: 0,
        spectralCentroid: 0,
        spectralFlux: 0,
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0,
        pulseSignal: 0,
        debug: { modalResponseRenderSourceCoupledEnergy: 0.5 },
      },
      1,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.idleOverlay.visible).toBe(true);
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(0);
    expect(runtimeState.uniforms.uModalResponseEnergy.value).toBe(0);
    expect(runtimeState.backboneModeBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.detailModeBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.raymarchFieldAnalysis).toBeNull();
    expect(runtimeState.debugSnapshot.raymarchDebug.fieldState).toBe("idle");
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationHardSilence,
    ).toBe(true);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.plasmaProbeLocalRadiance,
    ).toBe(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.plasmaProbePreBloomRadiance,
    ).toBe(0);
    expect(runtimeState.debugSnapshot.modeSlotCount).toBe(0);
  });

  it("applies render-authority reset once across repeated idle ticks", () => {
    const runtimeState = createRuntimeState();
    runtimeState.modalFieldModeBuffer.value.array[3] = 0.5;
    runtimeState.modalFieldSpectralMomentBuffer.value.array[0] = 0.25;
    runtimeState.shaderBeatPhase = 0.46;

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "idle",
        renderAuthority: false,
        averageAmplitude: 0,
        bandEnergies: new Float32Array(4),
        debug: {},
      },
      1,
      1 / 60,
    );

    expect(runtimeState.modalFieldModeBuffer.value.array[3]).toBe(0);
    expect(runtimeState.renderAuthorityResetApplied).toBe(true);
    expect(runtimeState.bloomTuning.bloomAllowed).toBe(false);
    expect(runtimeState.shaderBeatPhase).toBeNull();
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observerGeometryExposureSeconds,
    ).toBe(CYMATIC_OBSERVER_REFERENCE.geometryExposureSeconds);

    runtimeState.modalFieldModeBuffer.value.needsUpdate = false;
    runtimeState.modalFieldSpectralMomentBuffer.value.needsUpdate = false;

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "idle",
        renderAuthority: false,
        averageAmplitude: 0,
        bandEnergies: new Float32Array(4),
        debug: {},
      },
      2,
      1 / 60,
    );

    expect(runtimeState.modalFieldModeBuffer.value.needsUpdate).toBe(false);
    expect(
      runtimeState.modalFieldSpectralMomentBuffer.value.needsUpdate,
    ).toBe(false);
  });

  it("does not replay a retained beat pulse after render authority returns", () => {
    const runtimeState = createRuntimeState();
    runtimeState.beatPulseEnvelope = 0.8;
    runtimeState.uniforms.uBeatPulse.value = 0.8;

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "idle",
        renderAuthority: false,
        averageAmplitude: 0,
        bandEnergies: new Float32Array(4),
        debug: {},
      },
      1,
      1 / 60,
    );

    expect(runtimeState.beatPulseEnvelope).toBe(0);
    expect(runtimeState.uniforms.uBeatPulse.value).toBe(0);

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        beatDetected: false,
        beatStrength: 0,
        beatConfidence: 0,
      }),
      1 + 1 / 60,
      1 / 60,
    );

    expect(runtimeState.beatPulseEnvelope).toBe(0);
    expect(runtimeState.uniforms.uBeatPulse.value).toBe(0);
  });

  it("advances persistent observer decay through genuine transport silence", () => {
    const runtimeState = createRuntimeState();
    const fieldCache = attachObserverFieldCache(runtimeState);
    runtimeState.uniforms.uSpectralPresentationEnabled.value = 0;
    const renderer = {};
    const activeFrame = createActiveFeatureFrame({
      observationSessionKey: "file:demo",
      observationTimeSeconds: 1,
      observationAdvancing: true,
      observationPaused: false,
    });
    const silentFrame = withUnifiedModalFields({
      fieldState: "idle",
      renderAuthority: false,
      energyLedger: {
        projectedRenderEnergy: 0,
        renderEnergyEpsilon: 1e-6,
      },
      activeModeCount: 0,
      activeModalFieldModeCount: 0,
      backboneSlots: new Float32Array(0),
      detailSlots: new Float32Array(0),
      backboneSpectralMomentSlots: new Float32Array(0),
      detailSpectralMomentSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array(0),
      detailPhaseSlots: new Float32Array(0),
      averageAmplitude: 0,
      bandEnergies: new Float32Array(4),
      observationSessionKey: "file:demo",
      observationTimeSeconds: 1 + 1 / 60,
      observationAdvancing: true,
      observationPaused: false,
      sourceEvidence: {
        sourceBoundaryState: "live",
        currentSourceEvidence: true,
        transport: {
          playing: true,
          liveInputActive: false,
          playbackEndReason: null,
        },
      },
      debug: {},
    });

    tickRaymarchRuntime(runtimeState, activeFrame, 1, 1 / 60, renderer);
    expect(runtimeState.volumeMesh.visible).toBe(true);

    tickRaymarchRuntime(
      runtimeState,
      silentFrame,
      1 + 1 / 60,
      1 / 60,
      renderer,
    );
    expect(runtimeState.volumeMesh.visible).toBe(true);
    expect(runtimeState.renderAuthorityDisplayHoldActive).toBe(false);
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(0);
    expect(fieldCache.bake).toHaveBeenCalledTimes(2);
    expect(fieldCache.bake.mock.calls[1][1]).toMatchObject({
      observationTimeSeconds: 1 + 1 / 60,
      observationAdvancing: true,
    });
    expect(fieldCache.bake.mock.calls[1][1].observationResetToken).toBe(
      fieldCache.bake.mock.calls[0][1].observationResetToken,
    );
  });

  it("closes live observer history when System input loses source evidence", () => {
    const runtimeState = createRuntimeState();
    const fieldCache = attachObserverFieldCache(runtimeState);
    const renderer = {};
    const activeFrame = createActiveFeatureFrame({
      observationSessionKey: "system:2",
      observationTimeSeconds: 1,
      observationAdvancing: true,
      observationPaused: false,
      sourceEvidence: {
        sourceBoundaryState: "live",
        currentSourceEvidence: true,
        transport: {
          playing: false,
          liveInputActive: true,
          playbackEndReason: null,
        },
      },
    });
    const silentLiveFrame = withUnifiedModalFields({
      fieldState: "idle",
      renderAuthority: false,
      energyLedger: {
        projectedRenderEnergy: 0,
        renderEnergyEpsilon: 1e-6,
      },
      activeModeCount: 0,
      activeModalFieldModeCount: 0,
      backboneSlots: new Float32Array(0),
      detailSlots: new Float32Array(0),
      backboneSpectralMomentSlots: new Float32Array(0),
      detailSpectralMomentSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array(0),
      detailPhaseSlots: new Float32Array(0),
      averageAmplitude: 0,
      bandEnergies: new Float32Array(4),
      observationSessionKey: "system:2",
      observationTimeSeconds: 1 + 1 / 60,
      observationAdvancing: true,
      observationPaused: false,
      sourceEvidence: {
        sourceBoundaryState: "muted",
        currentSourceEvidence: false,
        transport: {
          playing: false,
          liveInputActive: true,
          playbackEndReason: null,
        },
      },
      debug: {},
    });

    tickRaymarchRuntime(runtimeState, activeFrame, 1, 1 / 60, renderer);
    tickRaymarchRuntime(
      runtimeState,
      silentLiveFrame,
      1 + 1 / 60,
      1 / 60,
      renderer,
    );

    expect(fieldCache.bake).toHaveBeenCalledTimes(1);
    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.idleOverlay.visible).toBe(false);
    expect(runtimeState.renderAuthorityResetApplied).toBe(true);
  });

  it("returns to idle after natural ring-down releases source transport", () => {
    const runtimeState = createRuntimeState();
    const fieldCache = attachObserverFieldCache(runtimeState);
    runtimeState.uniforms.uSpectralPresentationEnabled.value = 0;
    const renderer = {};
    const activeFrame = createActiveFeatureFrame({
      observationSessionKey: "file:demo",
      observationTimeSeconds: 4,
      observationAdvancing: true,
      observationPaused: false,
      sourceEvidence: {
        sourceBoundaryState: "live",
        currentSourceEvidence: true,
        transport: {
          playing: true,
          liveInputActive: false,
          playbackEndReason: null,
        },
      },
    });
    const completedRingdownFrame = withUnifiedModalFields({
      fieldState: "idle",
      renderAuthority: false,
      energyLedger: {
        projectedRenderEnergy: 0,
        renderEnergyEpsilon: 1e-6,
      },
      activeModeCount: 0,
      activeModalFieldModeCount: 0,
      backboneSlots: new Float32Array(0),
      detailSlots: new Float32Array(0),
      backboneSpectralMomentSlots: new Float32Array(0),
      detailSpectralMomentSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array(0),
      detailPhaseSlots: new Float32Array(0),
      averageAmplitude: 0,
      bandEnergies: new Float32Array(4),
      observationSessionKey: "file:demo",
      observationTimeSeconds: 4 + 1 / 60,
      observationAdvancing: true,
      observationPaused: false,
      sourceEvidence: {
        sourceBoundaryState: "zero",
        currentSourceEvidence: false,
        transport: {
          playing: false,
          liveInputActive: false,
          playbackEndReason: "natural",
          naturalRingdownActive: true,
        },
      },
      debug: {},
    });

    tickRaymarchRuntime(runtimeState, activeFrame, 4, 1 / 60, renderer);
    expect(runtimeState.volumeMesh.visible).toBe(true);
    expect(fieldCache.bake).toHaveBeenCalledTimes(1);

    tickRaymarchRuntime(
      runtimeState,
      completedRingdownFrame,
      4 + 1 / 60,
      1 / 60,
      renderer,
    );

    expect(fieldCache.bake).toHaveBeenCalledTimes(1);
    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.idleOverlay.visible).toBe(true);
    expect(runtimeState.renderAuthorityResetApplied).toBe(true);
  });

  it("freezes persistent observer state while audio time is paused", () => {
    const runtimeState = createRuntimeState();
    const fieldCache = attachObserverFieldCache(runtimeState);
    runtimeState.uniforms.uSpectralPresentationEnabled.value = 0;
    const renderer = {};
    const activeFrame = createActiveFeatureFrame({
      observationSessionKey: "file:demo",
      observationTimeSeconds: 2,
      observationAdvancing: true,
    });

    tickRaymarchRuntime(runtimeState, activeFrame, 2, 1 / 60, renderer);
    tickRaymarchRuntime(
      runtimeState,
      {
        ...activeFrame,
        observationAdvancing: false,
        observationPaused: true,
      },
      10,
      8,
      renderer,
    );

    expect(fieldCache.bake.mock.calls[1][1]).toMatchObject({
      observationTimeSeconds: 2,
      observationAdvancing: false,
    });
    expect(runtimeState.renderAuthorityDisplayHoldActive).toBe(false);
    expect(runtimeState.volumeMesh.visible).toBe(true);
    expect(runtimeState.idleOverlay.visible).toBe(false);
  });

  it("keeps checkpoint identity stable while a seek revision resets the live writer", () => {
    const runtimeState = createRuntimeState();
    const fieldCache = attachObserverFieldCache(runtimeState);
    runtimeState.uniforms.uSpectralPresentationEnabled.value = 0;
    const renderer = {};
    const sharedFrame = {
      observationSourceKey: "file:demo",
      observationTimeSeconds: 2,
      observationAdvancing: false,
      observationPaused: true,
    };

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        ...sharedFrame,
        observationSessionKey: "file:demo:timeline:1",
        observationTimelineRevision: 1,
      }),
      2,
      0,
      renderer,
    );
    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        ...sharedFrame,
        observationSessionKey: "file:demo:timeline:2",
        observationTimelineRevision: 2,
      }),
      2,
      0,
      renderer,
    );

    const firstOptions = fieldCache.bake.mock.calls[0][1];
    const secondOptions = fieldCache.bake.mock.calls[1][1];
    expect(firstOptions.observationResetToken).not.toBe(
      secondOptions.observationResetToken,
    );
    expect(firstOptions.observationCheckpointKey).toBe(
      secondOptions.observationCheckpointKey,
    );
    expect(firstOptions.observationCheckpointKey).toContain(
      '"source":"file:demo"',
    );
    expect(firstOptions.observationCheckpointKey).toContain(
      `"observerAppearanceRepresentation":"${RAYMARCH_SPECTRAL_PHASE_REPRESENTATION}"`,
    );
  });

  it("keeps observer identity stable until pattern persistence changes", () => {
    const runtimeState = createRuntimeState();
    const fieldCache = attachObserverFieldCache(runtimeState);
    runtimeState.uniforms.uSpectralPresentationEnabled.value = 0;
    runtimeState.cymaticObserverTuning = {
      geometryExposureSeconds: 0.2,
    };
    const renderer = {};
    const sharedFrame = {
      observationSourceKey: "file:demo",
      observationSessionKey: "file:demo:timeline:1",
      observationTimeSeconds: 2,
      observationAdvancing: false,
      observationPaused: true,
    };

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame(sharedFrame),
      2,
      0,
      renderer,
    );
    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame(sharedFrame),
      2,
      0,
      renderer,
    );
    runtimeState.cymaticObserverTuning.geometryExposureSeconds = 0.8;
    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame(sharedFrame),
      2,
      0,
      renderer,
    );

    const firstOptions = fieldCache.bake.mock.calls[0][1];
    const unchangedOptions = fieldCache.bake.mock.calls[1][1];
    const changedOptions = fieldCache.bake.mock.calls[2][1];
    expect(firstOptions.geometryExposureSeconds).toBe(0.2);
    expect(unchangedOptions.geometryExposureSeconds).toBe(0.2);
    expect(changedOptions.geometryExposureSeconds).toBe(0.8);
    expect(firstOptions.observationResetToken).toBe(
      unchangedOptions.observationResetToken,
    );
    expect(firstOptions.observationCheckpointKey).toBe(
      unchangedOptions.observationCheckpointKey,
    );
    expect(unchangedOptions.observationResetToken).not.toBe(
      changedOptions.observationResetToken,
    );
    expect(unchangedOptions.observationCheckpointKey).not.toBe(
      changedOptions.observationCheckpointKey,
    );
  });

  it("bypasses the display hold when feature authority is explicitly revoked", async () => {
    const runtimeState = createRuntimeState();
    runtimeState.uniforms.uSpectralPresentationEnabled.value = 0;
    const renderer = { computeAsync: vi.fn(async () => undefined) };
    const activeFrame = createActiveFeatureFrame();

    tickRaymarchRuntime(runtimeState, activeFrame, 1, 1 / 60, renderer);
    await flushMicrotasks();
    tickRaymarchRuntime(
      runtimeState,
      activeFrame,
      1 + 1 / 60,
      1 / 60,
      renderer,
    );
    expect(runtimeState.volumeMesh.visible).toBe(true);

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "idle",
        renderAuthority: false,
        renderAuthorityRevoked: true,
        sourceEvidence: {
          transport: { playing: true, liveInputActive: false },
        },
      },
      1.02,
      1 / 60,
      renderer,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.idleOverlay.visible).toBe(false);
    expect(runtimeState.renderAuthorityDisplayHoldActive).toBe(false);
    expect(runtimeState.renderAuthorityResetApplied).toBe(true);
  });

  it("does not hold the retained projection after explicit playback stop", async () => {
    const runtimeState = createRuntimeState();
    runtimeState.uniforms.uSpectralPresentationEnabled.value = 0;
    const renderer = { computeAsync: vi.fn(async () => undefined) };
    const startTime = 1;
    const commitTime = startTime + 1 / 60;
    const stopTime = commitTime + 1 / 60;
    const activeFrame = createActiveFeatureFrame({
      backboneSlots: new Float32Array([1, 1, 1, 0.9]),
      detailSlots: new Float32Array(0),
      backboneSpectralMomentSlots: new Float32Array(4),
      detailSpectralMomentSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      modalPhaseAuthority: 1,
      sourceEvidence: {
        sourceBoundaryState: "live",
        currentSourceEvidence: true,
        transport: {
          playing: true,
          liveInputActive: false,
          playbackEndReason: null,
        },
      },
    });
    const stoppedFrame = {
      fieldState: "idle",
      renderAuthority: false,
      sourceEvidence: {
        sourceBoundaryState: "absent",
        currentSourceEvidence: false,
        transport: {
          playing: false,
          liveInputActive: false,
          playbackEndReason: "stopped",
        },
      },
      averageAmplitude: 0,
      bandEnergies: new Float32Array(4),
      debug: {},
    };

    tickRaymarchRuntime(runtimeState, activeFrame, startTime, 1 / 60, renderer);
    await flushMicrotasks();
    tickRaymarchRuntime(
      runtimeState,
      activeFrame,
      commitTime,
      1 / 60,
      renderer,
    );
    expect(runtimeState.volumeMesh.visible).toBe(true);
    expect(runtimeState.renderAuthorityLastVisibleAtSec).toBe(commitTime);

    tickRaymarchRuntime(runtimeState, stoppedFrame, stopTime, 1 / 60, renderer);

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.idleOverlay.visible).toBe(true);
    expect(runtimeState.renderAuthorityDisplayHoldActive).toBe(false);
    expect(runtimeState.renderAuthorityLastVisibleAtSec).toBeNull();
    expect(runtimeState.debugSnapshot.raymarchDebug.renderAuthority).toBe(
      false,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.renderAuthorityDisplayHold,
    ).toBe(false);
    expect(runtimeState.debugSnapshot.idleOverlayVisible).toBe(true);
  });

  it("hides retained modal diagnostics without projected render authority", () => {
    const runtimeState = createRuntimeState();
    runtimeState.responseEnvelope = 0.6;
    runtimeState.modalFieldModeBuffer.value.array[3] = 0.42;
    runtimeState.uniforms.uModalFieldModeCount.value = 1;

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "decay",
        renderAuthority: false,
        isLiveInputActive: true,
        averageAmplitude: 0,
        backboneSlots: new Float32Array([3, 4, 6, 0.18]),
        detailSlots: new Float32Array(32),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array(4),
        transientEnergy: 0,
        spectralCentroid: 0,
        spectralFlux: 0,
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0,
        pulseSignal: 0,
        debug: {
          modalResponseRenderSourceCoupledEnergy: 0.18,
          modalResponseRenderResonantEnergy: 0,
        },
      },
      1,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.debugSnapshot.raymarchDebug.renderAuthority).toBe(
      false,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationHardSilence,
    ).toBe(true);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.plasmaProbeLocalRadiance,
    ).toBe(0);
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(0);
    expect(runtimeState.modalFieldModeBuffer.value.array[3]).toBe(0);
    expect(runtimeState.responseEnvelope).toBe(0);
  });

  it("lets a closed energy ledger override stale render authority", () => {
    const runtimeState = createRuntimeState();
    runtimeState.responseEnvelope = 0.6;
    runtimeState.modalFieldModeBuffer.value.array[3] = 0.42;
    runtimeState.uniforms.uModalFieldModeCount.value = 1;

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        isLiveInputActive: true,
        averageAmplitude: 0,
        backboneSlots: new Float32Array([3, 4, 6, 0.18]),
        detailSlots: new Float32Array(32),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array(4),
        energyLedger: {
          sourceBoundaryState: "muted",
          projectedRenderEnergy: 0,
          renderEnergyEpsilon: 1e-6,
        },
      },
      1,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(0);
    expect(runtimeState.modalFieldModeBuffer.value.array[3]).toBe(0);
    const raymarchDebug =
      runtimeState.debugSnapshot.raymarchDebug ?? runtimeState.debugSnapshot;
    expect(raymarchDebug.renderAuthority).toBe(false);
    expect(raymarchDebug.projectedRenderEnergy).toBe(0);
    expect(raymarchDebug.sourceBoundaryState).toBe("muted");
  });

  it("hard-clamps presentation response without projected render authority", () => {
    const runtimeState = createRuntimeState();
    runtimeState.responseEnvelope = 0.5;
    runtimeState.accentEnvelope = 0.4;
    runtimeState.motionSignal = 0.3;
    runtimeState.scaleSignal = 0.2;
    runtimeState.bloomResponseSignal = 0.6;

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "decay",
        renderAuthority: false,
        isLiveInputActive: true,
        averageAmplitude: 0,
        backboneSlots: new Float32Array([3, 4, 6, 0.18]),
        detailSlots: new Float32Array(32),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array(4),
        transientEnergy: 0,
        spectralCentroid: 0,
        spectralFlux: 0,
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0,
        pulseSignal: 0,
        modalResponseRenderSourceCoupledEnergy: 0.48,
        modalResponseRenderResonantEnergy: 0,
      },
      1,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.responseEnvelope).toBe(0);
    expect(runtimeState.accentEnvelope).toBe(0);
    expect(runtimeState.motionSignal).toBe(0);
    expect(runtimeState.scaleSignal).toBe(0);
    expect(runtimeState.bloomResponseSignal).toBe(0);
  });

  it("uploads fresh buffers after projected render authority returns", () => {
    const runtimeState = createRuntimeState();

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "decay",
        renderAuthority: false,
        averageAmplitude: 0,
        backboneSlots: new Float32Array([3, 4, 6, 0.18]),
        detailSlots: new Float32Array(32),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array(4),
        transientEnergy: 0,
        spectralCentroid: 0,
        spectralFlux: 0,
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0,
        pulseSignal: 0,
      },
      1,
      1 / 60,
    );
    expect(runtimeState.modalFieldModeBuffer.value.array[3]).toBe(0);

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 24,
        backboneSlots: new Float32Array([1, 2, 3, 0.64]),
        detailSlots: new Float32Array([2, 3, 4, 0.32]),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
        transientEnergy: 0.1,
        spectralCentroid: 0.2,
        spectralFlux: 0.1,
        structureSignal: 0.6,
        energySignal: 0.5,
        changeSignal: 0.2,
        pulseSignal: 0.1,
      },
      2,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(true);
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(2);
    expect(runtimeState.modalFieldModeBuffer.value.array[0]).toBe(2);
    expect(runtimeState.modalFieldModeBuffer.value.array[3]).toBe(1);
    expect(runtimeState.modalFieldModeBuffer.value.array[7]).toBe(1);
    expect(
      runtimeState.radiationPotentialCoefficientFrame.normalizedEnergySum,
    ).toBeCloseTo(1, 6);
  });

  it("suppresses the idle overlay during live input and restores it after stop", () => {
    const runtimeState = createRuntimeState();

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        isLiveInputActive: true,
        averageAmplitude: 24,
        backboneSlots: new Float32Array([3, 4, 6, 0.8]),
        detailSlots: new Float32Array(32),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array(4),
        transientEnergy: 0.1,
        spectralCentroid: 0.2,
        spectralFlux: 0.1,
        structureSignal: 0.6,
        energySignal: 0.5,
        changeSignal: 0.2,
        pulseSignal: 0.1,
      },
      1,
      1 / 60,
    );

    expect(runtimeState.idleOverlay.visible).toBe(false);
    expect(runtimeState.idleLogoSuppressedForLive).toBe(true);

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "idle",
        isLiveInputActive: true,
        averageAmplitude: 0,
        backboneSlots: new Float32Array(32),
        detailSlots: new Float32Array(32),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array(4),
        transientEnergy: 0,
        spectralCentroid: 0,
        spectralFlux: 0,
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0,
        pulseSignal: 0,
      },
      2,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.idleOverlay.visible).toBe(false);
    expect(runtimeState.debugSnapshot.idleOverlayVisible).toBe(false);
    expect(runtimeState.debugSnapshot.idleLogoSuppressedForLive).toBe(true);

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "idle",
        isLiveInputActive: false,
        sourceMode: "live",
        averageAmplitude: 0,
        backboneSlots: new Float32Array(32),
        detailSlots: new Float32Array(32),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array(4),
        transientEnergy: 0,
        spectralCentroid: 0,
        spectralFlux: 0,
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0,
        pulseSignal: 0,
      },
      3,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.idleOverlay.visible).toBe(true);
    expect(runtimeState.debugSnapshot.idleOverlayVisible).toBe(true);
    expect(runtimeState.debugSnapshot.idleLogoSuppressedForLive).toBe(false);
  });

  it("suppresses the idle overlay during active file transport stalls", () => {
    const runtimeState = createRuntimeState();

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "idle",
        renderAuthority: false,
        sourceEvidence: {
          sourceBoundaryState: "zero",
          currentSourceEvidence: false,
          transport: {
            playing: true,
            liveInputActive: false,
          },
        },
        averageAmplitude: 0,
        backboneSlots: new Float32Array(32),
        detailSlots: new Float32Array(32),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array(4),
        transientEnergy: 0,
        spectralCentroid: 0,
        spectralFlux: 0,
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0,
        pulseSignal: 0,
      },
      1,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.idleOverlay.visible).toBe(false);
    expect(runtimeState.debugSnapshot.idleOverlayVisible).toBe(false);
    expect(runtimeState.debugSnapshot.idleLogoSuppressedForLive).toBe(false);
    expect(
      runtimeState.debugSnapshot.idleLogoSuppressedForActiveTransport,
    ).toBe(true);
  });

  it("compiles spectral metadata independently of presentation mixing", () => {
    const runtimeState = createRuntimeState();
    runtimeState.uniforms.uSpectralPresentationEnabled.value = 0;
    runtimeState.modalFieldSpectralMomentBuffer.value.array.set([9, 9, 9, 9]);
    const featureFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 48,
      backboneSlots: new Float32Array([3, 4, 6, 0.8]),
      detailSlots: new Float32Array([4, 5, 5, 0.55]),
      backboneSpectralMomentSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
      detailSpectralMomentSlots: new Float32Array([0.2, 0.5, 1, 0.5]),
      bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
      transientEnergy: 0.7,
      spectralCentroid: 0.42,
      spectralFlux: 0.28,
      structureSignal: 0.74,
      energySignal: 0.68,
      changeSignal: 0.61,
      pulseSignal: 0.32,
    };

    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);

    const compiledSpectralMoment = Array.from(
      runtimeState.modalFieldSpectralMomentBuffer.value.array.slice(0, 8),
    );
    expect(compiledSpectralMoment.slice(0, 4)).toEqual([
      expect.closeTo(0.2, 6),
      0.5,
      1,
      0.5,
    ]);
    expect(runtimeState.modalFieldSpectralMomentBuffer.value.needsUpdate).toBe(
      true,
    );

    runtimeState.modalFieldSpectralMomentBuffer.value.needsUpdate = false;
    runtimeState.uniforms.uSpectralPresentationEnabled.value = 1;
    tickRaymarchRuntime(runtimeState, featureFrame, 2, 1 / 60);

    expect(
      runtimeState.modalFieldSpectralMomentBuffer.value.needsUpdate,
    ).toBe(false);
    expect(
      Array.from(
        runtimeState.modalFieldSpectralMomentBuffer.value.array.slice(0, 8),
      ),
    ).toEqual(compiledSpectralMoment);
  });

  it("skips repeated modal, color, and phase uploads without freezing uniforms", () => {
    const runtimeState = createRuntimeState();
    tickRaymarchRuntime(runtimeState, createActiveFeatureFrame(), 1, 1 / 60);

    runtimeState.backboneModeBuffer.value.needsUpdate = false;
    runtimeState.detailModeBuffer.value.needsUpdate = false;
    runtimeState.backbonePhaseBuffer.value.needsUpdate = false;
    runtimeState.detailPhaseBuffer.value.needsUpdate = false;

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        averageAmplitude: 96,
        transientEnergy: 0.91,
        spectralFlux: 0.52,
      }),
      2,
      1 / 60,
    );

    expect(runtimeState.backboneModeBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.detailModeBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.backbonePhaseBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.detailPhaseBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.uniforms.uTime.value).toBe(2);
    expect(runtimeState.uniforms.uAverageAmplitude.value).toBe(96);
    expect(runtimeState.uniforms.uTransientEnergy.value).toBe(0.91);
    expect(runtimeState.uniforms.uSpectralFlux.value).toBe(0.52);
  });

  it("requires an explicit topology revision before recompiling reused basis storage", () => {
    const runtimeState = createRuntimeState();
    const featureFrame = createActiveFeatureFrame();
    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);

    runtimeState.modalFieldModeBuffer.value.needsUpdate = false;
    runtimeState.modalFieldSpectralMomentBuffer.value.needsUpdate = false;
    featureFrame.modalIdentitySlots[0] = 7;

    tickRaymarchRuntime(runtimeState, featureFrame, 2, 1 / 60);

    expect(runtimeState.modalFieldModeBuffer.value.needsUpdate).toBe(false);
    expect(
      runtimeState.modalFieldSpectralMomentBuffer.value.needsUpdate,
    ).toBe(false);
    expect(runtimeState.modalFieldModeBuffer.value.array[0]).not.toBe(7);

    featureFrame.topologyRevision += 1;
    featureFrame.basisIdentityHash = `runtime-test-basis:${featureFrame.topologyRevision}`;
    tickRaymarchRuntime(runtimeState, featureFrame, 3, 1 / 60);

    expect(runtimeState.modalFieldModeBuffer.value.needsUpdate).toBe(true);
    expect(runtimeState.modalFieldSpectralMomentBuffer.value.needsUpdate).toBe(
      true,
    );
    expect(runtimeState.modalFieldModeBuffer.value.array[4]).toBe(7);
    expect(runtimeState).not.toHaveProperty("currentModalBasisCacheDescriptor");
  });

  it("compacts modal slots when upstream continuity releases earlier modes", () => {
    const runtimeState = createRuntimeState();

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        backboneSlots: new Float32Array([1, 1, 1, 0.8, 2, 2, 2, 0.7]),
        detailSlots: new Float32Array(0),
        backboneSpectralMomentSlots: new Float32Array(8),
        detailSpectralMomentSlots: new Float32Array(0),
        backbonePhaseSlots: new Float32Array([0, 0, 1, 1, 0, 0, 1, 1]),
        detailPhaseSlots: new Float32Array(0),
      }),
      1,
      1 / 60,
    );

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        backboneSlots: new Float32Array([2, 2, 2, 0.7]),
        detailSlots: new Float32Array(0),
        backboneSpectralMomentSlots: new Float32Array(4),
        detailSpectralMomentSlots: new Float32Array(0),
        backbonePhaseSlots: new Float32Array([0, 0, 1, 1]),
        detailPhaseSlots: new Float32Array(0),
      }),
      2,
      1 / 60,
    );

    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(1);
    expect(runtimeState).not.toHaveProperty("currentModalBasisCacheDescriptor");
    expect(
      Array.from(runtimeState.modalFieldModeBuffer.value.array.slice(0, 4)),
    ).toEqual([2, 2, 2, 1]);
    expect(
      runtimeState.radiationPotentialCoefficientFrame.normalizedEnergySum,
    ).toBeCloseTo(1, 6);
  });

  it("keeps upstream-retained zero coefficient modal slots addressable", () => {
    const runtimeState = createRuntimeState();

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 48,
        activeModeCount: 2,
        modalFieldSlots: new Float32Array([1, 1, 1, 0, 2, 2, 2, 0.7]),
        modalFieldPhaseSlots: new Float32Array([0, 0, 1, 1, 0, 0, 1, 1]),
        modalFieldSpectralMomentSlots: new Float32Array(8),
        modalFieldMetadataSlots: new Float32Array(8),
        bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
        structureSignal: 0.74,
        energySignal: 0.68,
        changeSignal: 0.61,
        energyLedger: {
          projectedRenderEnergy: 0.2,
          renderEnergyEpsilon: 1e-6,
        },
      },
      1,
      1 / 60,
    );

    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(2);
    expect(
      Array.from(runtimeState.modalFieldModeBuffer.value.array.slice(0, 8)),
    ).toEqual([1, 1, 1, 1, 2, 2, 2, 1]);
    expect(runtimeState.modalFieldCoefficientBuffer.value.array[0]).toBe(0);
    expect(runtimeState.modalFieldCoefficientBuffer.value.array[4]).toBeCloseTo(
      1,
      6,
    );
  });

  it("clears upload signatures while projected render authority is absent", () => {
    const runtimeState = createRuntimeState();
    const featureFrame = createActiveFeatureFrame();
    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        fieldState: "idle",
        renderAuthority: false,
      }),
      2,
      1 / 60,
    );

    runtimeState.modalFieldModeBuffer.value.needsUpdate = false;
    tickRaymarchRuntime(runtimeState, featureFrame, 3, 1 / 60);

    expect(runtimeState.modalFieldModeBuffer.value.needsUpdate).toBe(true);
  });

  it("keeps modal field uploads identical between static and Spectral color modes", () => {
    const createFrame = () => ({
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 48,
      backboneSlots: new Float32Array([1, 1, 1, 0.3]),
      detailSlots: new Float32Array([
        1, 1, 1, 0.5, 2, 2, 2, 0.4, 3, 3, 3, 0.3, 4, 4, 4, 0.09,
      ]),
      backboneSpectralMomentSlots: new Float32Array([1, 0.1, 0.1, 0.2]),
      detailSpectralMomentSlots: new Float32Array([
        0.8, 0.1, 0.1, 0.2, 0.7, 0.2, 0.1, 0.2, 0.6, 0.2, 0.1, 0.2, 0, 1, 0, 1,
      ]),
      bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
      transientEnergy: 0.45,
      spectralCentroid: 0.42,
      spectralFlux: 0.28,
      structureSignal: 0.74,
      energySignal: 0.68,
      changeSignal: 0.61,
      pulseSignal: 0.32,
    });
    const staticRuntimeState = createRuntimeState();
    staticRuntimeState.uniforms.uSpectralPresentationEnabled.value = 0;
    const spectralRuntimeState = createRuntimeState();
    spectralRuntimeState.uniforms.uSpectralPresentationEnabled.value = 1;

    tickRaymarchRuntime(staticRuntimeState, createFrame(), 1, 1 / 60);
    tickRaymarchRuntime(spectralRuntimeState, createFrame(), 1, 1 / 60);

    expect(spectralRuntimeState.uniforms.uModalFieldModeCount.value).toBe(
      staticRuntimeState.uniforms.uModalFieldModeCount.value,
    );
    expect(
      Array.from(
        spectralRuntimeState.modalFieldModeBuffer.value.array.slice(0, 12),
      ),
    ).toEqual(
      Array.from(
        staticRuntimeState.modalFieldModeBuffer.value.array.slice(0, 12),
      ),
    );
    expect(spectralRuntimeState.raymarchFieldAnalysis.uploadedModeCount).toBe(
      staticRuntimeState.raymarchFieldAnalysis.uploadedModeCount,
    );
    expect(
      spectralRuntimeState.modalFieldSpectralMomentBuffer.value.needsUpdate,
    ).toBe(true);
  });

  it("builds field analysis inline without performance-profile side channels", () => {
    const runtimeState = createRuntimeState();
    const featureFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 48,
      backboneSlots: new Float32Array([1, 2, 3, 0.8, 8, 9, 10, 0.9]),
      detailSlots: new Float32Array([4, 5, 6, 0.5]),
      backboneSpectralMomentSlots: new Float32Array(32),
      detailSpectralMomentSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
      transientEnergy: 0.2,
      spectralCentroid: 0.3,
      spectralFlux: 0.1,
      structureSignal: 0.4,
      energySignal: 0.3,
      changeSignal: 0.2,
      pulseSignal: 0.1,
    };

    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);

    // The integrator (render loop) owns steps, so field analysis never
    // re-adapts them. Performance profiles do not govern bloom either.
    expect(runtimeState.raymarchFieldAnalysis).not.toHaveProperty(
      "stepScaleAdaptationActive",
    );
    expect(runtimeState.raymarchFieldAnalysis).not.toHaveProperty(
      "bloomAdaptationActive",
    );
    expect(runtimeState.raymarchFieldAnalysis).not.toHaveProperty(
      "bloomStrengthScale",
    );
    expect(runtimeState.raymarchFieldAnalysis).not.toHaveProperty(
      "bloomThresholdOffset",
    );
    expect(
      runtimeState.raymarchFieldAnalysis.modalField.uploadedActiveCount,
    ).toBe(3);
    expect(
      Array.from(runtimeState.modalFieldModeBuffer.value.array.slice(0, 4)),
    ).toEqual([8, 9, 10, 1]);
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(3);
  });

  it("keeps static color on the direct analytic path", () => {
    const runtimeState = createRuntimeState();
    runtimeState.uniforms.uSpectralPresentationEnabled.value = 0;
    const renderer = {
      computeAsync: async () => undefined,
    };

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 48,
        backboneSlots: new Float32Array([3, 4, 6, 0.8]),
        detailSlots: new Float32Array([4, 5, 5, 0.55]),
        backboneSpectralMomentSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
        detailSpectralMomentSlots: new Float32Array([0.2, 0.5, 1, 0.5]),
        bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
        transientEnergy: 0.7,
        spectralCentroid: 0.42,
        spectralFlux: 0.28,
        structureSignal: 0.74,
        energySignal: 0.68,
        changeSignal: 0.61,
        pulseSignal: 0.32,
      },
      1,
      1 / 60,
      renderer,
    );

    expect(runtimeState).not.toHaveProperty("spectralLightBuffersUploaded");
    expect(runtimeState).not.toHaveProperty("currentSpectralLightDescriptor");
    expect(runtimeState.debugSnapshot.spectralColorFieldImplementationState).toBe(
      RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
    );
  });

  it("keeps low-amplitude bass rendering on the direct analytic path", () => {
    const runtimeState = createRuntimeState();
    runtimeState.uniforms.uSpectralPresentationEnabled.value = 0;
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const lowBassFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 6,
      backboneSlots: new Float32Array([1, 1, 2, 0.08]),
      detailSlots: new Float32Array([2, 1, 3, 0.04]),
      backboneSpectralMomentSlots: new Float32Array(32),
      detailSpectralMomentSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.38, 0.08, 0.01, 0]),
      transientEnergy: 0.02,
      spectralCentroid: 0.08,
      spectralFlux: 0.01,
      structureSignal: 0.18,
      energySignal: 0.08,
      changeSignal: 0.02,
      pulseSignal: 0,
      bassSalience: 0.38,
      modeCoherence: 0.44,
      modalResponseRenderSourceCoupledEnergy: 0.05,
      modalResponseRenderResonantEnergy: 0,
      debug: {},
    };

    tickRaymarchRuntime(runtimeState, lowBassFrame, 1, 1 / 60, renderer);

    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBeGreaterThan(0);
    expect(runtimeState.uniforms.uTotalSlotAmplitude.value).toBeGreaterThan(0);
    expect(runtimeState.uniforms.uModalResponseEnergy.value).toBe(0.05);
    expect(runtimeState.volumeMesh.visible).toBe(true);
    expect(runtimeState.volumeMesh.userData).not.toHaveProperty(
      "raymarchFieldEvaluationMode",
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.visibilityGateState).toBe(
      "visible",
    );
    tickRaymarchRuntime(runtimeState, lowBassFrame, 2, 1 / 60, renderer);
    expect(runtimeState.volumeMesh.userData).not.toHaveProperty(
      "raymarchFieldEvaluationMode",
    );
    expect(runtimeState).not.toHaveProperty("currentModalBasisCacheDescriptor");
    expect(renderer.computeAsync).not.toHaveBeenCalled();
  });

  it("renders detail-only packets directly without a field cache", () => {
    const runtimeState = createRuntimeState();
    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 22,
        backboneSlots: new Float32Array(32),
        detailSlots: new Float32Array([4, 5, 5, 0.45, 2, 2, 6, 0.3]),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array([
          0.2, 0.5, 1, 0.5, 0.7, 0.2, 1, 0.45,
        ]),
        bandEnergies: new Float32Array(4),
        transientEnergy: 0,
        spectralCentroid: 0.15,
        spectralFlux: 0.05,
        structureSignal: 0.32,
        energySignal: 0.28,
        changeSignal: 0.14,
        pulseSignal: 0.05,
        debug: {},
      },
      2,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(true);
    expect(runtimeState.idleOverlay.visible).toBe(false);
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(2);
    expect(runtimeState.debugSnapshot.raymarchDebug.modeSlotCount).toBe(2);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalVarietyAudit,
    ).toMatchObject({
      semanticModeCount: 2,
      directOpticalRepresentedModeCount: 2,
      directOpticalModeCapacity: MODAL_SEMANTIC_DESCRIPTOR_CAPACITY,
      spatialFamilyCount: 2,
      representedSpatialFamilyCount: 2,
      renderRepresentedEnergyRatio: 1,
    });
  });

  it("applies transient and band modulation without changing mode counts", () => {
    const runtimeState = createRuntimeState();
    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 18,
        backboneSlots: new Float32Array([3, 4, 6, 0.5]),
        detailSlots: new Float32Array(32),
        backboneSpectralMomentSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.6, 0.4, 0.2, 0.1]),
        transientEnergy: 0.85,
        spectralCentroid: 0.33,
        spectralFlux: 0.72,
        structureSignal: 0.51,
        energySignal: 0.64,
        changeSignal: 0.82,
        pulseSignal: 0.28,
        debug: {},
      },
      3,
      1 / 60,
    );

    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(1);
    expect(runtimeState.uniforms.uTransientEnergy.value).toBe(0.85);
    expect(runtimeState.uniforms.uSpectralCentroid.value).toBe(0.33);
    expect(runtimeState.uniforms.uSpectralFlux.value).toBe(0.72);
    const [sub, lowMid, highMid, air] =
      runtimeState.uniforms.uBandEnergies.value.toArray();
    expect(sub).toBeCloseTo(0.6);
    expect(lowMid).toBeCloseTo(0.4);
    expect(highMid).toBeCloseTo(0.2);
    expect(air).toBeCloseTo(0.1);
    expect(runtimeState.debugSnapshot.raymarchDebug.modeSlotCount).toBe(1);
    expect(runtimeState.debugSnapshot.raymarchDebug.transientEnergy).toBe(0.85);
  });

  it("keeps observer and plasma calibration fixed across transients", () => {
    const steadyRuntimeState = createRuntimeState();
    const transientRuntimeState = createRuntimeState();
    const steadyFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 32,
      backboneSlots: new Float32Array([3, 4, 6, 0.5]),
      detailSlots: new Float32Array([4, 5, 5, 0.2]),
      backboneSpectralMomentSlots: new Float32Array([1, 1, 1, 1]),
      detailSpectralMomentSlots: new Float32Array([1, 1, 1, 1]),
      bandEnergies: new Float32Array([0.2, 0.2, 0.15, 0.1]),
      transientEnergy: 0.08,
      spectralCentroid: 0.28,
      spectralFlux: 0.06,
      structureSignal: 0.52,
      energySignal: 0.48,
      changeSignal: 0.12,
      pulseSignal: 0.08,
      debug: {},
    };
    const transientFrame = {
      ...steadyFrame,
      transientEnergy: 0.82,
      spectralFlux: 0.58,
      changeSignal: 0.76,
      pulseSignal: 0.55,
    };

    tickRaymarchRuntime(steadyRuntimeState, steadyFrame, 1, 1 / 60);
    tickRaymarchRuntime(transientRuntimeState, transientFrame, 1, 1 / 60);

    expect(
      transientRuntimeState.debugSnapshot.raymarchDebug.observerSheetFwhmWorld,
    ).toBe(
      steadyRuntimeState.debugSnapshot.raymarchDebug.observerSheetFwhmWorld,
    );
    expect(
      transientRuntimeState.debugSnapshot.raymarchDebug.observerSheetFwhmWorld,
    ).toBe(CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld);
    expect(
      transientRuntimeState.debugSnapshot.raymarchDebug
        .observerGeometryExposureSeconds,
    ).toBe(CYMATIC_OBSERVER_REFERENCE.geometryExposureSeconds);
    expect(
      transientRuntimeState.debugSnapshot.raymarchDebug
        .plasmaExtinctionCoefficient,
    ).toBe(CYMATIC_PLASMA_EXTINCTION_COEFFICIENT);
    expect(
      transientRuntimeState.debugSnapshot.raymarchDebug
        .plasmaEmissionCoefficient,
    ).toBe(CYMATIC_PLASMA_EMISSION_COEFFICIENT);
    expect(
      transientRuntimeState.debugSnapshot.raymarchDebug.effectiveBloomStrength,
    ).toBe(
      steadyRuntimeState.debugSnapshot.raymarchDebug.effectiveBloomStrength,
    );
    expect(
      transientRuntimeState.debugSnapshot.raymarchDebug.effectiveBloomRadius,
    ).toBe(steadyRuntimeState.debugSnapshot.raymarchDebug.effectiveBloomRadius);
    expect(transientRuntimeState.uniforms.uDensityGain.value).toBeLessThan(
      steadyRuntimeState.uniforms.uDensityGain.value * 1.08,
    );
  });

  it("keeps modal bandwidth and diagnostic evidence out of bloom ownership", () => {
    const detailedRuntimeState = createRuntimeState();
    const broadBodyRuntimeState = createRuntimeState();
    const debugOnlyAuthorityRuntimeState = createRuntimeState();
    const sharedEvidenceLabels = {
      modalResponseRenderSourceCoupledEnergy: 0.32,
      modalResponseRenderResonantEnergy: 0.01,
    };
    const detailedFrame = createActiveFeatureFrame({
      averageAmplitude: 32,
      transientEnergy: 0.08,
      spectralFlux: 0.06,
      changeSignal: 0.12,
      pulseSignal: 0.08,
      backboneSlots: new Float32Array([3, 4, 6, 0.72]),
      detailSlots: new Float32Array([14, 12, 11, 0.68]),
      ...sharedEvidenceLabels,
      debug: {
        resonantPhaseAuthority: 0.55,
        projectionResonantProtection: 0.42,
      },
    });
    const broadBodyFrame = createActiveFeatureFrame({
      averageAmplitude: 32,
      transientEnergy: 0.08,
      spectralFlux: 0.06,
      changeSignal: 0.12,
      pulseSignal: 0.08,
      backboneSlots: new Float32Array([3, 4, 6, 0.72]),
      detailSlots: new Float32Array(32),
      ...sharedEvidenceLabels,
      debug: {},
    });
    const debugOnlyAuthorityFrame = createActiveFeatureFrame({
      ...broadBodyFrame,
      debug: {
        resonantPhaseAuthority: 1,
        projectionResonantProtection: 1,
      },
    });

    tickRaymarchRuntime(detailedRuntimeState, detailedFrame, 1, 1 / 60);
    tickRaymarchRuntime(broadBodyRuntimeState, broadBodyFrame, 1, 1 / 60);
    tickRaymarchRuntime(
      debugOnlyAuthorityRuntimeState,
      debugOnlyAuthorityFrame,
      1,
      1 / 60,
    );

    expect(broadBodyRuntimeState.bloomTuning.effectiveStrength).toBe(
      detailedRuntimeState.bloomTuning.effectiveStrength,
    );
    expect(broadBodyRuntimeState.bloomTuning.effectiveThreshold).toBe(
      detailedRuntimeState.bloomTuning.effectiveThreshold,
    );
    expect(debugOnlyAuthorityRuntimeState.bloomTuning.effectiveStrength).toBe(
      broadBodyRuntimeState.bloomTuning.effectiveStrength,
    );
    expect(debugOnlyAuthorityRuntimeState.bloomTuning.effectiveThreshold).toBe(
      broadBodyRuntimeState.bloomTuning.effectiveThreshold,
    );
  });

  it("keeps the continuous response alive between adjacent active frames", () => {
    const runtimeState = createRuntimeState();
    const featureFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 18,
      backboneSlots: new Float32Array([3, 4, 6, 0.5]),
      detailSlots: new Float32Array(32),
      backboneSpectralMomentSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
      detailSpectralMomentSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.6, 0.3, 0.1, 0.05]),
      transientEnergy: 0.4,
      spectralCentroid: 0.22,
      spectralFlux: 0.3,
      structureSignal: 0.62,
      energySignal: 0.58,
      changeSignal: 0.49,
      pulseSignal: 0.22,
      debug: {},
    };

    tickRaymarchRuntime(runtimeState, featureFrame, 2, 1 / 60);
    const firstEnvelope = runtimeState.responseEnvelope;

    tickRaymarchRuntime(
      runtimeState,
      {
        ...featureFrame,
        structureSignal: 0.18,
        energySignal: 0.12,
        changeSignal: 0.08,
        pulseSignal: 0,
      },
      2.016,
      1 / 60,
    );

    expect(runtimeState.responseEnvelope).toBeGreaterThan(0);
    expect(runtimeState.responseEnvelope).toBeGreaterThanOrEqual(
      firstEnvelope * 0.8,
    );
    expect(runtimeState.visualRoot.scale.x).toBe(1);
  });

  it("ignores removed legacy reactivity metadata", () => {
    const runtimeState = createRuntimeState();
    runtimeState.reactivityTuning.reactivity = 0;

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 18,
        backboneSlots: new Float32Array([3, 4, 6, 0.5]),
        detailSlots: new Float32Array(32),
        backboneSpectralMomentSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.6, 0.3, 0.1, 0.05]),
        transientEnergy: 0.4,
        spectralCentroid: 0.22,
        spectralFlux: 0.3,
        structureSignal: 0.62,
        energySignal: 0.58,
        changeSignal: 0.49,
        pulseSignal: 0.22,
        debug: {},
      },
      2,
      1 / 60,
    );

    expect(runtimeState.responseEnvelope).toBeGreaterThan(0);
    expect(runtimeState.accentEnvelope).toBeGreaterThan(0);
    expect(runtimeState.motionSignal).toBeGreaterThan(0);
    expect(runtimeState.scaleSignal).toBeGreaterThan(0);
    expect(runtimeState.bloomResponseSignal).toBeGreaterThan(0);
    expect(runtimeState.visualRoot.scale.x).toBe(1);
    expect(runtimeState.uniforms.uDensityGain.value).toBe(2.8);
  });

  it("returns scale and density toward neutral in idle state", () => {
    const runtimeState = createRuntimeState();
    runtimeState.responseEnvelope = 0.8;
    runtimeState.scaleSignal = 0.8;
    runtimeState.visualRoot.scale.setScalar(1.05);

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 18,
        backboneSlots: new Float32Array([3, 4, 6, 0.5]),
        detailSlots: new Float32Array(32),
        backboneSpectralMomentSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.6, 0.3, 0.1, 0.05]),
        transientEnergy: 0.4,
        spectralCentroid: 0.22,
        spectralFlux: 0.3,
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0,
        pulseSignal: 0,
        debug: {},
      },
      2,
      1 / 60,
    );

    expect(runtimeState.responseEnvelope).toBeLessThan(0.8);
    expect(runtimeState.visualRoot.scale.x).toBe(1);
    expect(runtimeState.uniforms.uDensityGain.value).toBeGreaterThanOrEqual(
      2.8,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.responseEnvelope,
    ).toBeLessThan(0.8);
  });

  it("releases responseEnvelope faster for weak decay tails than active tails", () => {
    const decayRuntime = createRuntimeState();
    const activeRuntime = createRuntimeState();
    decayRuntime.responseEnvelope = 0.72;
    activeRuntime.responseEnvelope = 0.72;

    const weakTailFrame = {
      renderAuthority: true,
      averageAmplitude: 8,
      backboneSlots: new Float32Array([3, 4, 6, 0.18]),
      detailSlots: new Float32Array(32),
      backboneSpectralMomentSlots: new Float32Array(32),
      detailSpectralMomentSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.08, 0.05, 0.03, 0.01]),
      transientEnergy: 0,
      spectralCentroid: 0.16,
      spectralFlux: 0.02,
      structureSignal: 0.08,
      energySignal: 0.028,
      changeSignal: 0.012,
      pulseSignal: 0,
      rhythmicDensity: 0,
      debug: {},
    };

    tickRaymarchRuntime(
      decayRuntime,
      { ...weakTailFrame, fieldState: "decay" },
      2,
      1 / 60,
    );
    tickRaymarchRuntime(
      activeRuntime,
      { ...weakTailFrame, fieldState: "active" },
      2,
      1 / 60,
    );

    expect(decayRuntime.responseEnvelope).toBeLessThan(
      activeRuntime.responseEnvelope,
    );
  });

  it("keeps responseEnvelope active for coherent modal visibility tails", () => {
    const runtimeState = createRuntimeState();
    runtimeState.responseEnvelope = 0.36;

    const resonantTailFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 1.24,
      backboneSlots: new Float32Array([3, 4, 6, 0.018]),
      detailSlots: new Float32Array([4, 5, 5, 0.012]),
      backboneSpectralMomentSlots: new Float32Array(32),
      detailSpectralMomentSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.02, 0.018, 0.014, 0.01]),
      transientEnergy: 0,
      spectralCentroid: 0.18,
      spectralFlux: 0.01,
      structureSignal: 0.028,
      energySignal: 0.012,
      changeSignal: 0,
      pulseSignal: 0,
      modeCoherence: 0.8,
      rhythmicDensity: 0,
      modalResponseRenderSourceCoupledEnergy: 0.32,
      modalResponseRenderResonantEnergy: 0,
      debug: {},
    };

    for (let frame = 0; frame < 36; frame += 1) {
      tickRaymarchRuntime(
        runtimeState,
        resonantTailFrame,
        2 + frame / 60,
        1 / 60,
      );
    }

    expect(runtimeState.responseEnvelope).toBeGreaterThan(0.16);
    expect(runtimeState.debugSnapshot.raymarchDebug.modalResponseEnergy).toBe(
      0.32,
    );
  });

  it("keeps retained modal-response diagnostics out of canonical observation", () => {
    const baselineRuntime = createRuntimeState();
    const retainedRuntime = createRuntimeState();
    const baseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 1.24,
      backboneSlots: new Float32Array([3, 4, 6, 0.018]),
      detailSlots: new Float32Array([4, 5, 5, 0.012]),
      backboneSpectralMomentSlots: new Float32Array(32),
      detailSpectralMomentSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.02, 0.018, 0.014, 0.01]),
      transientEnergy: 0,
      spectralCentroid: 0.18,
      spectralFlux: 0.01,
      structureSignal: 0.028,
      energySignal: 0.012,
      changeSignal: 0,
      pulseSignal: 0,
      modeCoherence: 0.8,
      rhythmicDensity: 0,
      modalResponseRenderSourceCoupledEnergy: 0.02,
      modalResponseRenderResonantEnergy: 0,
      debug: {},
    };

    tickRaymarchRuntime(baselineRuntime, baseFrame, 2, 1 / 60);
    tickRaymarchRuntime(
      retainedRuntime,
      {
        ...baseFrame,
        modalResponseRenderResonantEnergy: 0.19,
      },
      2,
      1 / 60,
    );

    expect(retainedRuntime.uniforms.uModalResponseEnergy.value).toBeCloseTo(
      0.19,
    );
    expect(
      retainedRuntime.debugSnapshot.raymarchDebug.plasmaProbeLocalRadiance,
    ).toBeCloseTo(
      baselineRuntime.debugSnapshot.raymarchDebug.plasmaProbeLocalRadiance,
    );
    expect(
      retainedRuntime.debugSnapshot.raymarchDebug
        .observerGeometryExposureSeconds,
    ).toBe(
      baselineRuntime.debugSnapshot.raymarchDebug
        .observerGeometryExposureSeconds,
    );
    expect(retainedRuntime.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "retainedHighQRidgeVisibleDensityMax",
    );
  });

  it("uses render-facing modal response energy when raw response is stale", () => {
    const runtimeState = createRuntimeState();
    const rawOnlyRuntimeState = createRuntimeState();
    const featureFrame = {
      fieldState: "active",
      renderAuthority: true,
      energyLedger: {
        projectedRenderEnergy: 0.31,
        renderEnergyEpsilon: 1e-6,
      },
      averageAmplitude: 0.8,
      modalFieldSlots: new Float32Array([3, 4, 6, 0.018]),
      modalFieldPhaseSlots: new Float32Array(4),
      modalFieldSpectralMomentSlots: new Float32Array(4),
      activeModeCount: 1,
      activeModalFieldModeCount: 1,
      bandEnergies: new Float32Array([0.02, 0.018, 0.014, 0.01]),
      transientEnergy: 0,
      spectralCentroid: 0.18,
      spectralFlux: 0.01,
      structureSignal: 0.018,
      energySignal: 0.01,
      changeSignal: 0,
      pulseSignal: 0,
      modeCoherence: 0.62,
      rhythmicDensity: 0,
      modalResponseEnergy: 0.03,
      modalResponseRenderEnergy: 0.31,
      modalResponseRenderSourceCoupledEnergy: 0.24,
      modalResponseRenderResonantEnergy: 0.19,
      debug: {
        modalResponseEnergy: 0.04,
      },
    };
    const rawOnlyFeatureFrame = {
      ...featureFrame,
      modalResponseRenderEnergy: 0.03,
      modalResponseRenderSourceCoupledEnergy: 0.03,
      modalResponseRenderResonantEnergy: 0.03,
      debug: {
        modalResponseEnergy: 0.03,
      },
    };

    tickRaymarchRuntime(rawOnlyRuntimeState, rawOnlyFeatureFrame, 2, 1 / 60);
    tickRaymarchRuntime(runtimeState, featureFrame, 2, 1 / 60);

    expect(rawOnlyRuntimeState.uniforms.uModalResponseEnergy.value).toBeCloseTo(
      0.03,
    );
    expect(runtimeState.uniforms.uModalResponseEnergy.value).toBeCloseTo(0.31);
    expect(runtimeState.debugSnapshot.raymarchDebug.modalResponseEnergy).toBe(
      0.31,
    );
    expect(runtimeState.responseEnvelope).toBeGreaterThan(
      rawOnlyRuntimeState.responseEnvelope,
    );
  });

  it("does not let phase confidence author observer radiance", () => {
    const runtimeState = createRuntimeState();

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 0.2,
        backboneSlots: new Float32Array(32),
        detailSlots: new Float32Array(32),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.02, 0.018, 0.014, 0.01]),
        transientEnergy: 0,
        spectralCentroid: 0.18,
        spectralFlux: 0,
        structureSignal: 0.02,
        energySignal: 0.01,
        changeSignal: 0,
        pulseSignal: 0,
        modeCoherence: 0.7,
        modalPhaseAuthority: 1,
        rhythmicDensity: 0,
        modalResponseRenderSourceCoupledEnergy: 0,
        modalResponseRenderResonantEnergy: 0,
        debug: {},
      },
      2,
      1 / 60,
    );

    expect(runtimeState.debugSnapshot.raymarchDebug.modalPhaseAuthority).toBe(
      1,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.plasmaProbeLocalRadiance,
    ).toBe(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.plasmaProbePreBloomRadiance,
    ).toBe(0);
  });

  it("keeps source-coupled response diagnostics out of observer radiance", () => {
    const baselineRuntime = createRuntimeState();
    const observedRuntime = createRuntimeState();
    const baseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 0.8,
      backboneSlots: new Float32Array([3, 4, 6, 0.018]),
      detailSlots: new Float32Array([4, 5, 5, 0.012]),
      backboneSpectralMomentSlots: new Float32Array(32),
      detailSpectralMomentSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.02, 0.018, 0.014, 0.01]),
      transientEnergy: 0,
      spectralCentroid: 0.18,
      spectralFlux: 0.01,
      structureSignal: 0.018,
      energySignal: 0.01,
      changeSignal: 0,
      pulseSignal: 0,
      modeCoherence: 0.62,
      rhythmicDensity: 0,
      modalResponseRenderSourceCoupledEnergy: 0,
      modalResponseRenderResonantEnergy: 0,
      debug: {},
    };

    tickRaymarchRuntime(baselineRuntime, baseFrame, 2, 1 / 60);
    tickRaymarchRuntime(
      observedRuntime,
      {
        ...baseFrame,
        modalResponseRenderSourceCoupledEnergy: 0.24,
      },
      2,
      1 / 60,
    );

    expect(observedRuntime.uniforms.uModalResponseEnergy.value).toBeCloseTo(
      0.24,
    );
    expect(
      observedRuntime.debugSnapshot.raymarchDebug.plasmaProbeLocalRadiance,
    ).toBeCloseTo(
      baselineRuntime.debugSnapshot.raymarchDebug.plasmaProbeLocalRadiance,
    );
    expect(observedRuntime.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "observerRidgeVisibleDensityMax",
    );
  });

  it("does not brighten low-Q bass from response metadata", () => {
    const baselineRuntime = createRuntimeState();
    const lowQRuntime = createRuntimeState();
    const baseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 0.8,
      backboneSlots: new Float32Array([1, 1, 1, 0.006, 2, 1, 1, 0.004]),
      detailSlots: new Float32Array(32),
      backboneSpectralMomentSlots: new Float32Array(32),
      detailSpectralMomentSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.12, 0.08, 0.01, 0.004]),
      transientEnergy: 0,
      spectralCentroid: 0.08,
      spectralFlux: 0.01,
      structureSignal: 0.018,
      energySignal: 0.012,
      changeSignal: 0,
      pulseSignal: 0,
      modeCoherence: 0.62,
      rhythmicDensity: 0,
      modalResponseRenderSourceCoupledEnergy: 0,
      modalResponseRenderResonantEnergy: 0,
      debug: {},
    };

    tickRaymarchRuntime(baselineRuntime, baseFrame, 2, 1 / 60);
    tickRaymarchRuntime(
      lowQRuntime,
      {
        ...baseFrame,
        modalResponseRenderSourceCoupledEnergy: 0.083,
      },
      2,
      1 / 60,
    );

    expect(lowQRuntime.uniforms.uModalResponseEnergy.value).toBeCloseTo(0.083);
    expect(
      lowQRuntime.debugSnapshot.raymarchDebug.plasmaProbeLocalRadiance,
    ).toBeCloseTo(
      baselineRuntime.debugSnapshot.raymarchDebug.plasmaProbeLocalRadiance,
    );
    expect(lowQRuntime.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "lowQBackboneTopologyFloor",
    );
    expect(lowQRuntime.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "lowQBackboneRidgeVisibleDensityMax",
    );
  });

  it("keeps the outer radius fixed while internal response stays active", () => {
    const runtimeState = createRuntimeState();

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 64,
        backboneSlots: new Float32Array([3, 4, 6, 0.7]),
        detailSlots: new Float32Array([4, 5, 5, 0.35]),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.5, 0.3, 0.2, 0.1]),
        transientEnergy: 0.52,
        spectralCentroid: 0.36,
        spectralFlux: 0.31,
        structureSignal: 0.66,
        energySignal: 0.62,
        changeSignal: 0.48,
        pulseSignal: 0.22,
        modeCoherence: 0.61,
        trebleBroadbandEnergy: 0.14,
        debug: {},
      },
      1,
      1 / 60,
    );

    expect(runtimeState.scaleSignal).toBeGreaterThan(0);
    expect(runtimeState.bloomResponseSignal).toBeGreaterThan(0);
    expect(runtimeState.visualRoot.scale.x).toBe(1);
    expect(runtimeState.debugSnapshot.raymarchDebug.visualScale).toBe(1);
  });

  it("uploads rhythmicDensity to uRhythmicDensity uniform", () => {
    const runtimeState = createRuntimeState();
    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 24,
        backboneSlots: new Float32Array([3, 4, 6, 0.5]),
        detailSlots: new Float32Array(32),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array(4),
        transientEnergy: 0,
        spectralCentroid: 0.2,
        spectralFlux: 0.1,
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0,
        pulseSignal: 0,
        rhythmicDensity: 0.72,
        debug: {},
      },
      1,
      1 / 60,
    );
    expect(runtimeState.uniforms.uRhythmicDensity.value).toBeCloseTo(0.72);
  });

  it("treats missing rhythmicDensity as 0 without error", () => {
    const runtimeState = createRuntimeState();
    runtimeState.uniforms.uRhythmicDensity.value = 0.5;
    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 24,
        backboneSlots: new Float32Array([3, 4, 6, 0.5]),
        detailSlots: new Float32Array(32),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array(4),
        transientEnergy: 0,
        spectralCentroid: 0.2,
        spectralFlux: 0.1,
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0,
        pulseSignal: 0,
        debug: {},
      },
      1,
      1 / 60,
    );
    expect(runtimeState.uniforms.uRhythmicDensity.value).toBe(0);
  });

  it("keeps rhythmic density out of authorized responseEnvelope release", () => {
    const denseRuntime = createRuntimeState();
    const sparseRuntime = createRuntimeState();
    // Pre-charge both envelopes equally
    denseRuntime.responseEnvelope = 0.7;
    sparseRuntime.responseEnvelope = 0.7;

    const baseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 24,
      backboneSlots: new Float32Array([3, 4, 6, 0.5]),
      detailSlots: new Float32Array(32),
      backboneSpectralMomentSlots: new Float32Array(32),
      detailSpectralMomentSlots: new Float32Array(32),
      bandEnergies: new Float32Array(4),
      transientEnergy: 0,
      spectralCentroid: 0.2,
      spectralFlux: 0.1,
      structureSignal: 0,
      energySignal: 0,
      changeSignal: 0,
      pulseSignal: 0,
      modalResponseRenderSourceCoupledEnergy: 0.16,
      debug: {},
    };

    tickRaymarchRuntime(
      denseRuntime,
      { ...baseFrame, rhythmicDensity: 1.0 },
      1,
      1 / 60,
    );
    tickRaymarchRuntime(
      sparseRuntime,
      { ...baseFrame, rhythmicDensity: 0.0 },
      1,
      1 / 60,
    );

    expect(denseRuntime.responseEnvelope).toBeCloseTo(
      sparseRuntime.responseEnvelope,
      6,
    );
    expect(denseRuntime.uniforms.uRhythmicDensity.value).toBe(1);
    expect(sparseRuntime.uniforms.uRhythmicDensity.value).toBe(0);
  });

  it("keeps observer sheet width fixed while accent and beat envelopes release independently", () => {
    const runtimeState = createRuntimeState();
    runtimeState.responseEnvelope = 0.24;
    runtimeState.accentEnvelope = 0.18;
    runtimeState.beatPulseEnvelope = 0.12;
    const baselineResponse = runtimeState.responseEnvelope;
    const baselineAccent = runtimeState.accentEnvelope;
    const baselineBeat = runtimeState.beatPulseEnvelope;
    runtimeState.performanceProfile = "max-quality";

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 48,
        dominantFrequency: 3520,
        backboneSlots: new Float32Array([3, 4, 6, 0.8]),
        detailSlots: new Float32Array([4, 5, 5, 0.42]),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.46, 0.31, 0.18, 0.08]),
        transientEnergy: 0.96,
        spectralCentroid: 0.34,
        spectralFlux: 0.88,
        structureSignal: 0.72,
        energySignal: 0.68,
        changeSignal: 1,
        pulseSignal: 1,
        beatDetected: true,
        beatStrength: 1,
        beatConfidence: 0.92,
        debug: {},
      },
      1,
      1 / 60,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observerSheetFwhmWorld,
    ).toBe(CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld);

    const transientResponse = runtimeState.responseEnvelope;
    const transientAccent = runtimeState.accentEnvelope;
    const transientBeat = runtimeState.beatPulseEnvelope;
    const transientStrength = runtimeState.bloomTuning.effectiveStrength;
    const transientRadius = runtimeState.bloomTuning.effectiveRadius;
    const transientThreshold = runtimeState.bloomTuning.effectiveThreshold;

    expect(transientResponse).toBeGreaterThan(baselineResponse);
    expect(transientAccent).toBeGreaterThan(baselineAccent);
    expect(transientBeat).toBeGreaterThan(baselineBeat);

    runtimeState.performanceProfile = "auto";
    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 28,
        dominantFrequency: 55,
        backboneSlots: new Float32Array([3, 4, 6, 0.02]),
        detailSlots: new Float32Array([4, 5, 5, 0.01]),
        backboneSpectralMomentSlots: new Float32Array(32),
        detailSpectralMomentSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.22, 0.14, 0.08, 0.03]),
        transientEnergy: 0.04,
        spectralCentroid: 0.26,
        spectralFlux: 0.03,
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0,
        pulseSignal: 0,
        beatDetected: false,
        beatStrength: 0,
        beatConfidence: 0,
        debug: {},
      },
      1.016,
      1 / 60,
    );

    const responseDropFraction =
      (transientResponse - runtimeState.responseEnvelope) / transientResponse;
    const accentDropFraction =
      (transientAccent - runtimeState.accentEnvelope) / transientAccent;
    const beatDropFraction =
      (transientBeat - runtimeState.beatPulseEnvelope) / transientBeat;

    expect(responseDropFraction).toBeGreaterThan(0.04);
    expect(accentDropFraction).toBeGreaterThan(0.15);
    expect(beatDropFraction).toBeGreaterThan(0.11);
    expect(accentDropFraction).toBeGreaterThan(responseDropFraction);
    expect(beatDropFraction).toBeGreaterThan(responseDropFraction);
    expect(runtimeState.bloomTuning.effectiveStrength).toBe(transientStrength);
    expect(runtimeState.bloomTuning.effectiveRadius).toBe(transientRadius);
    expect(runtimeState.bloomTuning.effectiveThreshold).toBe(
      transientThreshold,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observerSheetFwhmWorld,
    ).toBe(CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld);
  });

  it("keeps shader beat phase continuous through weak mid-cycle retriggers", () => {
    const runtimeState = createRuntimeState();
    const baseFrame = createActiveFeatureFrame({
      estimatedTempo: 120,
      tempoConfidence: 0.72,
      beatPhase: 0.72,
      beatDetected: false,
      beatStrength: 0,
      beatConfidence: 0,
    });

    tickRaymarchRuntime(runtimeState, baseFrame, 1, 1 / 60);
    expect(runtimeState.uniforms.uBeatPhase.value).toBeCloseTo(0.72);

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        estimatedTempo: 120,
        tempoConfidence: 0.1,
        beatPhase: 0.05,
        beatDetected: true,
        beatStrength: 0.34,
        beatConfidence: 0.1,
      }),
      1 + 1 / 60,
      1 / 60,
    );

    expect(runtimeState.uniforms.uBeatPhase.value).toBeGreaterThan(0.72);
    expect(runtimeState.uniforms.uBeatPhase.value).toBeLessThan(0.8);
  });

  it("allows confident beat phase to wrap at a real beat", () => {
    const runtimeState = createRuntimeState();

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        estimatedTempo: 120,
        tempoConfidence: 0.9,
        beatPhase: 0.97,
        beatDetected: false,
        beatStrength: 0,
        beatConfidence: 0,
      }),
      1,
      1 / 60,
    );

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        estimatedTempo: 120,
        tempoConfidence: 0.95,
        beatPhase: 0.02,
        beatDetected: true,
        beatStrength: 1,
        beatConfidence: 0.95,
      }),
      1 + 1 / 60,
      1 / 60,
    );

    expect(runtimeState.uniforms.uBeatPhase.value).toBeLessThan(0.08);
  });

  it("separates normalized modal-energy topology from raw amplitude drive", () => {
    const runtimeState = createRuntimeState();
    const legacyFrame = createActiveFeatureFrame();
    const packetFrame = {
      ...legacyFrame,
      topologyRevision: 1,
      modalIdentitySlots: legacyFrame.modalIdentitySlots,
      modalCoefficientSlots: legacyFrame.modalCoefficientSlots,
      backboneSlots: undefined,
      detailSlots: undefined,
    };
    const coefficients = packetFrame.modalCoefficientSlots;

    tickRaymarchRuntimeBase(runtimeState, packetFrame, 1, 1 / 60);

    expect(
      Array.from(runtimeState.modalFieldModeBuffer.value.array.slice(0, 8)),
    ).toEqual([4, 5, 5, 1, 3, 4, 6, 1]);
    const coefficientPacket =
      runtimeState.modalFieldCoefficientBuffer.value.array;
    const observedShapeNorm = Math.sqrt(
      runtimeState.radiationPotentialCoefficientFrame.normalizedEnergySum,
    );
    expect(observedShapeNorm).toBeCloseTo(1, 6);
    const normalizedShape = Array.from(coefficientPacket.slice(0, 8));
    const initialObservedCoefficientNorm =
      runtimeState.radiationPotentialCoefficientFrame.observedCoefficientNorm;
    const initialExposureDrive =
      runtimeState.radiationPotentialCoefficientFrame.exposureDrive;
    const initialStructuralProjectionDrive =
      runtimeState.raymarchStructuralProjection.projectionEnergyDrive;
    const initialUploadCounters = {
      ...runtimeState.raymarchUploadState.counters,
    };
    expect(
      runtimeState.debugSnapshot.radiationPotentialObservedCoefficientNorm,
    ).toBeCloseTo(initialObservedCoefficientNorm, 6);
    expect(
      runtimeState.debugSnapshot.radiationPotentialNormalizedEnergyNorm,
    ).toBeCloseTo(1, 12);
    expect(
      runtimeState.debugSnapshot.radiationPotentialExposureDrive,
    ).toBeCloseTo(initialExposureDrive, 6);
    expect(
      Object.keys(runtimeState.debugSnapshot).some(
        (key) =>
          (key.startsWith("radiationPotential") ||
            key.startsWith("directOptical")) &&
          key.toLowerCase().includes("phase"),
      ),
    ).toBe(false);
    expect(runtimeState.uniforms).not.toHaveProperty(
      "uRadiationPotentialExposureDrive",
    );

    runtimeState.modalFieldModeBuffer.value.needsUpdate = false;
    runtimeState.modalFieldCoefficientBuffer.value.needsUpdate = false;
    coefficients[0] *= 0.25;
    coefficients[1] *= 0.25;
    tickRaymarchRuntimeBase(runtimeState, packetFrame, 1, 1 / 60);

    expect(runtimeState.modalFieldModeBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.modalFieldCoefficientBuffer.value.needsUpdate).toBe(
      false,
    );
    expect(
      Array.from(
        runtimeState.modalFieldCoefficientBuffer.value.array.slice(0, 8),
      ),
    ).toEqual(normalizedShape);
    expect(
      runtimeState.radiationPotentialCoefficientFrame.observedCoefficientNorm,
    ).toBeCloseTo(initialObservedCoefficientNorm, 6);
    expect(
      runtimeState.debugSnapshot.radiationPotentialObservedCoefficientNorm,
    ).toBeCloseTo(initialObservedCoefficientNorm, 6);
    expect(
      runtimeState.debugSnapshot.radiationPotentialNormalizedEnergyNorm,
    ).toBeCloseTo(1, 12);
    expect(
      runtimeState.debugSnapshot.radiationPotentialExposureDrive,
    ).toBeCloseTo(initialExposureDrive, 6);
    expect(runtimeState.raymarchUploadState.counters).toEqual(
      initialUploadCounters,
    );

    packetFrame.frameId += 1;
    tickRaymarchRuntimeBase(runtimeState, packetFrame, 1, 1 / 60);

    expect(runtimeState.modalFieldModeBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.modalFieldCoefficientBuffer.value.needsUpdate).toBe(
      false,
    );
    expect(
      runtimeState.radiationPotentialCoefficientFrame.observedCoefficientNorm,
    ).toBeCloseTo(initialObservedCoefficientNorm * 0.25, 6);
    expect(
      runtimeState.debugSnapshot.radiationPotentialExposureDrive,
    ).toBeLessThan(initialExposureDrive);
    expect(
      runtimeState.raymarchStructuralProjection.projectionEnergyDrive,
    ).toBeLessThan(initialStructuralProjectionDrive);

    runtimeState.modalFieldCoefficientBuffer.value.needsUpdate = false;
    coefficients[1] *= 2;
    packetFrame.frameId += 1;
    tickRaymarchRuntimeBase(runtimeState, packetFrame, 1, 1 / 60);

    expect(runtimeState.modalFieldCoefficientBuffer.value.needsUpdate).toBe(
      true,
    );
  });
});
