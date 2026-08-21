/**
 * Offline semantic proof for the production cymatic observer.
 *
 * Production evaluates the complete cache-resolved Gor'kov field on the GPU.
 * This CPU harness proves the renderer-independent contracts around that field:
 *
 *   complete admitted descriptor
 *   -> fixed audio-time observer clock
 *   -> field-derived U=0 surface motion
 *   -> fixed-width persistent plasma carrier
 *   -> local chromatic emission and Beer-Lambert extinction
 *
 * Run from the repository root:
 *
 *   node packages/engine/scripts/reconstructionHarness.mjs
 */

import assert from "node:assert/strict";
import { SIMULATION_DEFAULTS } from "../src/defaults.js";
import { MODAL_SEMANTIC_DESCRIPTOR_CAPACITY } from "../src/core/modalBudgets.js";
import {
  CYMATIC_OBSERVER_REFERENCE,
  createCymaticObserverClockState,
  deriveCymaticObserverBlend,
  deriveCymaticPlasmaCarrier,
  deriveImplicitSurfaceBacktraceDisplacementNormalized,
  resolveCymaticObserverStep,
} from "../src/core/raymarch/cymaticObserverReference.js";
import {
  CYMATIC_PLASMA_AUDIO_ACCENT,
  deriveCymaticPlasmaTransfer,
} from "../src/core/raymarch/cymaticPlasmaTransfer.js";
import { buildModalExcitationAtlas } from "../src/utils/audio/modalExcitationAtlas.js";

const EPSILON = 1e-10;

function check(condition, message) {
  assert.equal(Boolean(condition), true, message);
}

function dot(left, right) {
  return left.reduce(
    (sum, component, index) => sum + component * right[index],
    0,
  );
}

function simulateObserverClock(renderFps, durationSeconds) {
  const state = createCymaticObserverClockState();
  const resetToken = "fixture-track|fixture-apparatus";
  resolveCymaticObserverStep(state, {
    resetToken,
    observationTimeSeconds: 0,
  });

  let fixedStepCount = 0;
  const renderFrameCount = Math.ceil(renderFps * durationSeconds);
  for (let frame = 1; frame <= renderFrameCount; frame += 1) {
    const observationTimeSeconds = Math.min(durationSeconds, frame / renderFps);
    fixedStepCount += resolveCymaticObserverStep(state, {
      resetToken,
      observationTimeSeconds,
    }).stepCount;
  }
  return { fixedStepCount, finalStepIndex: state.stepIndex };
}

function proveCompleteModalDescriptor() {
  const atlas = buildModalExcitationAtlas(SIMULATION_DEFAULTS);
  const identities = new Set(atlas.map((mode) => mode.familyId));

  check(atlas.length > 0, "the apparatus must admit at least one modal family");
  assert.equal(
    identities.size,
    atlas.length,
    "each admitted modal family must have one stable identity",
  );
  check(
    atlas.length <= MODAL_SEMANTIC_DESCRIPTOR_CAPACITY,
    "the complete admitted atlas must fit the one production descriptor",
  );
  check(
    atlas.every((mode) => mode.sourceSupported === true),
    "the descriptor must contain only apparatus-supported modal families",
  );

  return {
    admittedModeCount: atlas.length,
    descriptorCapacity: MODAL_SEMANTIC_DESCRIPTOR_CAPACITY,
    frequencyRangeHz: [
      atlas[0].naturalFrequencyHz,
      atlas.at(-1).naturalFrequencyHz,
    ],
  };
}

function proveAudioTimeOwnership() {
  const durationSeconds = 2;
  const expectedStepCount =
    durationSeconds / CYMATIC_OBSERVER_REFERENCE.fixedStepSeconds;
  const outcomes = [30, 60, 144].map((renderFps) => ({
    renderFps,
    ...simulateObserverClock(renderFps, durationSeconds),
  }));

  for (const outcome of outcomes) {
    assert.equal(outcome.fixedStepCount, expectedStepCount);
    assert.equal(outcome.finalStepIndex, expectedStepCount);
  }

  const pausedState = createCymaticObserverClockState();
  resolveCymaticObserverStep(pausedState, {
    resetToken: "paused",
    observationTimeSeconds: 1,
  });
  assert.deepEqual(
    resolveCymaticObserverStep(pausedState, {
      resetToken: "paused",
      observationTimeSeconds: 2,
      advancing: false,
    }),
    {
      reset: false,
      stepCount: 0,
      deltaTimeSeconds: 0,
      stepIndex: 60,
    },
  );

  const exposure = CYMATIC_OBSERVER_REFERENCE.geometryExposureSeconds;
  const whole = deriveCymaticObserverBlend(exposure, exposure);
  const half = deriveCymaticObserverBlend(exposure / 2, exposure);
  assert.ok(Math.abs(whole - (half + (1 - half) * half)) <= EPSILON);

  return outcomes;
}

function proveImplicitSurfaceMotion() {
  const previousPotential = -0.12;
  const currentPotential = 0.18;
  const gradient = [2, -1, 0.5];
  const displacement = deriveImplicitSurfaceBacktraceDisplacementNormalized({
    previousPotential,
    currentPotential,
    currentGradientNormalized: gradient,
  });
  const potentialDelta = currentPotential - previousPotential;

  assert.ok(Math.abs(dot(displacement, gradient) - potentialDelta) <= EPSILON);
  return { potentialDelta, displacement };
}

function proveLocalizedChromaticPlasma() {
  const center = deriveCymaticPlasmaCarrier({
    signedDistanceWorld: 0,
    surfaceNormalWorld: [0, 1, 0],
    surfaceSupport: 1,
    rayDirLocal: [0, 1, 0],
  });
  const offSheet = deriveCymaticPlasmaCarrier({
    signedDistanceWorld: CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld * 2,
    surfaceNormalWorld: [0, 1, 0],
    surfaceSupport: 1,
    rayDirLocal: [0, 1, 0],
  });
  check(
    offSheet.spineDensity < center.spineDensity * 1e-4,
    "the bright plasma spine must stay localized to the observed sheet",
  );

  const input = {
    localRadiance: 0.8,
    ...center,
    materialDensityScale: 1,
    materialColor: [0.12, 0.55, 1],
    tangentColor: [0.08, 0.72, 1],
    tangentAuthority: 1,
    tangentPower: 1,
    audioAccentGain: 0,
  };
  const base = deriveCymaticPlasmaTransfer(input);
  const accented = deriveCymaticPlasmaTransfer({
    ...input,
    audioAccentGain: 1,
  });
  const quiet = deriveCymaticPlasmaTransfer({
    ...input,
    localRadiance: 0,
    audioAccentGain: 1,
  });

  check(base.extinction > 0, "organized plasma must produce local extinction");
  check(
    base.baseRadiance[2] > base.baseRadiance[0],
    "the intrinsic plasma core must preserve local spectral chromaticity",
  );
  assert.deepEqual(quiet.sourceRadiance, base.baseRadiance);
  assert.equal(quiet.extinction, base.extinction);
  base.baseRadiance.forEach((channel, index) => {
    const maximumAccented =
      channel * (1 + CYMATIC_PLASMA_AUDIO_ACCENT) + EPSILON;
    check(
      accented.sourceRadiance[index] > channel,
      "local observer energy must articulate the persistent base carrier",
    );
    check(
      accented.sourceRadiance[index] <= maximumAccented,
      "audio articulation must stay bounded and cannot own base visibility",
    );
  });

  return {
    center,
    offSheet,
    extinction: base.extinction,
    baseRadiance: base.baseRadiance,
    accentedRadiance: accented.sourceRadiance,
  };
}

const report = {
  descriptor: proveCompleteModalDescriptor(),
  observerClock: proveAudioTimeOwnership(),
  surfaceMotion: proveImplicitSurfaceMotion(),
  plasma: proveLocalizedChromaticPlasma(),
};

console.log("Cymatic observer reconstruction proof passed.");
console.log(JSON.stringify(report, null, 2));
