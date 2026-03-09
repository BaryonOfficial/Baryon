import { FIELD_STATE_VALUES, isFieldDrivenState } from '../fieldState.js';
import { updateAuditSnapshot } from './auditMirror.js';

const SIGNIFICANT_MODE_AMPLITUDE = 0.05;

function getModeStructureSignature(modeSlots) {
  if (!modeSlots?.length) return '';

  const signatures = [];
  for (let i = 0; i < modeSlots.length; i += 4) {
    if ((modeSlots[i + 3] ?? 0) <= SIGNIFICANT_MODE_AMPLITUDE) {
      continue;
    }
    signatures.push(
      `${Math.round(modeSlots[i])}:${Math.round(modeSlots[i + 1])}:${Math.round(modeSlots[i + 2])}`
    );
  }

  signatures.sort();
  return signatures.join('|');
}

export function didModeStructureChange(nextSlots, prevSlots) {
  if (!nextSlots?.length || !prevSlots?.length || nextSlots.length !== prevSlots.length) {
    return true;
  }
  return getModeStructureSignature(nextSlots) !== getModeStructureSignature(prevSlots);
}

export function tickTSLRuntime(renderer, tslState, featureFrame, time, deltaTime) {
  const {
    modeBuffer,
    fftBuffer,
    uniforms,
    compute,
  } = tslState;

  uniforms.uTime.value = time;
  uniforms.uDeltaTime.value = deltaTime;
  const fieldState = featureFrame?.fieldState ?? 'idle';
  const fieldDriven = isFieldDrivenState(fieldState);
  uniforms.uFieldState.value = FIELD_STATE_VALUES[fieldState] ?? FIELD_STATE_VALUES.idle;

  if (featureFrame) {
    const arr = fftBuffer.value.array;
    arr.fill(0);
    for (let i = 0, n = Math.min(featureFrame.fftMagnitudes.length, arr.length); i < n; i++) {
      arr[i] = featureFrame.fftMagnitudes[i];
    }
    fftBuffer.value.needsUpdate = true;

    const modeArray = modeBuffer.value.array;
    modeArray.fill(0);
    if (featureFrame.modeSlots?.length) {
      modeArray.set(featureFrame.modeSlots.subarray(0, modeArray.length));
    }
    modeBuffer.value.needsUpdate = true;

    let activeModeCount = 0;
    for (let i = 0, n = Math.min(featureFrame.modeSlots.length, modeArray.length); i < n; i += 4) {
      if (featureFrame.modeSlots[i + 3] > 0) activeModeCount++;
    }
    uniforms.uActiveModeCount.value = activeModeCount;
    uniforms.uAverageAmplitude.value = featureFrame.averageAmplitude;
  } else {
    modeBuffer.value.array.fill(0);
    modeBuffer.value.needsUpdate = true;
    fftBuffer.value.array.fill(0);
    fftBuffer.value.needsUpdate = true;
    uniforms.uActiveModeCount.value = 0;
    uniforms.uAverageAmplitude.value = 0;
  }

  const modeSlotsChanged = fieldDriven && featureFrame
    ? didModeStructureChange(featureFrame.modeSlots, tslState.prevModeSlots)
    : false;
  const resetTriggered = false;
  const resetReason = 'none';

  const auditSnapshot = updateAuditSnapshot(tslState, featureFrame, deltaTime, {
    modeSlotsChanged,
    resetTriggered,
    resetReason,
  });
  tslState.debugSnapshot = featureFrame?.debug
    ? { ...featureFrame.debug, particleDebug: auditSnapshot, ...auditSnapshot }
    : auditSnapshot;

  if (featureFrame?.modeSlots) {
    tslState.prevModeSlots.fill(0);
    tslState.prevModeSlots.set(
      featureFrame.modeSlots.subarray(0, tslState.prevModeSlots.length)
    );
  } else {
    tslState.prevModeSlots.fill(0);
  }
  tslState.prevFieldState = fieldState;

  renderer.compute(compute.scalarFieldCompute);
  renderer.compute(compute.zeroPointsCompute);
  renderer.compute(compute.particlesCompute);
}
