import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import {
  createRaymarchSceneRoot,
  resolveRaymarchTotalSlotAmplitude,
  sumUploadedModalFieldAmplitude,
  tickRaymarchRuntime as tickRaymarchRuntimeBase,
} from "./runtime.js";
import {
  buildRaymarchModalBasisCacheDescriptor,
  createRaymarchLiveFieldProjectionCache,
  createRaymarchModalBasisCache,
  createRaymarchSpectralLightCache,
  RAYMARCH_MODAL_BASIS_CACHE_CAPACITY,
  STRUCTURAL_PROJECTION_REFERENCE_ENERGY,
  resolveRaymarchModalBasisCacheDrawableAuthority,
  shouldRebuildRaymarchModalBasisCache,
} from "./fieldCache.js";
import { RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES } from "./material.js";
import {
  OBSERVATION_TRANSFER_REFERENCE,
  deriveObservationTransferParameters,
} from "./observationTransfer.js";
import { RAYMARCH_QUANTITY_LEDGER_VERSION } from "./quantityLedger.js";
import {
  deriveLowStepBloomGuard,
  deriveStepCompensation,
  STEP_REFERENCE,
} from "./stepStability.js";

function createRuntimeState({ withFieldCache = false } = {}) {
  const modalBasisCache = withFieldCache
    ? createRaymarchModalBasisCache({ resolution: 16 })
    : null;
  const spectralLightCache = withFieldCache
    ? createRaymarchSpectralLightCache({ resolution: 16 })
    : null;
  const liveFieldProjectionCache = withFieldCache
    ? createRaymarchLiveFieldProjectionCache({ resolution: 16 })
    : null;
  const materialCache = withFieldCache
    ? {
        neumann: {
          off: { steps: 64 },
          cached: { steps: 64 },
        },
        dirichlet: {
          off: { steps: 64 },
          cached: { steps: 64 },
        },
      }
    : null;
  return {
    modalFieldModeBuffer: {
      value: {
        array: new Float32Array(64),
        needsUpdate: false,
      },
    },
    modalFieldColorBuffer: {
      value: {
        array: new Float32Array(64),
        needsUpdate: false,
      },
    },
    modalFieldPhaseBuffer: {
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
    backboneColorBuffer: {
      value: {
        array: new Float32Array(32),
        needsUpdate: false,
      },
    },
    detailColorBuffer: {
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
      uThreshold: { value: 0.045 },
      uBoundaryMode: { value: 1 },
      uTransientEnergy: { value: 0 },
      uSpectralCentroid: { value: 0 },
      uSpectralFlux: { value: 0 },
      uSpectralMix: { value: 0.65 },
      uBandEnergies: { value: new THREE.Vector4() },
      uDensityGain: { value: 2.8 },
      uAbsorption: { value: 1.8 },
      uDensityAbsorption: { value: 2.8 * 1.8 },
      uOpacityGain: { value: 1.05 },
      uContourSharpness: { value: 6.6 },
      uRimBloomBias: { value: 0.5 },
      uRimCompression: { value: 0.48 },
      uHolographicIntensity: { value: 0.45 },
      uHolographicShift: { value: 0.35 },
      uHolographicFresnelPower: { value: 3.2 },
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
      uKeyTint: { value: { setHSL: () => {} } },
      uKeyTintStrength: { value: 0 },
      uKeyMode: { value: 0 },
      uTrebleBroadbandEnergy: { value: 0 },
      uModeCoherence: { value: 0 },
      uTotalSlotAmplitude: { value: 0 },
      uStructuralProjectionDrive: { value: 0 },
      uStructuralProjectionConcentration: { value: 0 },
      uModalResponseEnergy: { value: 0 },
      uLiveFieldCacheActive: { value: 0 },
      uObservationDensityFadeStart: { value: 0 },
      uObservationDensityFadeEnd: { value: 0 },
      uObservationTransferGain: { value: 0 },
      uObservationDensityFloor: { value: 0 },
      uObservationContourSupportScale: { value: 0 },
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
      reactivity: 1,
      motionAmount: 1,
    },
    bloomTuning: {
      bloomResponseBias: 0.4,
      stepReference: STEP_REFERENCE,
      stepCompensation: deriveStepCompensation(64),
      lowStepBloomGuard: deriveLowStepBloomGuard(64),
      effectiveStrength: 0.11,
      effectiveRadius: 0.09,
      effectiveThreshold: 0.44,
    },
    baseDensityGain: 2.8,
    baseThreshold: 0.045,
    baseContourSharpness: 6.6,
    responseEnvelope: 0,
    accentEnvelope: 0,
    beatPulseEnvelope: 0,
    keyHue: 0,
    keyModeSmooth: 0,
    motionSignal: 0,
    scaleSignal: 0,
    bloomResponseSignal: 0,
    volumeMesh: {
      visible: false,
      material: withFieldCache
        ? materialCache.neumann.off
        : {
            steps: 64,
          },
      userData: withFieldCache
        ? {
            raymarchMaterialCache: materialCache,
            raymarchBoundaryMode: "neumann",
            raymarchSpectralLightEvaluationMode:
              RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
            raymarchCavityGeometry: "rectangular",
            raymarchModalBasisAtlasTexture: modalBasisCache.texture,
            raymarchModalLiveFieldTexture:
              liveFieldProjectionCache.fieldTexture,
            raymarchModalLiveSupportTexture:
              liveFieldProjectionCache.supportTexture,
          }
        : undefined,
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
      avgSilhouetteSuppression: 0,
    },
    auditEnabled: true,
    modalBasisCache,
    liveFieldProjectionCache,
    spectralLightCache,
    requestedCavityGeometry: "rectangular",
    effectiveCavityGeometry: "rectangular",
    debugSnapshot: null,
  };
}

async function flushMicrotasks(count = 3) {
  for (let i = 0; i < count; i += 1) {
    await Promise.resolve();
  }
}

function getTestComputeNodeKey(runtimeState, cavityGeometry = "rectangular") {
  const modalFieldCapacity =
    runtimeState?.modalFieldCapacity ??
    Math.floor(
      (runtimeState?.modalFieldModeBuffer?.value?.array?.length ?? 0) / 4,
    );
  return `${cavityGeometry}:neumann:capacity=${Math.max(
    1,
    Math.round(modalFieldCapacity || 0),
  )}`;
}

function getTestEffectiveComputeNodeKey(
  runtimeState,
  cavityGeometry = "rectangular",
) {
  const basisCapacity =
    runtimeState?.modalBasisCache?.basisCapacity ??
    runtimeState?.modalFieldCapacity ??
    Math.floor(
      (runtimeState?.modalFieldModeBuffer?.value?.array?.length ?? 0) / 4,
    );
  return `${cavityGeometry}:neumann:capacity=${Math.max(
    1,
    Math.round(basisCapacity || 0),
  )}`;
}

function seedRuntimeCacheNodes(runtimeState) {
  if (runtimeState.modalBasisCache) {
    runtimeState.modalBasisCache.computeNodesByKey[
      getTestEffectiveComputeNodeKey(runtimeState)
    ] = {
      id: "field",
    };
  }
  if (runtimeState.spectralLightCache) {
    runtimeState.spectralLightCache.computeNodesByKey[
      getTestComputeNodeKey(runtimeState)
    ] = {
      id: "spectral",
    };
  }
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
  targetColorSlots,
  targetMetadataSlots,
  sourceSlots,
  sourcePhaseSlots,
  sourceColorSlots,
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
    targetColorSlots.set(
      sourceColorSlots?.slice(offset, offset + 4) ?? new Float32Array(4),
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

function withUnifiedModalFields(frame) {
  if (!frame) return frame;
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
    return frame;
  }
  const activeBackboneModeCount =
    frame.activeBackboneModeCount ?? countActiveSlots(frame.backboneSlots);
  const activeDetailModeCount =
    frame.activeDetailModeCount ?? countActiveSlots(frame.detailSlots);
  const candidateCount = activeBackboneModeCount + activeDetailModeCount;
  const modalFieldSlots = new Float32Array(candidateCount * 4);
  const modalFieldPhaseSlots = new Float32Array(candidateCount * 4);
  const modalFieldColorSlots = new Float32Array(candidateCount * 4);
  const modalFieldMetadataSlots = new Float32Array(candidateCount * 4);
  let writeIndex = appendMetadataSlots({
    targetSlots: modalFieldSlots,
    targetPhaseSlots: modalFieldPhaseSlots,
    targetColorSlots: modalFieldColorSlots,
    targetMetadataSlots: modalFieldMetadataSlots,
    sourceSlots: frame.backboneSlots,
    sourcePhaseSlots: frame.backbonePhaseSlots,
    sourceColorSlots: frame.backboneColorSlots,
    writeIndex: 0,
  });
  writeIndex = appendMetadataSlots({
    targetSlots: modalFieldSlots,
    targetPhaseSlots: modalFieldPhaseSlots,
    targetColorSlots: modalFieldColorSlots,
    targetMetadataSlots: modalFieldMetadataSlots,
    sourceSlots: frame.detailSlots,
    sourcePhaseSlots: frame.detailPhaseSlots,
    sourceColorSlots: frame.detailColorSlots,
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
  frame.modalFieldColorSlots = modalFieldColorSlots;
  frame.modalFieldMetadataSlots = modalFieldMetadataSlots;
  return frame;
}

function tickRaymarchRuntime(runtimeState, featureFrame, ...args) {
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
    backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
    detailColorSlots: new Float32Array([0.2, 0.5, 1, 0.5]),
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

function makeColorSlots(count) {
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
  it("does not own envelope-derived display radiance limiting", () => {
    const source = readFileSync(
      new URL("./runtime.js", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("compressDisplayRadiance");
    expect(source).not.toContain("deriveBloomRadianceScale");
    expect(source).not.toContain("DISPLAY_RADIANCE_DEFAULTS");
    expect(source).not.toMatch(
      /display(?:Bloom|Highlight|Radiance).*(?:responseEnvelope|accentEnvelope|bloomResponseSignal)/s,
    );
  });

  it("keeps contour sharpness out of runtime audiovisual reactivity", () => {
    const source = readFileSync(
      new URL("./runtime.js", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("contourSignal");
    expect(source).not.toContain("CONTOUR_RESPONSE_GAIN");
    expect(source).not.toMatch(
      /uContourSharpness\.value\s*=\s*clamp\(\s*baseContourSharpness\s*\+/s,
    );
  });

  it("builds runtime uploads and cache descriptors from one modal field signature", () => {
    const source = readFileSync(
      new URL("./runtime.js", import.meta.url),
      "utf8",
    );

    expect(source).toContain("modalFieldModeBuffer");
    expect(source).toContain("modalFieldColorBuffer");
    expect(source).toContain("modalFieldPhaseBuffer");
    expect(source).toContain("applyLayerUploadIfChanged({");
    expect(source).toContain('key: "modalField"');
    expect(source).toContain("uModalFieldModeCount");
    expect(source).not.toContain("backboneSignature");
    expect(source).not.toContain("detailSignature");
    expect(source).not.toContain("uBackboneModeCount");
    expect(source).not.toContain("uDetailModeCount");
    expect(source).not.toContain("DETAIL_LAYER_WEIGHT");
  });

  it("centralizes live modal uploads and cache submission behind runtime authority", () => {
    const source = readFileSync(
      new URL("./runtime.js", import.meta.url),
      "utf8",
    );
    const authorityIndex = source.indexOf(
      "function applyRaymarchRuntimeUploadAuthority",
    );
    const uniformIndex = source.indexOf(
      "setIfChanged(uniforms.uAverageAmplitude",
    );

    expect(authorityIndex).toBeGreaterThanOrEqual(0);
    expect(source).toContain("applyRaymarchRuntimeUploadAuthority({");
    expect(source).toContain("updateRaymarchEvaluationModes(");
    expect(source).toContain("runtimeState.currentModalBasisCacheDescriptor");
    expect(authorityIndex).toBeLessThan(uniformIndex);
  });

  it("uploads admitted modes up to the product basis-atlas page budget", () => {
    const runtimeState = createRuntimeState();
    runtimeState.modalFieldCapacity = 20;
    runtimeState.modalFieldPhaseCapacity = 20;
    runtimeState.modalFieldModeBuffer.value.array = new Float32Array(80);
    runtimeState.modalFieldColorBuffer.value.array = new Float32Array(80);
    runtimeState.modalFieldPhaseBuffer.value.array = new Float32Array(80);
    const featureFrame = createActiveFeatureFrame({
      backboneSlots: makeModeSlots(10, (index) => (index === 0 ? 1 : 0.08)),
      detailSlots: makeModeSlots(10, (index) => (index === 0 ? 0.9 : 0.06), 10),
      backboneColorSlots: makeColorSlots(10),
      detailColorSlots: makeColorSlots(10),
      backbonePhaseSlots: makePhaseSlots(10),
      detailPhaseSlots: makePhaseSlots(10),
      activeBackboneModeCount: 10,
      activeDetailModeCount: 10,
      activeModeCount: 20,
      modalPhaseAuthority: 1,
    });

    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);

    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(
      RAYMARCH_MODAL_BASIS_CACHE_CAPACITY,
    );
    expect(runtimeState.modalBasisPhaseAuthorityModeCount).toBe(
      RAYMARCH_MODAL_BASIS_CACHE_CAPACITY,
    );
    expect(runtimeState.currentModalDescriptor).toMatchObject({
      capacity: {
        maxTotalModes: 20,
      },
      counts: {
        validModeCount: 20,
        modalFieldModeCount: 20,
      },
      diagnostics: {
        descriptorOverflow: false,
      },
    });
    expect(
      runtimeState.performanceGovernor.modalField.selectedIndices,
    ).toBeUndefined();
  });

  it("keeps modal-basis mode count owned by contributing modal terms", () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0;
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const featureFrame = createActiveFeatureFrame({
      backboneSlots: new Float32Array([1, 1, 1, 0.6, 2, 2, 2, 0.4]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array(8),
      detailPhaseSlots: new Float32Array(0),
      backboneColorSlots: new Float32Array(8),
      detailColorSlots: new Float32Array(0),
      activeBackboneModeCount: 2,
      activeDetailModeCount: 0,
      activeModeCount: 2,
      modalPhaseAuthority: 0,
    });

    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60, renderer);

    expect(runtimeState.modalBasisPhaseAuthorityModeCount).toBe(0);
    expect(runtimeState.currentModalBasisCacheDescriptor.phaseModeCount).toBe(
      0,
    );
    expect(
      runtimeState.currentModalBasisCacheDescriptor
        .contributingBasisPageModeCount,
    ).toBe(2);
    expect(runtimeState.debugSnapshot.modalBasisCacheModeCount).toBe(2);
    expect(
      runtimeState.debugSnapshot.modalDescriptorPhaseAuthorityModeCount,
    ).toBe(0);
  });

  it("blocks complete field authority when descriptor capacity overflows", () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    runtimeState.modalFieldCapacity = 4;
    runtimeState.modalFieldPhaseCapacity = 4;
    runtimeState.modalFieldModeBuffer.value.array = new Float32Array(16);
    runtimeState.modalFieldColorBuffer.value.array = new Float32Array(16);
    runtimeState.modalFieldPhaseBuffer.value.array = new Float32Array(16);
    runtimeState.modalBasisCache.contributingBasisPageModeCount = 2;
    runtimeState.modalBasisCache.contributingRawModalEnergy = 0.8;
    runtimeState.modalBasisCache.bandwidthRejectedModeCount = 1;
    runtimeState.modalBasisCache.bandwidthRejectedRawModalEnergy = 0.4;
    runtimeState.modalBasisCache.liveSynthesisRawGradientEnvelope = 3.1;
    runtimeState.uniforms.uTotalSlotAmplitude.value = 0.9;
    runtimeState.uniforms.uStructuralProjectionDrive.value = 0.8;
    runtimeState.uniforms.uStructuralProjectionConcentration.value = 0.7;
    const featureFrame = createActiveFeatureFrame({
      backboneSlots: makeModeSlots(3, () => 0.4),
      detailSlots: makeModeSlots(3, () => 0.35, 10),
      backboneColorSlots: makeColorSlots(3),
      detailColorSlots: makeColorSlots(3),
      backbonePhaseSlots: makePhaseSlots(3),
      detailPhaseSlots: makePhaseSlots(3),
      activeBackboneModeCount: 3,
      activeDetailModeCount: 3,
      activeModeCount: 6,
      modalPhaseAuthority: 1,
    });

    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);

    expect(
      runtimeState.currentModalDescriptor.diagnostics.descriptorOverflow,
    ).toBe(true);
    expect(runtimeState.currentModalDescriptor.fieldAuthority).toBe("blocked");
    expect(runtimeState.debugSnapshot.modalDescriptorOverflow).toBe(true);
    expect(runtimeState.debugSnapshot.modalDescriptorFieldAuthority).toBe(
      "blocked",
    );
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(0);
    expect(runtimeState.uniforms.uTotalSlotAmplitude.value).toBe(0);
    expect(runtimeState.uniforms.uStructuralProjectionDrive.value).toBe(0);
    expect(runtimeState.uniforms.uStructuralProjectionConcentration.value).toBe(
      0,
    );
    expect(runtimeState.debugSnapshot.totalSlotAmplitude).toBe(0);
    expect(runtimeState.debugSnapshot.structuralProjectionDrive).toBe(0);
    expect(runtimeState.debugSnapshot.structuralProjectionConcentration).toBe(
      0,
    );
    expect(
      runtimeState.debugSnapshot.modalBasisCacheBandwidthRejectedModeCount,
    ).toBe(0);
    expect(
      runtimeState.debugSnapshot.modalBasisCacheBandwidthRejectedRawModalEnergy,
    ).toBe(0);
    expect(
      runtimeState.debugSnapshot.modalBasisCacheContributingRawModalEnergy,
    ).toBe(0);
    expect(runtimeState.debugSnapshot.liveSynthesisRawGradientEnvelope).toBe(0);
  });

  it("creates a self-lit scene root with weak symmetric fill lights", () => {
    const volumeMesh = new THREE.Mesh();
    const idleOverlay = new THREE.LineSegments();
    const { root, visualRoot, sceneLighting } = createRaymarchSceneRoot({
      volumeMesh,
      idleOverlay,
      radius: 3,
    });

    expect(root.children).toContain(visualRoot);
    expect(root.children.filter((child) => child.isLight)).toHaveLength(2);
    expect(sceneLighting.primary.intensity).toBeCloseTo(0.9);
    expect(sceneLighting.secondary.intensity).toBeCloseTo(0.9);
    expect(sceneLighting.primary.position.x).toBeCloseTo(3 * 1.15);
    expect(sceneLighting.secondary.position.x).toBeCloseTo(-3 * 1.15);
    expect(sceneLighting.primary.position.y).toBeCloseTo(3 * 0.85);
    expect(sceneLighting.secondary.position.y).toBeCloseTo(3 * 0.85);
    expect(sceneLighting.primary.position.z).toBeCloseTo(3 * 1.8);
    expect(sceneLighting.secondary.position.z).toBeCloseTo(3 * 1.8);
  });

  it("writes unified modal field slots and modulation metrics into the runtime", () => {
    const runtimeState = createRuntimeState();
    const featureFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 48,
      backboneSlots: new Float32Array([3, 4, 6, 0.8, 1, 3, 7, 0.6]),
      detailSlots: new Float32Array([4, 5, 5, 0.55, 2, 2, 6, 0.4]),
      backboneColorSlots: new Float32Array([
        1, 0.1, 0.1, 0.9, 0.8, 0.2, 0.1, 0.7,
      ]),
      detailColorSlots: new Float32Array([0.2, 0.5, 1, 0.5, 0.7, 0.2, 1, 0.45]),
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
        projectionEnergyBudgetSourceCoupled: 0.74,
        projectionEnergyBudgetResonant: 0.36,
        projectionEnergyUsedSourceCoupled: 0.52,
        projectionEnergyUsedResonant: 0.31,
        projectionCompetitionReduction: 0.18,
        projectionLoad: 0.72,
        projectionHighQProtection: 0.09,
        projectionEnergyNormalizationApplied: true,
        projectionRawEnergySourceCoupled: 0.68,
        projectionRawEnergyResonant: 0.57,
        projectionAllocatedEnergySourceCoupled: 0.52,
        projectionAllocatedEnergyResonant: 0.31,
        projectionEnergyScaleSourceCoupled: 0.76,
        projectionEnergyScaleResonant: 0.54,
        projectionOverlapPressureSourceCoupled: 0.23,
        projectionOverlapPressureResonant: 0.41,
      },
    };

    tickRaymarchRuntime(runtimeState, featureFrame, 12.5, 1 / 60);

    expect(
      Array.from(
        runtimeState.modalFieldModeBuffer.value.array.slice(0, 16),
      ).map((value) => Number(value.toFixed(6))),
    ).toEqual([3, 4, 6, 0.8, 1, 3, 7, 0.6, 4, 5, 5, 0.55, 2, 2, 6, 0.4]);
    expect(runtimeState.modalFieldColorBuffer.value.array[10]).toBeCloseTo(1);
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(4);
    expect(runtimeState.uniforms.uTransientEnergy.value).toBe(0.7);
    expect(runtimeState.uniforms.uSpectralCentroid.value).toBe(0.42);
    expect(runtimeState.uniforms.uSpectralFlux.value).toBe(0.28);
    expect(runtimeState.uniforms.uThreshold.value).toBeLessThan(0.045);
    expect(runtimeState.uniforms.uContourSharpness.value).toBe(6.6);
    expect(runtimeState.responseEnvelope).toBeGreaterThan(0);
    expect(runtimeState.scaleSignal).toBeGreaterThan(0);
    expect(runtimeState.bloomResponseSignal).toBeGreaterThan(0);
    expect(runtimeState.visualRoot.scale.x).toBe(1);
    expect(runtimeState.uniforms.uModeCoherence.value).toBeCloseTo(0.58);
    expect(runtimeState.uniforms.uModalResponseEnergy.value).toBeCloseTo(0.37);
    // The tick applies a loudness-aware visibility-drive compensation, so the
    // expected parameters must use the same smoothed drive the tick produced.
    const observationParameters = deriveObservationTransferParameters({
      opacityGain: runtimeState.uniforms.uOpacityGain.value,
      stepCompensation: runtimeState.bloomTuning.stepCompensation,
      contourSharpness: runtimeState.uniforms.uContourSharpness.value,
      visibilityDrive: runtimeState.visibilityDriveEnvelope,
    });
    expect(runtimeState.visibilityDriveEnvelope).toBeGreaterThan(0);
    expect(
      runtimeState.uniforms.uObservationDensityFadeStart.value,
    ).toBeCloseTo(observationParameters.densityFadeStart);
    expect(runtimeState.uniforms.uObservationDensityFadeEnd.value).toBeCloseTo(
      observationParameters.densityFadeEnd,
    );
    expect(runtimeState.uniforms.uObservationTransferGain.value).toBeCloseTo(
      observationParameters.transferGain,
    );
    expect(runtimeState.uniforms.uObservationDensityFloor.value).toBeCloseTo(
      observationParameters.densityFloor,
    );
    expect(observationParameters.densityFloor).toBeCloseTo(
      OBSERVATION_TRANSFER_REFERENCE.densityFloor,
    );
    expect(
      runtimeState.uniforms.uObservationContourSupportScale.value,
    ).toBeCloseTo(observationParameters.contourSupportScale);
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
    expect(runtimeState.uniforms.uStructuralProjectionDrive.value).toBeCloseTo(
      expectedProjectionDrive,
    );
    expect(
      runtimeState.uniforms.uStructuralProjectionConcentration.value,
    ).toBeCloseTo(expectedStructuralEnergy / (2.35 * 2.35));
    const [sub, lowMid, highMid, air] =
      runtimeState.uniforms.uBandEnergies.value.toArray();
    expect(sub).toBeCloseTo(0.4);
    expect(lowMid).toBeCloseTo(0.3);
    expect(highMid).toBeCloseTo(0.2);
    expect(air).toBeCloseTo(0.1);
    expect(runtimeState.volumeMesh.visible).toBe(false);
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
      runtimeState.debugSnapshot.raymarchDebug.renderedModalFieldColorWeightMax,
    ).toBeCloseTo(0.9);
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
      runtimeState.debugSnapshot.raymarchDebug.renderQuantityForbiddenConsumers
        .observedDensityFloor,
    ).toEqual(
      expect.arrayContaining(["highlightMask", "whiteEmissionFieldAuthority"]),
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.renderQuantityForbiddenConsumers
        .cancellationSuppression,
    ).toEqual(expect.arrayContaining(["whiteEmissionFieldAuthority"]));
    expect(
      runtimeState.debugSnapshot.raymarchDebug.materialProbePhysicalDensity,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .materialProbeCausticVisibleDensity,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .materialProbeSupportVisibleDensity,
    ).toBeGreaterThanOrEqual(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.materialProbePreBloomRadiance,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.materialProbePostBloomRisk,
    ).toBeGreaterThanOrEqual(
      runtimeState.debugSnapshot.raymarchDebug.materialProbePreBloomRadiance,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.materialProbeBloomAmplification,
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
      runtimeState.debugSnapshot.raymarchDebug.observationEnergy,
    ).toBeCloseTo(expectedProjectionDrive);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .projectionEnergyBudgetSourceCoupled,
    ).toBe(0.74);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionEnergyBudgetResonant,
    ).toBe(0.36);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .projectionEnergyUsedSourceCoupled,
    ).toBe(0.52);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionEnergyUsedResonant,
    ).toBe(0.31);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionCompetitionReduction,
    ).toBe(0.18);
    expect(runtimeState.debugSnapshot.raymarchDebug.projectionLoad).toBe(0.72);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionHighQProtection,
    ).toBe(0.09);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionConservationApplied,
    ).toBeUndefined();
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .projectionEnergyNormalizationApplied,
    ).toBe(true);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionRawEnergySourceCoupled,
    ).toBe(0.68);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionRawEnergyResonant,
    ).toBe(0.57);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .projectionAllocatedEnergySourceCoupled,
    ).toBe(0.52);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .projectionAllocatedEnergyResonant,
    ).toBe(0.31);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .projectionEnergyScaleSourceCoupled,
    ).toBe(0.76);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionEnergyScaleResonant,
    ).toBe(0.54);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .projectionOverlapPressureSourceCoupled,
    ).toBe(0.23);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .projectionOverlapPressureResonant,
    ).toBe(0.41);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationReferenceDensityFloor,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .observationReferenceContourSupport,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationDensityFadeStart,
    ).toBeCloseTo(observationParameters.densityFadeStart);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationDensityFadeEnd,
    ).toBeCloseTo(observationParameters.densityFadeEnd);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationTransferGain,
    ).toBeCloseTo(observationParameters.transferGain);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationDensityFloor,
    ).toBeCloseTo(observationParameters.densityFloor);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationContourSupportScale,
    ).toBeCloseTo(observationParameters.contourSupportScale);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationExposureScale,
    ).toBeCloseTo(observationParameters.exposureScale);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationFieldNoiseFloor,
    ).toBe(0);
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
    expect(runtimeState.debugSnapshot.raymarchDebug.rimBloomBias).toBe(0.5);
    expect(runtimeState.debugSnapshot.raymarchDebug.rimCompression).toBe(0.48);
    expect(runtimeState.debugSnapshot.raymarchDebug.holographicIntensity).toBe(
      0.45,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.holographicShift).toBe(
      0.35,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.holographicFresnelPower,
    ).toBe(3.2);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.avgSilhouetteSuppression,
    ).toBe(0);
    expect(runtimeState.debugSnapshot.raymarchDebug.bloomResponseBias).toBe(
      0.4,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveBloomStrength,
    ).toBeGreaterThan(0.11);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveBloomRadius,
    ).toBeLessThan(0.09);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveBloomThreshold,
    ).toBeGreaterThan(0.44);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveThreshold,
    ).toBeLessThan(0.045);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveContourSharpness,
    ).toBe(6.6);
    expect(runtimeState.debugSnapshot.raymarchDebug.sceneLightAsymmetry).toBe(
      0,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.bloomRisk).toBeGreaterThan(
      0,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.spectralMix).toBe(0.65);
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
      runtimeState.debugSnapshot.raymarchDebug.holographicReferenceStrength,
    ).toBeGreaterThan(0);
  });

  it("streams phase changes live without rebuilding modal-basis or Spectral Light caches", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const featureFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 32,
      backboneSlots: new Float32Array([3, 4, 6, 0.8, 1, 3, 7, 0.02]),
      detailSlots: new Float32Array([4, 5, 5, 0.55, 2, 2, 6, 0.01]),
      backbonePhaseSlots: new Float32Array([
        0.25, 0.14, 0.7, 0.5, 1.1, 0.9, 0.2, 0.02,
      ]),
      detailPhaseSlots: new Float32Array([
        -0.4, -0.21, 0.8, 0.64, 0.9, 0.6, 0.1, 0.01,
      ]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array(4),
      transientEnergy: 0.1,
      spectralCentroid: 0.2,
      spectralFlux: 0.1,
      structureSignal: 0.4,
      energySignal: 0.3,
      changeSignal: 0.08,
      pulseSignal: 0.05,
      modalPhaseAuthority: 0.5,
      debug: {},
    };

    tickRaymarchRuntime(runtimeState, featureFrame, 3, 1 / 60, renderer);
    await flushMicrotasks();
    tickRaymarchRuntime(runtimeState, featureFrame, 3, 1 / 60, renderer);
    await flushMicrotasks();
    const modalBasisCacheRebuildCount =
      runtimeState.modalBasisCache.rebuildCount;
    const modalBasisCacheDescriptor =
      runtimeState.modalBasisCache.activeDescriptor;
    const spectralRebuildCount = runtimeState.spectralLightCache.rebuildCount;
    const spectralDescriptor = runtimeState.spectralLightCache.activeDescriptor;

    featureFrame.backbonePhaseSlots = new Float32Array([
      1.2, -0.42, 0.8, 0.6, 0.1, 0.3, 0.2, 0.02,
    ]);
    featureFrame.detailPhaseSlots = new Float32Array([
      0.7, 0.25, 0.9, 0.7, -0.9, 0.1, 0.1, 0.01,
    ]);
    tickRaymarchRuntime(runtimeState, featureFrame, 3, 1 / 60, renderer);
    await flushMicrotasks();
    tickRaymarchRuntime(runtimeState, featureFrame, 3, 1 / 60, renderer);

    expect(runtimeState.modalBasisCache).toMatchObject({
      ready: true,
    });
    expect(runtimeState.modalBasisCache.rebuildCount).toBe(
      modalBasisCacheRebuildCount,
    );
    expect(runtimeState.modalBasisCache.activeDescriptor).toEqual(
      modalBasisCacheDescriptor,
    );
    expect(
      runtimeState.currentModalBasisCacheDescriptor.modalBasisCacheTopologyHash,
    ).toBe(modalBasisCacheDescriptor.modalBasisCacheTopologyHash);
    expect(
      runtimeState.currentModalBasisCacheDescriptor.liveModalPhaseHash,
    ).not.toBe(modalBasisCacheDescriptor.liveModalPhaseHash);
    expect(runtimeState.modalFieldPhaseBuffer.value.needsUpdate).toBe(true);
    expect(
      Array.from(
        runtimeState.modalFieldPhaseBuffer.value.array.slice(0, 16),
      ).some((value) => Math.abs(value - 1.2) < 1e-6),
    ).toBe(true);
    expect(runtimeState.spectralLightCache.activeDescriptor).toEqual(
      spectralDescriptor,
    );
    expect(runtimeState.spectralLightCache.rebuildCount).toBe(
      spectralRebuildCount,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.modalBasisCacheReady).toBe(
      true,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalBasisCacheRebuildPending,
    ).toBe(false);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalBasisCacheResolution,
    ).toBe(16);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalBasisCacheModeCount,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalBasisCacheSemantic,
    ).toBe("modal-basis-cache");
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalBasisCachePhaseAuthority,
    ).toBe(0.5);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalBasisCacheSupportReady,
    ).toBe(true);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalBasisCacheSupportSemantic,
    ).toBe("coefficient-invariant-basis-support");
    expect(
      runtimeState.debugSnapshot.raymarchDebug.liveSynthesisUnsignedSupportMean,
    ).toBeGreaterThanOrEqual(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .liveSynthesisCancellationRatioMean,
    ).toBeGreaterThanOrEqual(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .liveSynthesisCancellationRatioMax,
    ).toBeGreaterThanOrEqual(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .liveSynthesisSupportDiagnosticSampleCount,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .liveSynthesisSupportDiagnosticSupportedSampleCount,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .liveSynthesisSupportDiagnosticCoverage,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .liveSynthesisSupportDiagnosticCoverage,
    ).toBeLessThanOrEqual(1);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationSampledAnchor,
    ).toBeLessThanOrEqual(
      runtimeState.debugSnapshot.raymarchDebug.liveSynthesisUnsignedSupportMean,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationSampledAnchor,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationSampledSupport,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationSampledDensityFloor,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationSampledDensityFloor,
    ).toBeLessThanOrEqual(
      runtimeState.debugSnapshot.raymarchDebug.observationReferenceDensityFloor,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .modalBasisCacheZeroAmplitudeSkippedModeCount,
    ).toBe(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .modalBasisCacheDescriptorStaleReason,
    ).toBeNull();
    expect(runtimeState.debugSnapshot.raymarchDebug.modalBasisCacheActive).toBe(
      true,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "phaseCoherentFieldSemantic",
    );
    expect(runtimeState.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "phaseOverlaySemantic",
    );
    expect(runtimeState.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "signedPhaseOverlaySemantic",
    );
  });

  it("skips sampled support diagnostics when auditing is disabled", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.auditEnabled = false;
    runtimeState.uniforms.uSpectralMix.value = 0;
    const renderer = { computeAsync: vi.fn(async () => undefined) };
    const featureFrame = createActiveFeatureFrame({
      backboneSlots: new Float32Array([1, 1, 1, 0.9]),
      detailSlots: new Float32Array(0),
      backboneColorSlots: new Float32Array(4),
      detailColorSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      modalPhaseAuthority: 1,
    });

    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60, renderer);
    await flushMicrotasks();

    // Cache committed a rebuild, but the sampled-support audit never ran.
    expect(runtimeState.modalBasisCache.ready).toBe(true);
    expect(runtimeState.modalBasisCache.lastAuditDiagnostics).toBeNull();
    expect(runtimeState.modalBasisCache.liveSynthesisUnsignedSupportMean).toBe(
      0,
    );
    expect(
      runtimeState.modalBasisCache.liveSynthesisSupportDiagnosticSampleCount,
    ).toBe(0);
    expect(
      runtimeState.modalBasisCache.liveSynthesisSupportDiagnosticCoverage,
    ).toBe(0);
    expect(runtimeState.debugSnapshot).toBeNull();
  });

  it("builds internal render probe snapshots without publishing the audit overlay", async () => {
    const previousWindow = globalThis.window;
    globalThis.window = {};
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.auditEnabled = false;
    runtimeState.renderProbeEnabled = true;
    runtimeState.uniforms.uSpectralMix.value = 0;
    const renderer = { computeAsync: vi.fn(async () => undefined) };
    const featureFrame = createActiveFeatureFrame({
      backboneSlots: new Float32Array([1, 1, 1, 0.9]),
      detailSlots: new Float32Array(0),
      backboneColorSlots: new Float32Array(4),
      detailColorSlots: new Float32Array(0),
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
      expect(
        raymarchDebug.materialProbePreBloomRadiance,
      ).toBeGreaterThanOrEqual(0);
      expect(globalThis.window.__baryonAuditSnapshot).toBeUndefined();
      expect(runtimeState.modalBasisCache.lastAuditDiagnostics).toBeNull();
    } finally {
      globalThis.window = previousWindow;
    }
  });

  it("keeps modal-basis cache freshness independent of phase offsets", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0;
    runtimeState.modalBasisCache.computeNodesByKey[
      getTestEffectiveComputeNodeKey(runtimeState)
    ] = {
      id: "effective",
    };
    const renderer = {
      compute: vi.fn(),
      computeAsync: vi.fn(async () => undefined),
    };
    const baseFrame = createActiveFeatureFrame({
      backboneSlots: new Float32Array([3, 4, 6, 0.8, 1, 3, 7, 0.4]),
      detailSlots: new Float32Array([4, 5, 5, 0.55, 2, 2, 6, 0.3]),
      backbonePhaseSlots: new Float32Array([
        0.25, 1233.6, 0.8, 0.7, -0.4, 1744.6, 0.75, 0.6,
      ]),
      detailPhaseSlots: new Float32Array([
        0.6, 6928.9, 0.82, 0.64, -1.2, 7106.3, 0.78, 0.52,
      ]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      modalPhaseAuthority: 1,
    });
    const advancedCarrierFrame = {
      ...baseFrame,
      backbonePhaseSlots: new Float32Array([
        1.9, 1233.6, 0.8, 0.7, 2.1, 1744.6, 0.75, 0.6,
      ]),
      detailPhaseSlots: new Float32Array([
        -2.2, 6928.9, 0.82, 0.64, 1.4, 7106.3, 0.78, 0.52,
      ]),
    };

    tickRaymarchRuntime(runtimeState, baseFrame, 3, 1 / 60, renderer);
    await flushMicrotasks();
    const rebuildCount = runtimeState.modalBasisCache.rebuildCount;
    const activeDescriptor = runtimeState.modalBasisCache.activeDescriptor;

    tickRaymarchRuntime(
      runtimeState,
      advancedCarrierFrame,
      3.033,
      1 / 60,
      renderer,
    );
    await flushMicrotasks();

    expect(runtimeState.modalBasisCache.rebuildCount).toBe(rebuildCount);
    expect(runtimeState.modalBasisCache.queuedDescriptor).toBeNull();
    expect(runtimeState.modalBasisCache.pendingDescriptor).toBeNull();
    expect(runtimeState.modalBasisCache.activeDescriptor).toEqual(
      activeDescriptor,
    );
    expect(
      runtimeState.currentModalBasisCacheDescriptor.modalBasisCacheTopologyHash,
    ).toBe(activeDescriptor.modalBasisCacheTopologyHash);
    expect(
      runtimeState.currentModalBasisCacheDescriptor.liveModalPhaseHash,
    ).not.toBe(activeDescriptor.liveModalPhaseHash);
    expect(
      Array.from(
        runtimeState.modalFieldPhaseBuffer.value.array.slice(0, 16),
      ).some((value) => Math.abs(value - 2.1) < 1e-6),
    ).toBe(true);
  });

  it("keeps modal-basis cache freshness and structural coefficients independent of clock-only phase motion", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0;
    runtimeState.modalBasisCache.computeNodesByKey[
      getTestEffectiveComputeNodeKey(runtimeState)
    ] = {
      id: "effective",
    };
    const renderer = {
      compute: vi.fn(),
      computeAsync: vi.fn(async () => undefined),
    };
    const frame = createActiveFeatureFrame({
      backboneSlots: new Float32Array([3, 4, 6, 0.8, 1, 3, 7, 0.4]),
      detailSlots: new Float32Array([4, 5, 5, 0.55, 2, 2, 6, 0.3]),
      backbonePhaseSlots: new Float32Array([
        0.25, 0.6, 0.8, 0.7, -0.4, 0.45, 0.75, 0.6,
      ]),
      detailPhaseSlots: new Float32Array([
        0.6, 0.35, 0.82, 0.64, -1.2, 0.25, 0.78, 0.52,
      ]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      modalPhaseAuthority: 1,
    });

    tickRaymarchRuntime(runtimeState, frame, 3, 1 / 60, renderer);
    await flushMicrotasks();
    const rebuildCount = runtimeState.modalBasisCache.rebuildCount;
    const activeDescriptor = runtimeState.modalBasisCache.activeDescriptor;
    const initialStructuralCoefficients = Array.from(
      runtimeState.modalFieldCoefficientBuffer.value.array.slice(0, 8),
    );
    expect(renderer.computeAsync).toHaveBeenCalledTimes(1);
    runtimeState.modalFieldCoefficientBuffer.value.needsUpdate = false;

    tickRaymarchRuntime(runtimeState, frame, 3.5, 1 / 60, renderer);
    await flushMicrotasks();

    expect(runtimeState.modalBasisCache.rebuildCount).toBe(rebuildCount);
    expect(runtimeState.modalBasisCache.activeDescriptor).toEqual(
      activeDescriptor,
    );
    expect(renderer.computeAsync).toHaveBeenCalledTimes(1);
    expect(
      runtimeState.currentModalBasisCacheDescriptor.modalBasisCacheTopologyHash,
    ).toBe(activeDescriptor.modalBasisCacheTopologyHash);
    expect(
      runtimeState.currentModalBasisCacheDescriptor.liveModalPhaseHash,
    ).not.toBe(activeDescriptor.liveModalPhaseHash);
    expect(runtimeState.uniforms.uTime.value).toBe(3.5);
    expect(runtimeState.modalFieldCoefficientBuffer.value.needsUpdate).toBe(
      true,
    );
    expect(renderer.compute).toHaveBeenCalledTimes(1);
    expect(runtimeState.uniforms.uLiveFieldCacheActive.value).toBe(1);
    expect(runtimeState.liveFieldProjectionCache.active).toBe(true);
    expect(
      Array.from(
        runtimeState.modalFieldCoefficientBuffer.value.array.slice(0, 8),
      ),
    ).toEqual(initialStructuralCoefficients);
    tickRaymarchRuntime(runtimeState, frame, 3.5, 1 / 60, renderer);
    expect(renderer.compute).toHaveBeenCalledTimes(2);
    expect(runtimeState.debugSnapshot.modalBasisCacheDescriptorFresh).toBe(
      true,
    );
    expect(runtimeState.debugSnapshot.modalBasisCacheDrawableState).toBe(
      "modal-basis-cache-ready-current",
    );
    expect(runtimeState.debugSnapshot.modalBasisCacheStaleWhileRebuilding).toBe(
      false,
    );
  });

  it("does not rebuild the modal-basis cache when only rejected-mode phase changes", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0;
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const baseFrame = createActiveFeatureFrame({
      backboneSlots: new Float32Array([1, 1, 1, 1, 9, 9, 9, 0.8]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneColorSlots: new Float32Array(8),
      detailColorSlots: new Float32Array(0),
      modalPhaseAuthority: 1,
    });
    const rejectedPhaseFrame = {
      ...baseFrame,
      backbonePhaseSlots: new Float32Array([0, 0, 0, 1, Math.PI, 0, 1, 1]),
    };

    tickRaymarchRuntime(runtimeState, baseFrame, 1, 1 / 60, renderer);
    await flushMicrotasks();

    const activeDescriptor = runtimeState.modalBasisCache.activeDescriptor;
    const rebuildCount = runtimeState.modalBasisCache.rebuildCount;
    expect(activeDescriptor.bandwidthRejectedModeCount).toBe(1);
    expect(renderer.computeAsync).toHaveBeenCalledTimes(1);

    tickRaymarchRuntime(runtimeState, rejectedPhaseFrame, 2, 1 / 60, renderer);

    expect(
      runtimeState.currentModalBasisCacheDescriptor.liveModalPhaseHash,
    ).toBe(activeDescriptor.liveModalPhaseHash);
    expect(runtimeState.modalBasisCache.rebuildCount).toBe(rebuildCount);
    expect(runtimeState.modalBasisCache.rebuildPending).toBe(false);
    expect(renderer.computeAsync).toHaveBeenCalledTimes(1);
    expect(runtimeState.debugSnapshot.modalBasisCacheDescriptorFresh).toBe(
      true,
    );
    expect(runtimeState.debugSnapshot.modalBasisCacheDrawableState).toBe(
      "modal-basis-cache-ready-current",
    );
  });

  it("defers modal-basis cache rebuilds until a compute renderer is available", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const featureFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 32,
      backboneSlots: new Float32Array([3, 4, 6, 0.8]),
      detailSlots: new Float32Array([4, 5, 5, 0.55]),
      backbonePhaseSlots: new Float32Array([0.25, 0.14, 0.7, 0.5]),
      detailPhaseSlots: new Float32Array([-0.4, -0.21, 0.8, 0.64]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array(4),
      transientEnergy: 0.1,
      spectralCentroid: 0.2,
      spectralFlux: 0.1,
      structureSignal: 0.4,
      energySignal: 0.3,
      changeSignal: 0.08,
      pulseSignal: 0.05,
      modalPhaseAuthority: 0.5,
      debug: {},
    };
    runtimeState.backboneModeBuffer.value.array.set(featureFrame.backboneSlots);
    runtimeState.detailModeBuffer.value.array.set(featureFrame.detailSlots);
    runtimeState.uniforms.uBackboneModeCount.value = 1;
    runtimeState.uniforms.uDetailModeCount.value = 1;
    runtimeState.modalBasisCache.ready = true;
    runtimeState.modalBasisCache.activeDescriptor =
      buildRaymarchModalBasisCacheDescriptor({
        backboneSlots: runtimeState.backboneModeBuffer.value.array,
        detailSlots: runtimeState.detailModeBuffer.value.array,
        backbonePhaseSlots: runtimeState.backbonePhaseBuffer.value.array,
        detailPhaseSlots: runtimeState.detailPhaseBuffer.value.array,
        backboneCount: 1,
        detailCount: 1,
        boundaryMode: "neumann",
        radius: 3,
        phaseModeCount: 2,
        phaseAuthority: 0.5,
      });

    tickRaymarchRuntime(runtimeState, featureFrame, 3, 1 / 60, null);
    await flushMicrotasks();

    expect(runtimeState.modalBasisCache).toMatchObject({
      backend: "compute",
      ready: true,
    });
    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.volumeMesh.userData).not.toHaveProperty(
      "raymarchFieldEvaluationMode",
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.modalBasisCacheReady).toBe(
      true,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalBasisCacheFailedClosed,
    ).toBe(true);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalBasisCacheLastError,
    ).toBeNull();
  });

  it("exposes modal-basis bandwidth diagnostics without reporting descriptor overflow", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0;
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const featureFrame = createActiveFeatureFrame({
      averageAmplitude: 48,
      backboneSlots: new Float32Array([1, 1, 1, 1, 9, 9, 9, 0.25]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 0, 1, Math.PI, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneColorSlots: new Float32Array(8),
      detailColorSlots: new Float32Array(0),
      modalPhaseAuthority: 1,
      debug: {},
    });

    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60, renderer);
    await flushMicrotasks();
    tickRaymarchRuntime(runtimeState, featureFrame, 1.1, 1 / 60, renderer);

    expect(
      runtimeState.currentModalBasisCacheDescriptor.descriptorOverflow,
    ).toBe(false);
    expect(
      runtimeState.currentModalBasisCacheDescriptor.bandwidthRejectedModeCount,
    ).toBe(1);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .modalBasisCacheBandwidthRejectedModeCount,
    ).toBe(1);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .modalBasisCacheBandwidthRejectedRawModalEnergy,
    ).toBeCloseTo(0.25 ** 2, 6);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .modalBasisCacheContributingRawModalEnergy,
    ).toBeCloseTo(1, 6);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.liveSynthesisRawGradientEnvelope,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalDescriptorOverflow,
    ).toBe(false);
  });

  it("reports requested spherical geometry while keeping the effective backend rectangular", () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    runtimeState.requestedCavityGeometry = "spherical";

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 22,
        backboneSlots: new Float32Array([3, 4, 6, 0.8]),
        detailSlots: new Float32Array([4, 5, 5, 0.55]),
        backboneColorSlots: new Float32Array(16),
        detailColorSlots: new Float32Array(16),
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
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
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
    expect(runtimeState.performanceGovernor).toBeNull();
    expect(runtimeState.debugSnapshot.raymarchDebug.fieldState).toBe("idle");
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationHardSilence,
    ).toBe(true);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationReferenceDensityFloor,
    ).toBe(0);
    expect(runtimeState.debugSnapshot.modeSlotCount).toBe(0);
  });

  it("applies render-authority reset once across repeated idle ticks", () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    runtimeState.modalFieldModeBuffer.value.array[3] = 0.5;
    runtimeState.modalFieldColorBuffer.value.array[0] = 0.25;
    runtimeState.modalFieldPhaseBuffer.value.array[0] = 0.75;
    runtimeState.modalBasisCache.active = true;
    runtimeState.modalBasisCache.ready = true;
    runtimeState.spectralLightCache.active = true;
    runtimeState.spectralLightCache.ready = true;
    runtimeState.visibilityDriveEnvelope = 0.7;

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

    const effectiveGenerationAfterReset =
      runtimeState.modalBasisCache.generation;
    const spectralGenerationAfterReset =
      runtimeState.spectralLightCache.generation;
    expect(effectiveGenerationAfterReset).toBeGreaterThan(0);
    expect(spectralGenerationAfterReset).toBeGreaterThan(0);
    expect(runtimeState.modalFieldModeBuffer.value.array[3]).toBe(0);
    expect(runtimeState.renderAuthorityResetApplied).toBe(true);
    expect(runtimeState.bloomTuning.bloomAllowed).toBe(false);
    expect(runtimeState.visibilityDriveEnvelope).toBe(0);
    expect(
      runtimeState.uniforms.uObservationDensityFadeStart.value,
    ).toBeCloseTo(
      deriveObservationTransferParameters({
        opacityGain: runtimeState.uniforms.uOpacityGain.value,
        stepCompensation: runtimeState.bloomTuning.stepCompensation,
        contourSharpness: runtimeState.uniforms.uContourSharpness.value,
        visibilityDrive: 0,
      }).densityFadeStart,
    );

    runtimeState.modalFieldModeBuffer.value.needsUpdate = false;
    runtimeState.modalFieldColorBuffer.value.needsUpdate = false;
    runtimeState.modalFieldPhaseBuffer.value.needsUpdate = false;

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

    expect(runtimeState.modalBasisCache.generation).toBe(
      effectiveGenerationAfterReset,
    );
    expect(runtimeState.spectralLightCache.generation).toBe(
      spectralGenerationAfterReset,
    );
    expect(runtimeState.modalFieldModeBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.modalFieldColorBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.modalFieldPhaseBuffer.value.needsUpdate).toBe(false);
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
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
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
    expect(runtimeState.debugSnapshot.raymarchDebug.observationEnergy).toBe(0);
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
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
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
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
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
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
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
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
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

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(2);
    expect(runtimeState.modalFieldModeBuffer.value.array[0]).toBe(1);
    expect(runtimeState.modalFieldModeBuffer.value.array[3]).toBeCloseTo(0.64);
    expect(runtimeState.modalFieldModeBuffer.value.array[7]).toBeCloseTo(0.32);
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
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
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
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
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
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
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

  it("switches to cached field evaluation after a compute-backed rebuild settles", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({});
    const denseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 180,
      backboneSlots: new Float32Array([
        1, 2, 3, 1.0, 1, 3, 4, 0.95, 2, 3, 4, 0.9, 2, 4, 5, 0.85, 3, 4, 5, 0.8,
        3, 5, 6, 0.75, 4, 5, 6, 0.7, 4, 6, 7, 0.65,
      ]),
      detailSlots: new Float32Array([
        2, 2, 3, 0.8, 2, 3, 3, 0.75, 3, 3, 4, 0.7, 3, 4, 4, 0.65, 4, 4, 5, 0.6,
        4, 5, 5, 0.55, 5, 5, 6, 0.5, 5, 6, 6, 0.45,
      ]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.5, 0.45, 0.4, 0.35]),
      transientEnergy: 0.72,
      spectralCentroid: 0.56,
      spectralFlux: 0.41,
      structureSignal: 0.86,
      energySignal: 0.82,
      changeSignal: 0.64,
      pulseSignal: 0.34,
      timbreSpread: 0.31,
      spectralNovelty: 0.24,
    };

    try {
      tickRaymarchRuntime(runtimeState, denseFrame, 1, 1 / 60, renderer);

      expect(runtimeState.modalBasisCache.active).toBe(true);
      expect(runtimeState.modalBasisCache.rebuildPending).toBe(true);
      expect(runtimeState.modalBasisCache.ready).toBe(false);
      expect(runtimeState.modalBasisCache.rebuildCount).toBe(0);
      expect(renderer.computeAsync).toHaveBeenCalledTimes(2);
      expect(runtimeState.volumeMesh.visible).toBe(false);
      expect(runtimeState.volumeMesh.userData).not.toHaveProperty(
        "raymarchFieldEvaluationMode",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off);
      expect(runtimeState.debugSnapshot.spectralLightEvaluationMode).toBe(
        RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
      );
      expect(runtimeState.debugSnapshot.modalBasisCacheDrawable).toBe(false);
      expect(runtimeState.debugSnapshot.modalBasisCacheDrawableState).toBe(
        "modal-basis-cache-building",
      );
      expect(
        runtimeState.debugSnapshot.modalBasisCacheDrawableBlockedReason,
      ).toBe("cache-rebuild-pending");
      expect(runtimeState.debugSnapshot.modalBasisCacheReady).toBe(false);
      expect(runtimeState.debugSnapshot.modalBasisCacheRebuildPending).toBe(
        true,
      );
      expect(runtimeState.debugSnapshot.modalBasisCacheFailedClosed).toBe(true);
      expect(runtimeState.debugSnapshot.spectralLightCacheReady).toBe(false);
      expect(runtimeState.debugSnapshot.spectralLightCacheRebuildPending).toBe(
        true,
      );

      await flushMicrotasks();
      expect(renderer.computeAsync).toHaveBeenCalledTimes(2);

      tickRaymarchRuntime(runtimeState, denseFrame, 2, 1 / 60, renderer);

      expect(runtimeState.modalBasisCache.rebuildPending).toBe(false);
      expect(runtimeState.modalBasisCache.ready).toBe(true);
      expect(runtimeState.modalBasisCache.rebuildCount).toBe(1);
      expect(runtimeState.spectralLightCache.rebuildPending).toBe(false);
      expect(runtimeState.spectralLightCache.ready).toBe(true);
      expect(runtimeState.spectralLightCache.rebuildCount).toBe(1);
      expect(runtimeState.volumeMesh.visible).toBe(true);
      expect(runtimeState.volumeMesh.userData).not.toHaveProperty(
        "raymarchFieldEvaluationMode",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);
      expect(runtimeState.debugSnapshot.modalBasisCacheActive).toBe(true);
      expect(runtimeState.debugSnapshot.modalBasisCacheBackend).toBe("compute");
      expect(runtimeState.debugSnapshot.modalBasisCacheReady).toBe(true);
      expect(runtimeState.debugSnapshot.modalBasisCacheDrawable).toBe(true);
      expect(runtimeState.debugSnapshot.modalBasisCacheDrawableState).toBe(
        "modal-basis-cache-ready-current",
      );
      expect(
        runtimeState.debugSnapshot.modalBasisCacheDrawableBlockedReason,
      ).toBeNull();
      expect(runtimeState.debugSnapshot.modalBasisCacheRebuildPending).toBe(
        false,
      );
      expect(runtimeState.debugSnapshot.modalBasisCacheRebuildCount).toBe(1);
      expect(runtimeState.debugSnapshot.spectralLightEvaluationMode).toBe(
        RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
      );
      expect(runtimeState.debugSnapshot.spectralLightCacheReady).toBe(true);
      expect(runtimeState.debugSnapshot.spectralLightCacheRebuildPending).toBe(
        false,
      );
      expect(runtimeState.debugSnapshot.spectralLightCacheRebuildCount).toBe(1);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("fails closed when the modal-basis cache has no contributing modes", () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0;
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const frame = createActiveFeatureFrame({
      backboneSlots: new Float32Array([99, 99, 99, 1]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneColorSlots: new Float32Array(4),
      detailColorSlots: new Float32Array(0),
      modalPhaseAuthority: 1,
    });

    tickRaymarchRuntime(runtimeState, frame, 1, 1 / 60, renderer);

    expect(runtimeState.currentModalBasisCacheDescriptor.modalFieldCount).toBe(
      1,
    );
    expect(
      runtimeState.currentModalBasisCacheDescriptor
        .contributingBasisPageModeCount,
    ).toBe(0);
    expect(runtimeState.modalBasisCache.rebuildPending).toBe(false);
    expect(renderer.computeAsync).not.toHaveBeenCalled();
    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.volumeMesh.userData).not.toHaveProperty(
      "raymarchFieldEvaluationMode",
    );
    expect(runtimeState.debugSnapshot.modalBasisCacheDrawable).toBe(false);
    expect(runtimeState.debugSnapshot.modalBasisCacheDrawableState).toBe(
      "modal-basis-cache-blocked",
    );
    expect(
      runtimeState.debugSnapshot.modalBasisCacheDrawableBlockedReason,
    ).toBe("no-contributing-basis-pages");
  });

  it("ignores stale field and Spectral Light completions after render-authority reset", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    const completions = [];
    const renderer = {
      computeAsync: async (node) =>
        new Promise((resolve) => {
          completions.push({ id: node?.id, resolve });
        }),
    };

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame(),
      1,
      1 / 60,
      renderer,
    );
    await flushMicrotasks(2);

    expect(completions.map(({ id }) => id).sort()).toEqual([
      "field",
      "spectral",
    ]);
    expect(runtimeState.modalBasisCache.rebuildPending).toBe(true);
    expect(runtimeState.spectralLightCache.rebuildPending).toBe(true);

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        fieldState: "idle",
        renderAuthority: false,
      }),
      2,
      1 / 60,
      renderer,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(0);
    expect(runtimeState.modalFieldModeBuffer.value.array[3]).toBe(0);
    expect(runtimeState.modalBasisCache.active).toBe(false);
    expect(runtimeState.modalBasisCache.ready).toBe(false);
    expect(runtimeState.debugSnapshot.modalBasisCacheDrawable).toBe(false);
    expect(runtimeState.debugSnapshot.modalBasisCacheDrawableState).toBe(
      "modal-basis-cache-blocked",
    );
    expect(
      runtimeState.debugSnapshot.modalBasisCacheDrawableBlockedReason,
    ).toBe("missing-descriptor");

    completions.forEach(({ resolve }) => resolve());
    await flushMicrotasks(5);

    expect(runtimeState.modalBasisCache.ready).toBe(false);
    expect(runtimeState.modalBasisCache.rebuildPending).toBe(false);
    expect(runtimeState.modalBasisCache.activeDescriptor).toBeNull();
    expect(runtimeState.modalBasisCache.pendingDescriptor).toBeNull();
    expect(runtimeState.modalBasisCache.rebuildCount).toBe(0);
    expect(runtimeState.spectralLightCache.ready).toBe(false);
    expect(runtimeState.spectralLightCache.rebuildPending).toBe(false);
    expect(runtimeState.spectralLightCache.activeDescriptor).toBeNull();
    expect(runtimeState.spectralLightCache.pendingDescriptor).toBeNull();
    expect(runtimeState.spectralLightCache.rebuildCount).toBe(0);
  });

  it("ignores stale field and Spectral Light failures after render-authority reset", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    const failures = [];
    const renderer = {
      computeAsync: async (node) =>
        new Promise((resolve, reject) => {
          failures.push({ id: node?.id, reject, resolve });
        }),
    };

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame(),
      1,
      1 / 60,
      renderer,
    );
    await flushMicrotasks(2);

    expect(failures.map(({ id }) => id).sort()).toEqual(["field", "spectral"]);

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        fieldState: "idle",
        renderAuthority: false,
      }),
      2,
      1 / 60,
      renderer,
    );

    failures.forEach(({ reject }) => reject(new Error("late stale rebuild")));
    await flushMicrotasks(5);

    expect(runtimeState.modalBasisCache.backend).toBe("compute");
    expect(runtimeState.modalBasisCache.ready).toBe(false);
    expect(runtimeState.modalBasisCache.rebuildPending).toBe(false);
    expect(runtimeState.modalBasisCache.activeDescriptor).toBeNull();
    expect(runtimeState.modalBasisCache.lastError).toBeNull();
    expect(runtimeState.spectralLightCache.backend).toBe("compute");
    expect(runtimeState.spectralLightCache.ready).toBe(false);
    expect(runtimeState.spectralLightCache.rebuildPending).toBe(false);
    expect(runtimeState.spectralLightCache.activeDescriptor).toBeNull();
    expect(runtimeState.spectralLightCache.lastError).toBeNull();
  });

  it("ignores stale modal-basis completions after render-authority reset", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.modalBasisCache.computeNodesByKey[
      getTestEffectiveComputeNodeKey(runtimeState)
    ] = {
      id: "effective",
    };
    let resolveModalBasisCacheRebuild;
    const renderer = {
      computeAsync: async (node) => {
        if (node?.id === "effective") {
          return new Promise((resolve) => {
            resolveModalBasisCacheRebuild = resolve;
          });
        }
        return undefined;
      },
    };

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({ modalPhaseAuthority: 0.5 }),
      3,
      1 / 60,
      renderer,
    );
    await flushMicrotasks(2);

    expect(runtimeState.modalBasisCache.rebuildPending).toBe(true);
    expect(resolveModalBasisCacheRebuild).toBeTypeOf("function");

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        fieldState: "idle",
        renderAuthority: false,
        modalPhaseAuthority: 0,
      }),
      4,
      1 / 60,
      renderer,
    );

    resolveModalBasisCacheRebuild();
    await flushMicrotasks(5);

    expect(runtimeState.modalBasisCache.ready).toBe(false);
    expect(runtimeState.modalBasisCache.rebuildPending).toBe(false);
    expect(runtimeState.modalBasisCache.activeDescriptor).toBeNull();
    expect(runtimeState.modalBasisCache.rebuildCount).toBe(0);
  });

  it("keeps a drawable active descriptor visible while structural modal slots rebuild", () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({});
    const cachedBackboneSlots = new Float32Array([1, 1, 1, 0.8]);
    const cachedDetailSlots = new Float32Array(32);
    const currentFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 3.2,
      backboneSlots: new Float32Array([2, 2, 2, 0.12, 2, 3, 3, 0.08]),
      detailSlots: new Float32Array(32),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.42, 0.18, 0.02, 0]),
      transientEnergy: 0.01,
      spectralCentroid: 0.05,
      spectralFlux: 0.01,
      structureSignal: 0.18,
      energySignal: 0.08,
      changeSignal: 0.02,
      pulseSignal: 0,
      modeCoherence: 0.52,
      modalResponseRenderSourceCoupledEnergy: 0,
      modalResponseRenderResonantEnergy: 0,
      debug: {},
    };

    try {
      runtimeState.backboneModeBuffer.value.array.set(cachedBackboneSlots);
      runtimeState.detailModeBuffer.value.array.set(cachedDetailSlots);
      runtimeState.uniforms.uBackboneModeCount.value = 1;
      runtimeState.uniforms.uDetailModeCount.value = 0;
      runtimeState.modalBasisCache.ready = true;
      const cachedEffectiveDescriptor = buildRaymarchModalBasisCacheDescriptor({
        modalFieldSlots: cachedBackboneSlots,
        modalFieldPhaseSlots: new Float32Array([0, 0.2, 1, 1]),
        modalFieldCount: 1,
        boundaryMode: "neumann",
        cavityGeometry: "rectangular",
        radius: runtimeState.uniforms.uRadius.value,
        phaseModeCount: 1,
        resolution: runtimeState.modalBasisCache.resolution,
      });
      runtimeState.modalBasisCache.activeDescriptor = cachedEffectiveDescriptor;

      tickRaymarchRuntime(runtimeState, currentFrame, 1, 1 / 60, renderer);

      expect(runtimeState.modalBasisCache.ready).toBe(true);
      expect(runtimeState.modalBasisCache.rebuildPending).toBe(true);
      expect(runtimeState.volumeMesh.visible).toBe(true);
      expect(runtimeState.volumeMesh.userData).not.toHaveProperty(
        "raymarchFieldEvaluationMode",
      );
      expect(runtimeState.debugSnapshot.modalBasisCacheReady).toBe(true);
      expect(runtimeState.debugSnapshot.modalBasisCacheDrawable).toBe(true);
      expect(runtimeState.debugSnapshot.modalBasisCacheDrawableState).toBe(
        "modal-basis-cache-ready-stale",
      );
      expect(
        runtimeState.debugSnapshot.modalBasisCacheDrawableBlockedReason,
      ).toBeNull();
      expect(
        runtimeState.debugSnapshot.modalBasisCacheDrawableStaleReason,
      ).toBe("modal-identity");
      expect(
        runtimeState.debugSnapshot.modalBasisCacheStaleWhileRebuilding,
      ).toBe(true);
      expect(runtimeState.debugSnapshot.modalBasisCacheRebuildPending).toBe(
        true,
      );
      expect(
        runtimeState.debugSnapshot.raymarchDebug
          .modalBasisCacheDescriptorStaleReason,
      ).toBe("rebuild-pending");
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("keeps cached Spectral Light evaluation while color rebuild is still pending", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    let spectralLightResolve;
    const warmRenderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const pendingRenderer = {
      computeAsync: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            spectralLightResolve = resolve;
          }),
      ),
    };
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({});
    const denseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 180,
      backboneSlots: new Float32Array([
        1, 2, 3, 1.0, 1, 3, 4, 0.95, 2, 3, 4, 0.9, 2, 4, 5, 0.85, 3, 4, 5, 0.8,
        3, 5, 6, 0.75, 4, 5, 6, 0.7, 4, 6, 7, 0.65,
      ]),
      detailSlots: new Float32Array([
        2, 2, 3, 0.8, 2, 3, 3, 0.75, 3, 3, 4, 0.7, 3, 4, 4, 0.65, 4, 4, 5, 0.6,
        4, 5, 5, 0.55, 5, 5, 6, 0.5, 5, 6, 6, 0.45,
      ]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.5, 0.45, 0.4, 0.35]),
      transientEnergy: 0.72,
      spectralCentroid: 0.56,
      spectralFlux: 0.41,
      structureSignal: 0.86,
      energySignal: 0.82,
      changeSignal: 0.64,
      pulseSignal: 0.34,
      timbreSpread: 0.31,
      spectralNovelty: 0.24,
    };
    const colorChangedFrame = {
      ...denseFrame,
      backboneColorSlots: new Float32Array([
        0.9, 0.2, 0.1, 0.95, 0.8, 0.3, 0.1, 0.8,
      ]),
    };

    try {
      tickRaymarchRuntime(runtimeState, denseFrame, 1, 1 / 60, warmRenderer);
      await flushMicrotasks();
      tickRaymarchRuntime(runtimeState, denseFrame, 2, 1 / 60, warmRenderer);

      expect(runtimeState.volumeMesh.userData).not.toHaveProperty(
        "raymarchFieldEvaluationMode",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);

      tickRaymarchRuntime(
        runtimeState,
        colorChangedFrame,
        3,
        1 / 60,
        pendingRenderer,
      );

      expect(runtimeState.volumeMesh.userData).not.toHaveProperty(
        "raymarchFieldEvaluationMode",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);
      expect(runtimeState.spectralLightCache.rebuildPending).toBe(true);
      expect(runtimeState.spectralLightCache.ready).toBe(true);

      await Promise.resolve();
      spectralLightResolve();
      await flushMicrotasks();
      tickRaymarchRuntime(
        runtimeState,
        colorChangedFrame,
        4,
        1 / 60,
        pendingRenderer,
      );

      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);
      expect(runtimeState.spectralLightCache.ready).toBe(true);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("keeps Spectral Light descriptor admission quantized for sub-bucket color jitter", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0.65;
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const baseFrame = createActiveFeatureFrame({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneColorSlots: new Float32Array([1, 0.2, 0.1, 0.9]),
      detailColorSlots: new Float32Array([0.2, 0.6, 1, 0.4]),
    });
    const jitterFrame = {
      ...baseFrame,
      backboneColorSlots: new Float32Array([0.985, 0.201, 0.105, 0.895]),
      detailColorSlots: new Float32Array([0.201, 0.599, 0.985, 0.401]),
    };

    tickRaymarchRuntime(runtimeState, baseFrame, 1, 1 / 60, renderer);
    await flushMicrotasks();
    tickRaymarchRuntime(runtimeState, baseFrame, 2, 1 / 60, renderer);

    const activeDescriptor = runtimeState.currentSpectralLightDescriptor;
    const rebuildCount = runtimeState.spectralLightCache.rebuildCount;
    const spectralComputeCount = () =>
      renderer.computeAsync.mock.calls.filter(
        ([node]) => node?.id === "spectral",
      ).length;
    const spectralComputeCalls = spectralComputeCount();

    tickRaymarchRuntime(runtimeState, jitterFrame, 3, 1 / 60, renderer);

    expect(runtimeState.currentSpectralLightDescriptor).toBe(activeDescriptor);
    expect(runtimeState.spectralLightCache.rebuildCount).toBe(rebuildCount);
    expect(runtimeState.spectralLightCache.rebuildPending).toBe(false);
    expect(spectralComputeCount()).toBe(spectralComputeCalls);
    expect(runtimeState.debugSnapshot.spectralLightCacheDescriptorFresh).toBe(
      true,
    );
    expect(runtimeState.debugSnapshot.spectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
    );
  });

  it("uses modal-basis-cached evaluation without a field override diagnostic", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({});
    const denseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 180,
      backboneSlots: new Float32Array([
        1, 2, 3, 1.0, 1, 3, 4, 0.95, 2, 3, 4, 0.9, 2, 4, 5, 0.85, 3, 4, 5, 0.8,
        3, 5, 6, 0.75, 4, 5, 6, 0.7, 4, 6, 7, 0.65,
      ]),
      detailSlots: new Float32Array([
        2, 2, 3, 0.8, 2, 3, 3, 0.75, 3, 3, 4, 0.7, 3, 4, 4, 0.65, 4, 4, 5, 0.6,
        4, 5, 5, 0.55, 5, 5, 6, 0.5, 5, 6, 6, 0.45,
      ]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.5, 0.45, 0.4, 0.35]),
      transientEnergy: 0.72,
      spectralCentroid: 0.56,
      spectralFlux: 0.41,
      structureSignal: 0.86,
      energySignal: 0.82,
      changeSignal: 0.64,
      pulseSignal: 0.34,
      timbreSpread: 0.31,
      spectralNovelty: 0.24,
    };

    try {
      tickRaymarchRuntime(runtimeState, denseFrame, 1, 1 / 60, renderer);

      expect(runtimeState.modalBasisCache.active).toBe(true);
      expect(runtimeState.modalBasisCache.mode).toBe("modal-basis-cached");
      expect(runtimeState.modalBasisCache.rebuildPending).toBe(true);

      await flushMicrotasks();
      tickRaymarchRuntime(runtimeState, denseFrame, 2, 1 / 60, renderer);

      expect(runtimeState.volumeMesh.userData).not.toHaveProperty(
        "raymarchFieldEvaluationMode",
      );
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("does not rebuild the basis atlas when modal topology churns without page reassignment", () => {
    const basisCapacity = 12;
    const pageModes = [
      [1, 1, 1, 0.8],
      [1, 1, 2, 0.8],
      [1, 1, 3, 0.8],
      [1, 1, 4, 0.8],
      [1, 2, 1, 0.8],
      [1, 2, 2, 0.8],
      [1, 2, 3, 0.8],
      [1, 2, 4, 0.8],
      [1, 3, 1, 0.8],
      [1, 3, 2, 0.8],
      [1, 3, 3, 0.8],
      [1, 3, 4, 0.8],
    ];
    const firstSlots = new Float32Array(
      pageModes.flatMap((mode) => mode).concat([1, 4, 1, 0.05]),
    );
    const changedSlots = new Float32Array(
      pageModes.flatMap((mode) => mode).concat([1, 4, 1, 0.2], [2, 2, 2, 0.1]),
    );
    const phaseSlots = new Float32Array(firstSlots.length).fill(0.5);
    const first = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: firstSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 13,
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
      basisCapacity,
    });
    const changed = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: changedSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 14,
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
      basisCapacity,
    });
    const modalBasisCache = createRaymarchModalBasisCache({
      resolution: 8,
      basisCapacity,
    });
    modalBasisCache.ready = true;
    modalBasisCache.activeDescriptor = first;

    expect(
      shouldRebuildRaymarchModalBasisCache(modalBasisCache, changed),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(first.identitySetHash).not.toBe(changed.identitySetHash);
    expect(first.identityPageAssignmentHash).toBe(
      changed.identityPageAssignmentHash,
    );
    expect(
      resolveRaymarchModalBasisCacheDrawableAuthority(modalBasisCache, changed),
    ).toMatchObject({
      drawable: true,
      state: "modal-basis-cache-ready-current",
      blockedReason: null,
    });
  });

  it("does not rebuild the basis atlas for amplitude-only representable flicker", () => {
    const first = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 1, 1, 0.8, 2, 2, 2, 0.5]),
      modalFieldPhaseSlots: new Float32Array([0, 0, 1, 1, 0, 0, 1, 1]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
    });
    const changed = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 1, 1, 0.8, 2, 2, 2, 0]),
      modalFieldPhaseSlots: new Float32Array([0, 0, 1, 1, 0, 0, 1, 1]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
    });
    const modalBasisCache = createRaymarchModalBasisCache({ resolution: 8 });
    modalBasisCache.ready = true;
    modalBasisCache.activeDescriptor = first;

    expect(first.identityPageAssignmentHash).toBe(
      changed.identityPageAssignmentHash,
    );
    expect(first.representableDomainHash).not.toBe(
      changed.representableDomainHash,
    );
    expect(
      shouldRebuildRaymarchModalBasisCache(modalBasisCache, changed),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(
      resolveRaymarchModalBasisCacheDrawableAuthority(modalBasisCache, changed),
    ).toMatchObject({
      drawable: true,
      state: "modal-basis-cache-ready-current",
      blockedReason: null,
    });
  });

  it("tracks live-per-frame support while a rebuild is pending and keeps phase authority tied to the active cache", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0;
    let effectiveComputeCalls = 0;
    let resolvePendingCompute;
    const renderer = {
      computeAsync: async (node) => {
        if (node?.id !== "field") {
          return undefined;
        }
        effectiveComputeCalls += 1;
        if (effectiveComputeCalls === 1) {
          return undefined;
        }
        return new Promise((resolve) => {
          resolvePendingCompute = resolve;
        });
      },
    };
    const activeFrame = createActiveFeatureFrame({
      backboneSlots: new Float32Array([1, 1, 1, 0.9]),
      detailSlots: new Float32Array(0),
      backboneColorSlots: new Float32Array(4),
      detailColorSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      modalPhaseAuthority: 1,
    });
    const pendingFrame = createActiveFeatureFrame({
      backboneSlots: new Float32Array([1, 1, 1, 0.9, 2, 2, 2, 0.9]),
      detailSlots: new Float32Array(0),
      backboneColorSlots: new Float32Array(8),
      detailColorSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1, Math.PI, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      modalPhaseAuthority: 0.25,
    });

    tickRaymarchRuntime(runtimeState, activeFrame, 1, 1 / 60, renderer);
    await flushMicrotasks();

    const activeDescriptor = runtimeState.modalBasisCache.activeDescriptor;
    const activeSupportMean =
      runtimeState.modalBasisCache.lastAuditDiagnostics
        .liveSynthesisUnsignedSupportMean;
    const activeObservationAnchor =
      runtimeState.debugSnapshot.observationSampledAnchor;
    expect(activeSupportMean).toBeGreaterThan(0);
    expect(activeObservationAnchor).toBeGreaterThan(0);

    tickRaymarchRuntime(runtimeState, pendingFrame, 1, 1 / 60, renderer);

    const pendingDescriptor = runtimeState.currentModalBasisCacheDescriptor;
    const pendingSupportMean =
      runtimeState.modalBasisCache.lastAuditDiagnostics
        .liveSynthesisUnsignedSupportMean;
    expect(effectiveComputeCalls).toBe(2);
    expect(runtimeState.modalBasisCache.rebuildPending).toBe(true);
    expect(runtimeState.modalBasisCache.ready).toBe(true);
    expect(runtimeState.modalBasisCache.activeDescriptor).toEqual(
      activeDescriptor,
    );

    // Support is a live per-frame measurement: it follows the pending field
    // immediately rather than freezing at the active-cache build. The mirrored
    // cache field and the transfer-derived observation anchor both track it.
    expect(pendingSupportMean).not.toBeCloseTo(activeSupportMean, 6);
    expect(
      runtimeState.modalBasisCache.liveSynthesisUnsignedSupportMean,
    ).toBeCloseTo(pendingSupportMean, 6);
    expect(
      runtimeState.debugSnapshot.liveSynthesisUnsignedSupportMean,
    ).toBeCloseTo(pendingSupportMean, 6);
    expect(runtimeState.debugSnapshot.observationSampledAnchor).not.toBeCloseTo(
      activeObservationAnchor,
      6,
    );

    // Phase authority and drawable state stay tied to the committed active
    // cache while the rebuild is pending.
    expect(pendingDescriptor.phaseAuthority).not.toBeCloseTo(
      activeDescriptor.phaseAuthority,
      6,
    );
    expect(
      runtimeState.modalBasisCache.modalBasisCachePhaseAuthority,
    ).toBeCloseTo(activeDescriptor.phaseAuthority, 6);
    expect(
      runtimeState.debugSnapshot.modalBasisCachePhaseAuthority,
    ).toBeCloseTo(activeDescriptor.phaseAuthority, 6);
    expect(runtimeState.debugSnapshot.modalBasisCacheDrawableState).toBe(
      "modal-basis-cache-ready-stale",
    );

    resolvePendingCompute();
    await flushMicrotasks();
  });

  it("skips color buffer uploads when Spectral Light mixing is disabled", () => {
    const runtimeState = createRuntimeState();
    runtimeState.uniforms.uSpectralMix.value = 0;
    runtimeState.modalFieldColorBuffer.value.array.set([9, 9, 9, 9]);

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 48,
        backboneSlots: new Float32Array([3, 4, 6, 0.8]),
        detailSlots: new Float32Array([4, 5, 5, 0.55]),
        backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
        detailColorSlots: new Float32Array([0.2, 0.5, 1, 0.5]),
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

    expect(
      Array.from(runtimeState.modalFieldColorBuffer.value.array.slice(0, 4)),
    ).toEqual([0, 0, 0, 0]);
    expect(runtimeState.modalFieldColorBuffer.value.needsUpdate).toBe(false);
  });

  it("skips repeated modal, color, and phase uploads without freezing uniforms", () => {
    const runtimeState = createRuntimeState();
    tickRaymarchRuntime(runtimeState, createActiveFeatureFrame(), 1, 1 / 60);

    runtimeState.backboneModeBuffer.value.needsUpdate = false;
    runtimeState.detailModeBuffer.value.needsUpdate = false;
    runtimeState.backboneColorBuffer.value.needsUpdate = false;
    runtimeState.detailColorBuffer.value.needsUpdate = false;
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
    expect(runtimeState.backboneColorBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.detailColorBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.backbonePhaseBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.detailPhaseBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.uniforms.uTime.value).toBe(2);
    expect(runtimeState.uniforms.uAverageAmplitude.value).toBe(96);
    expect(runtimeState.uniforms.uTransientEnergy.value).toBe(0.91);
    expect(runtimeState.uniforms.uSpectralFlux.value).toBe(0.52);
  });

  it("uploads again when a reused source slot array changes values", () => {
    const runtimeState = createRuntimeState();
    const featureFrame = createActiveFeatureFrame();
    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);
    const firstDescriptor = runtimeState.currentModalBasisCacheDescriptor;

    runtimeState.modalFieldModeBuffer.value.needsUpdate = false;
    runtimeState.modalFieldColorBuffer.value.needsUpdate = false;
    featureFrame.backboneSlots[0] = 7;

    tickRaymarchRuntime(runtimeState, featureFrame, 2, 1 / 60);

    expect(runtimeState.modalFieldModeBuffer.value.needsUpdate).toBe(true);
    expect(runtimeState.modalFieldColorBuffer.value.needsUpdate).toBe(true);
    expect(runtimeState.currentModalBasisCacheDescriptor).not.toBe(
      firstDescriptor,
    );
  });

  it("compacts modal slots when upstream continuity releases earlier modes", () => {
    const runtimeState = createRuntimeState();

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        backboneSlots: new Float32Array([1, 1, 1, 0.8, 2, 2, 2, 0.7]),
        detailSlots: new Float32Array(0),
        backboneColorSlots: new Float32Array(8),
        detailColorSlots: new Float32Array(0),
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
        backboneColorSlots: new Float32Array(4),
        detailColorSlots: new Float32Array(0),
        backbonePhaseSlots: new Float32Array([0, 0, 1, 1]),
        detailPhaseSlots: new Float32Array(0),
      }),
      2,
      1 / 60,
    );

    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(1);
    expect(runtimeState.currentModalBasisCacheDescriptor.modalFieldCount).toBe(
      1,
    );
    expect(
      Array.from(runtimeState.modalFieldModeBuffer.value.array.slice(0, 4)),
    ).toEqual([2, 2, 2, expect.closeTo(0.7, 6)]);
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
        modalFieldColorSlots: new Float32Array(8),
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
    ).toEqual([1, 1, 1, 0, 2, 2, 2, expect.closeTo(0.7, 6)]);
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

  it("rebuilds raymarch caches only when descriptor inputs change", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    let fieldComputeCalls = 0;
    let spectralComputeCalls = 0;
    const renderer = {
      computeAsync: async (node) => {
        if (node?.id === "field") {
          fieldComputeCalls += 1;
        } else if (node?.id === "spectral") {
          spectralComputeCalls += 1;
        }
      },
    };

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame(),
      1,
      1 / 60,
      renderer,
    );
    await flushMicrotasks();
    expect(fieldComputeCalls).toBe(1);
    expect(spectralComputeCalls).toBe(1);

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({ averageAmplitude: 96 }),
      1,
      1 / 60,
      renderer,
    );
    await flushMicrotasks();
    expect(fieldComputeCalls).toBe(1);
    expect(spectralComputeCalls).toBe(1);

    const topologyFrame = createActiveFeatureFrame();
    topologyFrame.backboneSlots[0] = 8;
    tickRaymarchRuntime(runtimeState, topologyFrame, 1, 1 / 60, renderer);
    await flushMicrotasks();
    expect(fieldComputeCalls).toBe(2);
    expect(spectralComputeCalls).toBe(2);

    const colorFrame = createActiveFeatureFrame();
    colorFrame.backboneSlots[0] = 8;
    colorFrame.backboneColorSlots[0] = 0.4;
    tickRaymarchRuntime(runtimeState, colorFrame, 1, 1 / 60, renderer);
    await flushMicrotasks();
    expect(fieldComputeCalls).toBe(2);
    expect(spectralComputeCalls).toBe(3);
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
      backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.2]),
      detailColorSlots: new Float32Array([
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
    staticRuntimeState.uniforms.uSpectralMix.value = 0;
    const spectralRuntimeState = createRuntimeState();
    spectralRuntimeState.uniforms.uSpectralMix.value = 0.65;

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
    expect(spectralRuntimeState.performanceGovernor.uploadedModeCount).toBe(
      staticRuntimeState.performanceGovernor.uploadedModeCount,
    );
    expect(spectralRuntimeState.modalFieldColorBuffer.value.needsUpdate).toBe(
      true,
    );
  });

  it("keeps Spectral color mode on a distinct cached material path", async () => {
    const createFrame = () =>
      createActiveFeatureFrame({
        backboneSlots: new Float32Array([1, 1, 1, 0.4]),
        detailSlots: new Float32Array([2, 2, 2, 0.3]),
        backboneColorSlots: new Float32Array([1, 0.1, 0.05, 0.8]),
        detailColorSlots: new Float32Array([0.05, 0.6, 1, 0.7]),
      });
    const staticRuntimeState = createRuntimeState({ withFieldCache: true });
    const spectralRuntimeState = createRuntimeState({ withFieldCache: true });
    staticRuntimeState.uniforms.uSpectralMix.value = 0;
    spectralRuntimeState.uniforms.uSpectralMix.value = 0.65;
    seedRuntimeCacheNodes(staticRuntimeState);
    seedRuntimeCacheNodes(spectralRuntimeState);
    const staticDispatches = [];
    const spectralDispatches = [];
    const staticRenderer = {
      computeAsync: async (node) => {
        staticDispatches.push(node?.id ?? null);
      },
    };
    const spectralRenderer = {
      computeAsync: async (node) => {
        spectralDispatches.push(node?.id ?? null);
      },
    };

    tickRaymarchRuntime(
      staticRuntimeState,
      createFrame(),
      1,
      1 / 60,
      staticRenderer,
    );
    tickRaymarchRuntime(
      spectralRuntimeState,
      createFrame(),
      1,
      1 / 60,
      spectralRenderer,
    );
    await flushMicrotasks();
    tickRaymarchRuntime(
      spectralRuntimeState,
      createFrame(),
      1.016,
      1 / 60,
      spectralRenderer,
    );

    expect(staticDispatches).not.toContain("spectral");
    expect(staticRuntimeState.spectralLightCache.activeDescriptor).toBeNull();
    expect(
      staticRuntimeState.volumeMesh.userData
        .raymarchSpectralLightEvaluationMode,
    ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off);
    expect(spectralDispatches).toContain("spectral");
    expect(
      spectralRuntimeState.spectralLightCache.activeDescriptor,
    ).toMatchObject({
      spectralLightModeCount: 2,
    });
    expect(
      spectralRuntimeState.spectralLightCache.activeDescriptor
        .modalFieldColorHash,
    ).toBeTypeOf("number");
    expect(
      spectralRuntimeState.volumeMesh.userData
        .raymarchSpectralLightEvaluationMode,
    ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);
  });

  it("builds the governor inline from the published integrator budget", () => {
    const runtimeState = createRuntimeState();
    const featureFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 48,
      backboneSlots: new Float32Array([1, 2, 3, 0.8, 8, 9, 10, 0.9]),
      detailSlots: new Float32Array([4, 5, 6, 0.5]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
      transientEnergy: 0.2,
      spectralCentroid: 0.3,
      spectralFlux: 0.1,
      structureSignal: 0.4,
      energySignal: 0.3,
      changeSignal: 0.2,
      pulseSignal: 0.1,
    };
    // The render loop published a starved budget with the bloom guard armed.
    runtimeState.effectiveRenderScale = 0.8;
    runtimeState.raymarchBloomAdaptationActive = true;

    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);

    // The integrator (render loop) owns step/scale, so the inline governor
    // never re-adapts them; bloom adaptation tracks the published signal.
    expect(runtimeState.performanceGovernor.stepScaleAdaptationActive).toBe(
      false,
    );
    expect(runtimeState.performanceGovernor.bloomAdaptationActive).toBe(true);
    expect(
      runtimeState.performanceGovernor.modalField.uploadedActiveCount,
    ).toBe(3);
    expect(
      Array.from(runtimeState.modalFieldModeBuffer.value.array.slice(0, 4)),
    ).toEqual([1, 2, 3, expect.closeTo(0.8, 5)]);
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(3);
  });

  it("keeps static color off the Spectral Light cache path", () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0;
    runtimeState.backboneColorBuffer.value.array.set([9, 9, 9, 9]);
    runtimeState.detailColorBuffer.value.array.set([7, 7, 7, 7]);
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
        backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
        detailColorSlots: new Float32Array([0.2, 0.5, 1, 0.5]),
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

    expect(runtimeState.spectralLightBuffersUploaded).toBe(false);
    expect(runtimeState.currentSpectralLightDescriptor).toBeNull();
    expect(runtimeState.spectralLightCache.active).toBe(false);
    expect(runtimeState.spectralLightCache.rebuildPending).toBe(false);
    expect(
      runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
    ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off);
    expect(runtimeState.debugSnapshot.spectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    );
    expect(
      runtimeState.debugSnapshot.spectralLightCacheQueuedDescriptorPending,
    ).toBe(false);
    expect(runtimeState.backboneColorBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.detailColorBuffer.value.needsUpdate).toBe(false);
  });

  it("cancels pending and queued Spectral Light rebuilds when color turns static", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0.65;
    let resolveSpectral;
    let fieldComputeCalls = 0;
    let spectralComputeCalls = 0;
    const renderer = {
      computeAsync: async (node) => {
        if (node?.id === "field") {
          fieldComputeCalls += 1;
          return undefined;
        }

        spectralComputeCalls += 1;
        return new Promise((resolve) => {
          resolveSpectral = resolve;
        });
      },
    };
    const makeFrame = (colorWeight) => ({
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 48,
      backboneSlots: new Float32Array([3, 4, 6, 0.8]),
      detailSlots: new Float32Array([4, 5, 5, 0.55]),
      backboneColorSlots: new Float32Array([1, 0.1, 0.1, colorWeight]),
      detailColorSlots: new Float32Array([0.2, 0.5, 1, colorWeight]),
      bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
      transientEnergy: 0.7,
      spectralCentroid: 0.42,
      spectralFlux: 0.28,
      structureSignal: 0.74,
      energySignal: 0.68,
      changeSignal: 0.61,
      pulseSignal: 0.32,
    });

    tickRaymarchRuntime(runtimeState, makeFrame(0.5), 1, 1 / 60, renderer);
    await flushMicrotasks(1);
    expect(fieldComputeCalls).toBe(1);
    expect(spectralComputeCalls).toBe(1);
    expect(runtimeState.spectralLightCache.rebuildPending).toBe(true);

    tickRaymarchRuntime(runtimeState, makeFrame(0.7), 2, 1 / 60, renderer);
    expect(runtimeState.spectralLightCache.queuedDescriptor).toEqual(
      runtimeState.currentSpectralLightDescriptor,
    );
    expect(
      runtimeState.debugSnapshot.spectralLightCacheQueuedDescriptorPending,
    ).toBe(true);

    runtimeState.uniforms.uSpectralMix.value = 0;
    tickRaymarchRuntime(runtimeState, makeFrame(0.9), 3, 1 / 60, renderer);
    expect(runtimeState.currentSpectralLightDescriptor).toBeNull();
    expect(runtimeState.spectralLightCache.active).toBe(false);
    expect(runtimeState.spectralLightCache.ready).toBe(false);
    expect(runtimeState.spectralLightCache.rebuildPending).toBe(false);
    expect(runtimeState.spectralLightCache.activeDescriptor).toBeNull();
    expect(runtimeState.spectralLightCache.pendingDescriptor).toBeNull();
    expect(runtimeState.spectralLightCache.queuedDescriptor).toBeNull();
    expect(
      runtimeState.debugSnapshot.spectralLightCacheQueuedDescriptorPending,
    ).toBe(false);

    resolveSpectral();
    await flushMicrotasks(5);

    expect(spectralComputeCalls).toBe(1);
    expect(runtimeState.spectralLightCache.rebuildPending).toBe(false);
    expect(runtimeState.spectralLightCache.ready).toBe(false);
    expect(runtimeState.spectralLightCache.activeDescriptor).toBeNull();
    expect(runtimeState.spectralLightCache.pendingDescriptor).toBeNull();
    expect(runtimeState.spectralLightCache.rebuildCount).toBe(0);
    expect(runtimeState.spectralLightCache.queuedDescriptor).toBeNull();
    expect(
      runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
    ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off);
  });

  it("fails closed to unavailable field and off Spectral Light modes when compute is unavailable", () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({});

    try {
      tickRaymarchRuntime(
        runtimeState,
        {
          fieldState: "active",
          renderAuthority: true,
          averageAmplitude: 48,
          backboneSlots: new Float32Array([3, 4, 6, 0.8]),
          detailSlots: new Float32Array([4, 5, 5, 0.55]),
          backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
          detailColorSlots: new Float32Array([0.2, 0.5, 1, 0.5]),
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
        null,
      );

      expect(runtimeState.modalBasisCache.backend).toBe("compute");
      expect(runtimeState.spectralLightCache.backend).toBe("compute");
      expect(runtimeState.volumeMesh.visible).toBe(false);
      expect(runtimeState.volumeMesh.userData).not.toHaveProperty(
        "raymarchFieldEvaluationMode",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off);
      expect(runtimeState.debugSnapshot.modalBasisCacheFailedClosed).toBe(true);
      expect(runtimeState.debugSnapshot.spectralLightCacheFailedClosed).toBe(
        false,
      );
      expect(runtimeState.debugSnapshot.modalBasisCacheLastError).toBeNull();
      expect(runtimeState.debugSnapshot.spectralLightEvaluationMode).toBe(
        RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
      );
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("coalesces runtime topology descriptor changes while a rebuild is pending", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0;
    let resolveFirst;
    let computeCalls = 0;
    const renderer = {
      computeAsync: async () => {
        computeCalls += 1;
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      },
    };
    const makeFrame = (modeU, amplitude) => ({
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 32,
      backboneSlots: new Float32Array([modeU, 4, 6, amplitude]),
      detailSlots: new Float32Array([4, 5, 5, 0.2]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
      transientEnergy: 0.1,
      spectralCentroid: 0.2,
      spectralFlux: 0.1,
      structureSignal: 0.4,
      energySignal: 0.3,
      changeSignal: 0.08,
      pulseSignal: 0.05,
    });

    tickRaymarchRuntime(runtimeState, makeFrame(3, 0.5), 1, 1 / 60, renderer);
    tickRaymarchRuntime(runtimeState, makeFrame(5, 0.55), 2, 1 / 60, renderer);
    tickRaymarchRuntime(runtimeState, makeFrame(6, 0.6), 3, 1 / 60, renderer);
    tickRaymarchRuntime(runtimeState, makeFrame(7, 0.65), 4, 1 / 60, renderer);

    const newestDescriptor = runtimeState.currentModalBasisCacheDescriptor;
    expect(runtimeState.modalBasisCache.queuedDescriptor).toEqual(
      newestDescriptor,
    );
    expect(
      runtimeState.debugSnapshot.modalBasisCacheQueuedDescriptorPending,
    ).toBe(true);
    await Promise.resolve();
    expect(computeCalls).toBe(1);
    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(runtimeState.modalBasisCache.pendingDescriptor).toEqual(
      newestDescriptor,
    );
    expect(runtimeState.modalBasisCache.queuedDescriptor).toBeNull();
    expect(runtimeState.modalBasisCache.rebuildPending).toBe(true);
    expect(computeCalls).toBe(2);
  });

  it("streams coefficient redistribution without queueing modal-basis rebuilds", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0;
    let resolveFirst;
    let computeCalls = 0;
    const renderer = {
      computeAsync: async () => {
        computeCalls += 1;
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      },
    };
    const makeFrame = (
      amplitude,
      modalPhaseAuthority,
      transientEnergy = 0.1,
    ) => ({
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 32,
      backboneSlots: new Float32Array([3, 4, 6, amplitude]),
      detailSlots: new Float32Array([4, 5, 5, 0.2]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
      transientEnergy,
      spectralCentroid: 0.2,
      spectralFlux: 0.1,
      structureSignal: 0.4,
      energySignal: 0.3,
      changeSignal: 0.08,
      pulseSignal: 0.05,
      modalPhaseAuthority,
    });

    tickRaymarchRuntime(runtimeState, makeFrame(0.5, 0.2), 1, 1 / 60, renderer);
    tickRaymarchRuntime(
      runtimeState,
      makeFrame(0.55, 0.3, 0.2),
      2,
      1 / 60,
      renderer,
    );
    tickRaymarchRuntime(
      runtimeState,
      makeFrame(0.6, 0.4, 0.3),
      3,
      1 / 60,
      renderer,
    );
    tickRaymarchRuntime(
      runtimeState,
      makeFrame(0.65, 0.5, 0.4),
      4,
      1 / 60,
      renderer,
    );

    const newestDescriptor = runtimeState.currentModalBasisCacheDescriptor;
    expect(runtimeState.modalBasisCache.queuedDescriptor).toBeNull();
    expect(runtimeState.modalBasisCache.modalBasisCachePhaseAuthority).toBe(0);
    expect(runtimeState.debugSnapshot.modalBasisCachePhaseAuthority).toBe(0.5);
    expect(runtimeState.uniforms.uTransientEnergy.value).toBe(0.4);
    expect(
      runtimeState.debugSnapshot.modalBasisCacheQueuedDescriptorPending,
    ).toBe(false);
    await Promise.resolve();
    expect(computeCalls).toBe(1);
    resolveFirst();
    await flushMicrotasks(5);

    expect(
      runtimeState.modalBasisCache.activeDescriptor
        .modalBasisCacheSupportDiagnosticHash,
    ).not.toBe(newestDescriptor.modalBasisCacheSupportDiagnosticHash);
    expect(runtimeState.modalBasisCache.pendingDescriptor).toBeNull();
    expect(runtimeState.modalBasisCache.queuedDescriptor).toBeNull();
    expect(runtimeState.modalBasisCache.rebuildPending).toBe(false);
    expect(computeCalls).toBe(1);
  });

  it("keeps phase-only updates live without pacing or queueing cache rebuilds", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0;
    let computeCalls = 0;
    const renderer = {
      computeAsync: async () => {
        computeCalls += 1;
      },
    };
    const makeFrame = (phaseVelocity) =>
      createActiveFeatureFrame({
        backbonePhaseSlots: new Float32Array([0.1, phaseVelocity, 0.8, 0.9]),
        detailPhaseSlots: new Float32Array([0.3, 0.4, 0.8, 0.7]),
        transientEnergy: 0.05,
        changeSignal: 0.02,
        pulseSignal: 0,
        modalPhaseAuthority: 0.8,
      });

    tickRaymarchRuntime(runtimeState, makeFrame(0.2), 1, 1 / 60, renderer);
    await flushMicrotasks();
    expect(computeCalls).toBe(1);
    const activeDescriptor = runtimeState.modalBasisCache.activeDescriptor;
    const initialProjectionDrive =
      runtimeState.uniforms.uStructuralProjectionDrive.value;
    const initialProjectionConcentration =
      runtimeState.uniforms.uStructuralProjectionConcentration.value;

    const burstTime = 1 + 1 / 60;
    tickRaymarchRuntime(
      runtimeState,
      makeFrame(0.4),
      burstTime,
      1 / 60,
      renderer,
    );
    await flushMicrotasks();

    expect(computeCalls).toBe(1);
    expect(runtimeState.modalBasisCache.rebuildPending).toBe(false);
    expect(runtimeState.modalBasisCache.queuedDescriptor).toBeNull();
    expect(runtimeState.modalBasisCache.activeDescriptor).toEqual(
      activeDescriptor,
    );
    expect(
      runtimeState.currentModalBasisCacheDescriptor.modalBasisCacheTopologyHash,
    ).toBe(activeDescriptor.modalBasisCacheTopologyHash);
    expect(runtimeState.uniforms.uStructuralProjectionDrive.value).toBeCloseTo(
      initialProjectionDrive,
    );
    expect(
      runtimeState.uniforms.uStructuralProjectionConcentration.value,
    ).toBeCloseTo(initialProjectionConcentration);

    const middleTime = 1 + 2 / 60;
    tickRaymarchRuntime(
      runtimeState,
      makeFrame(0.6),
      middleTime,
      1 / 60,
      renderer,
    );
    await flushMicrotasks();

    expect(computeCalls).toBe(1);
    expect(runtimeState.modalBasisCache.rebuildPending).toBe(false);
    expect(runtimeState.modalBasisCache.queuedDescriptor).toBeNull();
    expect(runtimeState.debugSnapshot.modalBasisCacheDrawable).toBe(true);
    expect(runtimeState.debugSnapshot.modalBasisCacheDrawableState).toBe(
      "modal-basis-cache-ready-current",
    );
    expect(
      runtimeState.debugSnapshot.modalBasisCacheDrawableStaleReason,
    ).toBeNull();
    expect(
      runtimeState.debugSnapshot.modalBasisCacheDrawableBlockedReason,
    ).toBeNull();
    expect(runtimeState.volumeMesh.userData).not.toHaveProperty(
      "raymarchFieldEvaluationMode",
    );
    expect(runtimeState.volumeMesh.visible).toBe(true);
    expect(runtimeState.uniforms.uStructuralProjectionDrive.value).toBeCloseTo(
      initialProjectionDrive,
    );
    expect(
      runtimeState.uniforms.uStructuralProjectionConcentration.value,
    ).toBeCloseTo(initialProjectionConcentration);

    const submittedTime = 1 + 3 / 60;
    tickRaymarchRuntime(
      runtimeState,
      makeFrame(0.6),
      submittedTime,
      submittedTime - middleTime,
      renderer,
    );
    await flushMicrotasks();

    expect(computeCalls).toBe(1);
    expect(runtimeState.modalBasisCache.rebuildPending).toBe(false);
    expect(runtimeState.modalBasisCache.queuedDescriptor).toBeNull();
    expect(runtimeState.modalBasisCache.activeDescriptor).toEqual(
      activeDescriptor,
    );
    tickRaymarchRuntime(
      runtimeState,
      makeFrame(0.6),
      submittedTime,
      1 / 60,
      renderer,
    );
    expect(runtimeState.debugSnapshot.modalBasisCacheDrawableState).toBe(
      "modal-basis-cache-ready-current",
    );
  });

  it("does not queue phase-only updates behind a structural rebuild", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0;
    let computeCalls = 0;
    let basisComputeCalls = 0;
    let resolveSecond;
    const renderer = {
      computeAsync: async (node) => {
        computeCalls += 1;
        if (node?.id === "field") {
          basisComputeCalls += 1;
        }
        if (node?.id === "field" && basisComputeCalls === 2) {
          return new Promise((resolve) => {
            resolveSecond = resolve;
          });
        }
        return undefined;
      },
    };
    const makeFrame = (modeU, phaseVelocity) =>
      createActiveFeatureFrame({
        backboneSlots: new Float32Array([modeU, 4, 6, 0.8]),
        backbonePhaseSlots: new Float32Array([0.1, phaseVelocity, 0.8, 0.9]),
        detailPhaseSlots: new Float32Array([0.3, 0.4, 0.8, 0.7]),
        transientEnergy: 0.05,
        changeSignal: 0.02,
        pulseSignal: 0,
        modalPhaseAuthority: 0.8,
      });

    tickRaymarchRuntime(runtimeState, makeFrame(3, 0.2), 1, 1 / 60, renderer);
    await flushMicrotasks();
    expect(computeCalls).toBe(1);

    tickRaymarchRuntime(
      runtimeState,
      makeFrame(5, 0.4),
      1 + 1 / 60,
      1 / 60,
      renderer,
    );
    await flushMicrotasks();

    expect(computeCalls).toBe(2);
    expect(runtimeState.modalBasisCache.rebuildPending).toBe(true);
    expect(runtimeState.debugSnapshot.modalBasisCacheDrawable).toBe(true);
    expect(runtimeState.debugSnapshot.modalBasisCacheDrawableState).toBe(
      "modal-basis-cache-ready-stale",
    );
    expect(runtimeState.debugSnapshot.modalBasisCacheDrawableStaleReason).toBe(
      "modal-identity",
    );
    expect(
      runtimeState.debugSnapshot.modalBasisCacheDrawableBlockedReason,
    ).toBeNull();
    expect(runtimeState.volumeMesh.visible).toBe(true);

    tickRaymarchRuntime(
      runtimeState,
      makeFrame(5, 1.8),
      1 + 2 / 60,
      1 / 60,
      renderer,
    );
    tickRaymarchRuntime(
      runtimeState,
      makeFrame(5, 2.8),
      1 + 3 / 60,
      1 / 60,
      renderer,
    );

    expect(computeCalls).toBe(2);
    expect(runtimeState.modalBasisCache.queuedDescriptor).toBeNull();
    expect(
      runtimeState.debugSnapshot.modalBasisCacheQueuedDescriptorPending,
    ).toBe(false);
    expect(runtimeState.debugSnapshot.modalBasisCacheDrawable).toBe(true);
    expect(
      Array.from(
        runtimeState.modalFieldPhaseBuffer.value.array.slice(0, 8),
      ).some((value) => Math.abs(value - 2.8) < 1e-6),
    ).toBe(true);

    resolveSecond();
    await flushMicrotasks(5);
    expect(runtimeState.modalBasisCache.rebuildPending).toBe(false);
    expect(computeCalls).toBe(2);
    expect(runtimeState.modalBasisCache.queuedDescriptor).toBeNull();
    tickRaymarchRuntime(
      runtimeState,
      makeFrame(5, 2.8),
      1 + 3 / 60,
      1 / 60,
      renderer,
    );
    await flushMicrotasks();
    tickRaymarchRuntime(
      runtimeState,
      makeFrame(5, 2.8),
      1 + 3 / 60,
      1 / 60,
      renderer,
    );

    expect(runtimeState.modalBasisCache.rebuildPending).toBe(false);
    expect(runtimeState.modalBasisCache.queuedDescriptor).toBeNull();
    expect(runtimeState.debugSnapshot.modalBasisCacheDrawableState).toBe(
      "modal-basis-cache-ready-current",
    );
  });

  it("keeps low-amplitude bass rendering on the cached product path", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0;
    const renderer = {
      computeAsync: async () => undefined,
    };
    const lowBassFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 6,
      backboneSlots: new Float32Array([1, 1, 2, 0.08]),
      detailSlots: new Float32Array([2, 1, 3, 0.04]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
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
    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.volumeMesh.userData).not.toHaveProperty(
      "raymarchFieldEvaluationMode",
    );
    expect(
      runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
    ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off);
    expect(runtimeState.debugSnapshot.modalBasisCacheDrawableState).toBe(
      "modal-basis-cache-building",
    );
    await flushMicrotasks();
    tickRaymarchRuntime(runtimeState, lowBassFrame, 2, 1 / 60, renderer);
    expect(runtimeState.volumeMesh.userData).not.toHaveProperty(
      "raymarchFieldEvaluationMode",
    );
    expect(runtimeState.modalBasisCache.activeDescriptor).toEqual(
      runtimeState.currentModalBasisCacheDescriptor,
    );
  });

  it("keeps detail slots uploaded while the volume waits for the field cache", () => {
    const runtimeState = createRuntimeState();
    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 22,
        backboneSlots: new Float32Array(32),
        detailSlots: new Float32Array([4, 5, 5, 0.45, 2, 2, 6, 0.3]),
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array([
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

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.idleOverlay.visible).toBe(false);
    expect(runtimeState.uniforms.uModalFieldModeCount.value).toBe(2);
    expect(runtimeState.debugSnapshot.raymarchDebug.modeSlotCount).toBe(2);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalVarietyAudit,
    ).toMatchObject({
      semanticModeCount: 2,
      representedBasisPageModeCount: 2,
      basisAtlasPageCapacity: RAYMARCH_MODAL_BASIS_CACHE_CAPACITY,
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
        backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
        detailColorSlots: new Float32Array(32),
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

  it("pulses transient bloom without changing fixed contour sharpness", () => {
    const steadyRuntimeState = createRuntimeState();
    const transientRuntimeState = createRuntimeState();
    const steadyFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 32,
      backboneSlots: new Float32Array([3, 4, 6, 0.5]),
      detailSlots: new Float32Array([4, 5, 5, 0.2]),
      backboneColorSlots: new Float32Array([1, 1, 1, 1]),
      detailColorSlots: new Float32Array([1, 1, 1, 1]),
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
      transientRuntimeState.debugSnapshot.raymarchDebug
        .effectiveContourSharpness,
    ).toBe(
      steadyRuntimeState.debugSnapshot.raymarchDebug.effectiveContourSharpness,
    );
    expect(
      transientRuntimeState.debugSnapshot.raymarchDebug
        .effectiveContourSharpness,
    ).toBe(transientRuntimeState.baseContourSharpness);
    expect(
      transientRuntimeState.debugSnapshot.raymarchDebug.effectiveBloomStrength,
    ).toBeGreaterThan(
      steadyRuntimeState.debugSnapshot.raymarchDebug.effectiveBloomStrength,
    );
    expect(
      transientRuntimeState.debugSnapshot.raymarchDebug.effectiveBloomRadius,
    ).toBeLessThan(
      steadyRuntimeState.debugSnapshot.raymarchDebug.effectiveBloomRadius,
    );
    expect(transientRuntimeState.uniforms.uDensityGain.value).toBeLessThan(
      steadyRuntimeState.uniforms.uDensityGain.value * 1.08,
    );
  });

  it("prevents source-coupled-dominant retained tails from driving bloom washout", () => {
    const detailedRuntimeState = createRuntimeState();
    const sourceCoupledRuntimeState = createRuntimeState();
    const debugOnlyAuthorityRuntimeState = createRuntimeState();
    const detailedFrame = createActiveFeatureFrame({
      averageAmplitude: 32,
      transientEnergy: 0.08,
      spectralFlux: 0.06,
      changeSignal: 0.12,
      pulseSignal: 0.08,
      modalResponseRenderSourceCoupledEnergy: 0.22,
      modalResponseRenderResonantEnergy: 0.18,
      debug: {
        highQPhaseAuthority: 0.55,
        projectionHighQProtection: 0.42,
      },
    });
    const sourceCoupledDominantFrame = createActiveFeatureFrame({
      averageAmplitude: 32,
      transientEnergy: 0.08,
      spectralFlux: 0.06,
      changeSignal: 0.12,
      pulseSignal: 0.08,
      detailSlots: new Float32Array(32),
      modalResponseRenderSourceCoupledEnergy: 0.32,
      modalResponseRenderResonantEnergy: 0.01,
      debug: {},
    });
    const debugOnlyAuthorityFrame = createActiveFeatureFrame({
      ...sourceCoupledDominantFrame,
      debug: {
        highQPhaseAuthority: 1,
        projectionHighQProtection: 1,
      },
    });

    tickRaymarchRuntime(detailedRuntimeState, detailedFrame, 1, 1 / 60);
    tickRaymarchRuntime(
      sourceCoupledRuntimeState,
      sourceCoupledDominantFrame,
      1,
      1 / 60,
    );
    tickRaymarchRuntime(
      debugOnlyAuthorityRuntimeState,
      debugOnlyAuthorityFrame,
      1,
      1 / 60,
    );

    expect(
      sourceCoupledRuntimeState.debugSnapshot.raymarchDebug
        .modalResonantDetailAuthority,
    ).toBeLessThan(
      detailedRuntimeState.debugSnapshot.raymarchDebug
        .modalResonantDetailAuthority,
    );
    expect(
      debugOnlyAuthorityRuntimeState.debugSnapshot.raymarchDebug
        .modalSourceCoupledDominantBloomSuppression,
    ).toBeCloseTo(
      sourceCoupledRuntimeState.debugSnapshot.raymarchDebug
        .modalSourceCoupledDominantBloomSuppression,
    );
    expect(
      sourceCoupledRuntimeState.bloomTuning.effectiveStrength,
    ).toBeLessThan(detailedRuntimeState.bloomTuning.effectiveStrength);
    expect(sourceCoupledRuntimeState.bloomTuning.effectiveRadius).toBeLessThan(
      detailedRuntimeState.bloomTuning.effectiveRadius,
    );
    expect(
      sourceCoupledRuntimeState.bloomTuning.effectiveThreshold,
    ).toBeGreaterThan(detailedRuntimeState.bloomTuning.effectiveThreshold);
  });

  it("keeps the continuous response alive between adjacent active frames", () => {
    const runtimeState = createRuntimeState();
    const featureFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 18,
      backboneSlots: new Float32Array([3, 4, 6, 0.5]),
      detailSlots: new Float32Array(32),
      backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
      detailColorSlots: new Float32Array(32),
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

  it("disables automatic response when reactivity is zero", () => {
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
        backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
        detailColorSlots: new Float32Array(32),
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

    expect(runtimeState.responseEnvelope).toBe(0);
    expect(runtimeState.accentEnvelope).toBe(0);
    expect(runtimeState.motionSignal).toBe(0);
    expect(runtimeState.scaleSignal).toBe(0);
    expect(runtimeState.bloomResponseSignal).toBe(0);
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
        backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
        detailColorSlots: new Float32Array(32),
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
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.08, 0.05, 0.03, 0.01]),
      transientEnergy: 0,
      spectralCentroid: 0.16,
      spectralFlux: 0.02,
      structureSignal: 0.2,
      energySignal: 0.07,
      changeSignal: 0.03,
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
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
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

  it("passes retained high-Q modal response through canonical observation", () => {
    const baselineRuntime = createRuntimeState();
    const retainedRuntime = createRuntimeState();
    const baseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 1.24,
      backboneSlots: new Float32Array([3, 4, 6, 0.018]),
      detailSlots: new Float32Array([4, 5, 5, 0.012]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
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
      retainedRuntime.debugSnapshot.raymarchDebug.observationEnergy,
    ).toBeCloseTo(0.19);
    expect(
      retainedRuntime.debugSnapshot.raymarchDebug
        .observationReferenceDensityFloor,
    ).toBeGreaterThan(
      baselineRuntime.debugSnapshot.raymarchDebug
        .observationReferenceDensityFloor,
    );
    expect(retainedRuntime.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "retainedHighQRidgeVisibleDensityMax",
    );
  });

  it("does not let phase-coherent field author observation energy", () => {
    const runtimeState = createRuntimeState();

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 0.2,
        backboneSlots: new Float32Array(32),
        detailSlots: new Float32Array(32),
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
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
    expect(runtimeState.debugSnapshot.raymarchDebug.observationEnergy).toBe(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationReferenceDensityFloor,
    ).toBe(0);
  });

  it("passes source-coupled modal response to observation without old observer lanes", () => {
    const baselineRuntime = createRuntimeState();
    const observedRuntime = createRuntimeState();
    const baseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 0.8,
      backboneSlots: new Float32Array([3, 4, 6, 0.018]),
      detailSlots: new Float32Array([4, 5, 5, 0.012]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
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
      observedRuntime.debugSnapshot.raymarchDebug
        .observationReferenceDensityFloor,
    ).toBeGreaterThan(
      baselineRuntime.debugSnapshot.raymarchDebug
        .observationReferenceDensityFloor,
    );
    expect(
      observedRuntime.debugSnapshot.raymarchDebug
        .observationSampledDensityFloor,
    ).toBeGreaterThan(0);
    expect(
      observedRuntime.debugSnapshot.raymarchDebug.observationSampledSupport,
    ).toBeGreaterThan(0);
    expect(observedRuntime.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "observerRidgeVisibleDensityMax",
    );
  });

  it("surfaces low-Q bass through source-coupled modal response, not topology floors", () => {
    const baselineRuntime = createRuntimeState();
    const lowQRuntime = createRuntimeState();
    const baseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 0.8,
      backboneSlots: new Float32Array([1, 1, 1, 0.006, 2, 1, 1, 0.004]),
      detailSlots: new Float32Array(32),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
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
      lowQRuntime.debugSnapshot.raymarchDebug.observationReferenceDensityFloor,
    ).toBeGreaterThan(
      baselineRuntime.debugSnapshot.raymarchDebug
        .observationReferenceDensityFloor,
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
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
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
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
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
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
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

  it("releases responseEnvelope faster at high rhythmicDensity than at low", () => {
    const edmRuntime = createRuntimeState();
    const ambientRuntime = createRuntimeState();
    // Pre-charge both envelopes equally
    edmRuntime.responseEnvelope = 0.7;
    ambientRuntime.responseEnvelope = 0.7;

    const baseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 24,
      backboneSlots: new Float32Array([3, 4, 6, 0.5]),
      detailSlots: new Float32Array(32),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array(4),
      transientEnergy: 0,
      spectralCentroid: 0.2,
      spectralFlux: 0.1,
      structureSignal: 0,
      energySignal: 0,
      changeSignal: 0,
      pulseSignal: 0,
      debug: {},
    };

    tickRaymarchRuntime(
      edmRuntime,
      { ...baseFrame, rhythmicDensity: 1.0 },
      1,
      1 / 60,
    );
    tickRaymarchRuntime(
      ambientRuntime,
      { ...baseFrame, rhythmicDensity: 0.0 },
      1,
      1 / 60,
    );

    expect(edmRuntime.responseEnvelope).toBeLessThan(
      ambientRuntime.responseEnvelope,
    );
  });

  it("drops accent and beat envelopes faster than response on the first tail tick", () => {
    const runtimeState = createRuntimeState();
    runtimeState.responseEnvelope = 0.24;
    runtimeState.accentEnvelope = 0.18;
    runtimeState.beatPulseEnvelope = 0.12;
    const baselineResponse = runtimeState.responseEnvelope;
    const baselineAccent = runtimeState.accentEnvelope;
    const baselineBeat = runtimeState.beatPulseEnvelope;
    const baseThreshold = runtimeState.baseThreshold;

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 48,
        backboneSlots: new Float32Array([3, 4, 6, 0.8]),
        detailSlots: new Float32Array([4, 5, 5, 0.42]),
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
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

    const transientResponse = runtimeState.responseEnvelope;
    const transientAccent = runtimeState.accentEnvelope;
    const transientBeat = runtimeState.beatPulseEnvelope;
    const transientStrength = runtimeState.bloomTuning.effectiveStrength;
    const transientRadius = runtimeState.bloomTuning.effectiveRadius;
    const transientThreshold = runtimeState.bloomTuning.effectiveThreshold;

    expect(transientResponse).toBeGreaterThan(baselineResponse);
    expect(transientAccent).toBeGreaterThan(baselineAccent);
    expect(transientBeat).toBeGreaterThan(baselineBeat);

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 28,
        backboneSlots: new Float32Array([3, 4, 6, 0.02]),
        detailSlots: new Float32Array([4, 5, 5, 0.01]),
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
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

    expect(responseDropFraction).toBeGreaterThan(0.05);
    expect(accentDropFraction).toBeGreaterThan(0.15);
    expect(beatDropFraction).toBeGreaterThan(0.11);
    expect(accentDropFraction).toBeGreaterThan(responseDropFraction);
    expect(beatDropFraction).toBeGreaterThan(responseDropFraction);
    expect(runtimeState.bloomTuning.effectiveStrength).toBeLessThan(
      transientStrength,
    );
    expect(runtimeState.bloomTuning.effectiveRadius).toBeLessThan(
      transientRadius,
    );
    expect(runtimeState.bloomTuning.effectiveThreshold).toBeGreaterThan(
      baseThreshold,
    );
    expect(runtimeState.bloomTuning.effectiveThreshold).toBeLessThanOrEqual(
      transientThreshold + 0.02,
    );
  });
});

describe("resolveRaymarchTotalSlotAmplitude", () => {
  it("uses uploaded GPU buffer energy instead of the full descriptor total", () => {
    const descriptorSlots = new Float32Array(64);
    descriptorSlots[60 * 4 + 3] = 0.9;
    const buffer = new Float32Array(16);
    buffer[3] = 0.1;
    buffer[7] = 0.05;

    expect(sumUploadedModalFieldAmplitude(buffer, 4)).toBeCloseTo(0.15);
    expect(
      resolveRaymarchTotalSlotAmplitude(
        {
          modalFieldModeBuffer: { value: { array: buffer } },
          performanceGovernor: { modalField: { uploadedAmplitude: 1.8 } },
        },
        4,
      ),
    ).toBeCloseTo(0.15);
  });

  it("returns zero when the upload buffer is empty instead of inflating from the descriptor", () => {
    const descriptorSlots = new Float32Array(16);
    descriptorSlots[3] = 0.9;
    descriptorSlots[7] = 0.8;

    expect(
      resolveRaymarchTotalSlotAmplitude(
        { modalFieldModeBuffer: { value: { array: new Float32Array(16) } } },
        4,
      ),
    ).toBe(0);
  });
});
