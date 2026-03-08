import { FIELD_STATE_VALUES, isFieldDrivenState } from '../fieldState.js';
import { updateAuditSnapshot } from './auditMirror.js';

function didModeSlotsChange(nextSlots, prevSlots, epsilon = 1e-4) {
  if (!nextSlots?.length || !prevSlots?.length || nextSlots.length !== prevSlots.length) {
    return true;
  }

  for (let i = 0; i < nextSlots.length; i++) {
    if (Math.abs(nextSlots[i] - prevSlots[i]) > epsilon) {
      return true;
    }
  }

  return false;
}

export function tickTSLRuntime(renderer, tslState, featureFrame, time, deltaTime) {
  const {
    modeBuffer,
    fftBuffer,
    particlesBuffer,
    uniforms,
    compute,
    zeroPointsBuffer,
    basePositions,
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

  const auditSnapshot = updateAuditSnapshot(tslState, featureFrame, deltaTime);
  tslState.debugSnapshot = featureFrame?.debug
    ? { ...featureFrame.debug, ...auditSnapshot }
    : auditSnapshot;

  const modeSlotsChanged = fieldDriven && featureFrame
    ? didModeSlotsChange(featureFrame.modeSlots, tslState.prevModeSlots)
    : false;

  if ((fieldDriven && tslState.prevFieldState === 'idle') || modeSlotsChanged) {
    const arr = zeroPointsBuffer.value.array;
    const particleArr = particlesBuffer.value.array;
    const particleCount = basePositions ? basePositions.length / 3 : particleArr.length / 4;
    for (let i = 0; i < particleCount; i++) {
      arr[i * 4] = particleArr[i * 4];
      arr[i * 4 + 1] = particleArr[i * 4 + 1];
      arr[i * 4 + 2] = particleArr[i * 4 + 2];
      arr[i * 4 + 3] = 2.0;
    }
    zeroPointsBuffer.value.needsUpdate = true;

    if (tslState.audit) {
      const { sampleIndices, retainedTargets, shadowParticles } = tslState.audit;
      for (let i = 0; i < sampleIndices.length; i++) {
        const sampleIndex = sampleIndices[i];
        retainedTargets[i * 4] = particleArr[sampleIndex * 4];
        retainedTargets[i * 4 + 1] = particleArr[sampleIndex * 4 + 1];
        retainedTargets[i * 4 + 2] = particleArr[sampleIndex * 4 + 2];
        retainedTargets[i * 4 + 3] = 2.0;
        shadowParticles[i * 3] = retainedTargets[i * 4];
        shadowParticles[i * 3 + 1] = retainedTargets[i * 4 + 1];
        shadowParticles[i * 3 + 2] = retainedTargets[i * 4 + 2];
      }
    }
  }

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
