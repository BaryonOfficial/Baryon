import * as THREE from 'three';
import {
  Fn, instancedArray, attributeArray, instanceIndex,
  uniform, float, vec3, vec4, If, Loop,
  abs, length, normalize, mix, smoothstep, clamp, pow, sin, mod,
  select, varying,
  cameraPosition, positionWorld,
  mx_noise_float,
} from 'three/tsl';
import { PointsNodeMaterial } from 'three/webgpu';
import { DEFAULTS } from '../defaults.js';

const FIELD_STATE_VALUES = Object.freeze({
  idle: 0,
  decay: 1,
  active: 2,
  test: 3,
});

function isFieldDrivenState(fieldState) {
  return fieldState === 'decay' || fieldState === 'active' || fieldState === 'test';
}

/**
 * Mirrors the sphere-volume-and-surface initialization from gpgpuSetup.
 */
function initializeParticlesInSphereVolumeAndSurface(count, radius, surfaceRatio) {
  const positions = new Float32Array(count * 3);
  const surfaceCount = Math.floor(count * surfaceRatio);

  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const angleIncrement = Math.PI * 2 * goldenRatio;
  for (let i = 0; i < surfaceCount; i++) {
    const t = i / surfaceCount;
    const inclination = Math.acos(1 - 2 * t);
    const azimuth = angleIncrement * i;
    positions[i * 3]     = radius * Math.sin(inclination) * Math.cos(azimuth);
    positions[i * 3 + 1] = radius * Math.sin(inclination) * Math.sin(azimuth);
    positions[i * 3 + 2] = radius * Math.cos(inclination);
  }
  for (let i = surfaceCount; i < count; i++) {
    const r = Math.pow(Math.random(), 1 / 3) * radius;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  return positions;
}

function initializeParticlesInSphere(count, radius) {
  const scaledRadius = radius / 10;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = Math.pow(Math.random(), 1 / 3) * scaledRadius;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  return positions;
}

function createAuditState(basePositions, initialParticlePositions, baryonPositions) {
  const sampleCount = Math.min(256, Math.max(32, Math.floor(basePositions.length / 3000)));
  const sampleIndices = new Uint32Array(sampleCount);
  const shadowParticles = new Float32Array(sampleCount * 3);
  const retainedTargets = new Float32Array(sampleCount * 4);
  const sampleBaryon = new Float32Array(sampleCount * 3);
  const stride = Math.max(1, Math.floor(basePositions.length / 3 / sampleCount));

  for (let i = 0; i < sampleCount; i++) {
    const index = Math.min(Math.floor(basePositions.length / 3) - 1, i * stride);
    sampleIndices[i] = index;
    shadowParticles[i * 3] = initialParticlePositions[index * 3];
    shadowParticles[i * 3 + 1] = initialParticlePositions[index * 3 + 1];
    shadowParticles[i * 3 + 2] = initialParticlePositions[index * 3 + 2];
    retainedTargets[i * 4] = basePositions[index * 3];
    retainedTargets[i * 4 + 1] = basePositions[index * 3 + 1];
    retainedTargets[i * 4 + 2] = basePositions[index * 3 + 2];
    retainedTargets[i * 4 + 3] = 2;
    sampleBaryon[i * 3] = baryonPositions[index * 4];
    sampleBaryon[i * 3 + 1] = baryonPositions[index * 4 + 1];
    sampleBaryon[i * 3 + 2] = baryonPositions[index * 4 + 2];
  }

  return {
    frame: 0,
    sampleIndices,
    shadowParticles,
    retainedTargets,
    sampleBaryon,
    lastSnapshot: null,
  };
}

function computeScalarFieldValue(x, y, z, modeSlots, radius) {
  let sum = 0;
  const scale = 1 / radius;

  for (let i = 0; i < modeSlots.length; i += 4) {
    const amplitude = modeSlots[i + 3];
    if (!amplitude) continue;
    const ui = modeSlots[i];
    const vi = modeSlots[i + 1];
    const wi = modeSlots[i + 2];
    sum += amplitude
      * Math.sin(ui * Math.PI * x * scale)
      * Math.sin(vi * Math.PI * y * scale)
      * Math.sin(wi * Math.PI * z * scale);
  }

  return sum;
}

function pseudoNoise3(x, y, z) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function updateAuditSnapshot(tslState, featureFrame, deltaTime) {
  const auditState = tslState.audit;
  if (!auditState || !featureFrame) {
    return null;
  }

  const {
    sampleIndices,
    shadowParticles,
    retainedTargets,
    sampleBaryon,
  } = auditState;
  const radius = tslState.uniforms.uRadius.value;
  const threshold = tslState.uniforms.uThreshold.value;
  const surfaceThreshold = tslState.uniforms.uSurfaceThreshold.value;
  const flowInfluence = tslState.uniforms.uFlowFieldInfluence.value;
  const flowStrength = tslState.uniforms.uFlowFieldStrength.value;
  const flowFrequency = tslState.uniforms.uFlowFieldFrequency.value;
  const particleSpeed = tslState.uniforms.uParticleSpeed.value;
  const distanceThreshold = tslState.uniforms.uDistanceThreshold.value;
  const movementType = tslState.uniforms.uParticleMovementType.value;
  const surfaceControl = tslState.uniforms.uSurfaceControl.value;
  const idleScale = tslState.uniforms.uIdleLogoSize.value;
  const activeModeCount = tslState.uniforms.uActiveModeCount.value;
  const minNodeRadius = radius * 0.12;
  const fieldDriven = isFieldDrivenState(featureFrame.fieldState);

  let validCount = 0;
  let surfaceCount = 0;
  let retainedCount = 0;
  let avgFieldAbs = 0;
  let avgTargetDistance = 0;
  let avgLerpMovement = 0;
  let avgFlowMovement = 0;

  for (let i = 0; i < sampleIndices.length; i++) {
    const index = sampleIndices[i];
    const baseX = tslState.basePositions[index * 3];
    const baseY = tslState.basePositions[index * 3 + 1];
    const baseZ = tslState.basePositions[index * 3 + 2];
    const field = computeScalarFieldValue(baseX, baseY, baseZ, featureFrame.modeSlots, radius);
    avgFieldAbs += Math.abs(field);
    const dist = Math.hypot(baseX, baseY, baseZ);
    const isOnSurface = Math.abs(dist - radius) <= surfaceThreshold;
    const isValid =
      activeModeCount > 0 &&
      dist > minNodeRadius &&
      Math.abs(field) < threshold &&
      (!isOnSurface || surfaceControl !== 0);
    const targetOffset = i * 4;

    if (fieldDriven) {
      if (isValid) {
        retainedTargets[targetOffset] = baseX;
        retainedTargets[targetOffset + 1] = baseY;
        retainedTargets[targetOffset + 2] = baseZ;
        retainedTargets[targetOffset + 3] = isOnSurface ? 1 : 2;
        validCount++;
        if (isOnSurface) surfaceCount++;
      } else {
        retainedCount++;
      }
    } else {
      retainedTargets[targetOffset] = sampleBaryon[i * 3] * idleScale;
      retainedTargets[targetOffset + 1] = sampleBaryon[i * 3 + 1] * idleScale;
      retainedTargets[targetOffset + 2] = sampleBaryon[i * 3 + 2] * idleScale;
      retainedTargets[targetOffset + 3] = 1;
    }

    const shadowOffset = i * 3;
    const oldX = shadowParticles[shadowOffset];
    const oldY = shadowParticles[shadowOffset + 1];
    const oldZ = shadowParticles[shadowOffset + 2];
    const targetX = retainedTargets[targetOffset];
    const targetY = retainedTargets[targetOffset + 1];
    const targetZ = retainedTargets[targetOffset + 2];
    const toTargetX = targetX - oldX;
    const toTargetY = targetY - oldY;
    const toTargetZ = targetZ - oldZ;
    const targetDist = Math.hypot(toTargetX, toTargetY, toTargetZ);
    avgTargetDistance += targetDist;

    const invLen = 1 / (targetDist + 0.0001);
    const dirX = toTargetX * invLen;
    const dirY = toTargetY * invLen;
    const dirZ = toTargetZ * invLen;
    const nx = pseudoNoise3(oldX * flowFrequency, oldY * flowFrequency, oldZ * flowFrequency + tslState.uniforms.uTime.value);
    const ny = pseudoNoise3(oldX * flowFrequency + 1, oldY * flowFrequency, oldZ * flowFrequency + tslState.uniforms.uTime.value);
    const nz = pseudoNoise3(oldX * flowFrequency + 2, oldY * flowFrequency, oldZ * flowFrequency + tslState.uniforms.uTime.value);
    const flowLen = Math.hypot(nx, ny, nz) || 1;
    const flowX = nx / flowLen;
    const flowY = ny / flowLen;
    const flowZ = nz / flowLen;
    const rawStrength = (pseudoNoise3(targetX * 0.2, targetY * 0.2, targetZ * 0.2 + tslState.uniforms.uTime.value + 1) + 1) * 0.5;
    const influence = (flowInfluence - 0.5) * -2.0;
    const strength = Math.max(0, Math.min(1, (rawStrength - influence) / Math.max(1e-5, 1 - influence)));
    const flowBlend = fieldDriven
      ? Math.max(0, Math.min(1, targetDist / Math.max(1e-4, distanceThreshold + 0.0001)))
      : 0;
    const adjustedDirX = dirX + flowX * strength * flowBlend;
    const adjustedDirY = dirY + flowY * strength * flowBlend;
    const adjustedDirZ = dirZ + flowZ * strength * flowBlend;
    const flowMoveX = adjustedDirX * deltaTime * flowStrength;
    const flowMoveY = adjustedDirY * deltaTime * flowStrength;
    const flowMoveZ = adjustedDirZ * deltaTime * flowStrength;
    avgFlowMovement += Math.hypot(flowMoveX, flowMoveY, flowMoveZ);

    const timeFactor = Math.max(0, Math.min(1, particleSpeed * deltaTime));
    const distanceFactor = Math.max(0, Math.min(1, targetDist / (distanceThreshold + 1)));
    let alpha = timeFactor;
    if (fieldDriven && movementType === 1) {
      alpha = (timeFactor * 0.35) * (1 - distanceFactor) + distanceFactor;
    } else if (!fieldDriven) {
      alpha = Math.min(0.06, timeFactor * 0.12);
    }
    alpha *= 1 - Math.exp(-targetDist * 5);
    const lerpMoveX = (targetX - oldX) * alpha;
    const lerpMoveY = (targetY - oldY) * alpha;
    const lerpMoveZ = (targetZ - oldZ) * alpha;
    avgLerpMovement += Math.hypot(lerpMoveX, lerpMoveY, lerpMoveZ);

    let newX = oldX + flowMoveX + lerpMoveX;
    let newY = oldY + flowMoveY + lerpMoveY;
    let newZ = oldZ + flowMoveZ + lerpMoveZ;
    const newLen = Math.hypot(newX, newY, newZ);
    if (newLen > radius) {
      const inv = radius / newLen;
      newX *= inv;
      newY *= inv;
      newZ *= inv;
    }
    shadowParticles[shadowOffset] = newX;
    shadowParticles[shadowOffset + 1] = newY;
    shadowParticles[shadowOffset + 2] = newZ;
  }

  const divisor = sampleIndices.length || 1;
  const snapshot = {
    zeroPointOccupancy: validCount / divisor,
    zeroPointValidCount: validCount,
    zeroPointSurfaceCount: surfaceCount,
    retainedZeroPointCount: retainedCount,
    avgFieldAbs: avgFieldAbs / divisor,
    avgTargetDistance: avgTargetDistance / divisor,
    avgLerpMovement: avgLerpMovement / divisor,
    avgFlowMovement: avgFlowMovement / divisor,
  };

  auditState.frame += 1;
  auditState.lastSnapshot = snapshot;
  return snapshot;
}

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

/**
 * Sets up all TSL storage buffers, compute nodes, and the particle Points mesh.
 *
 * @param {THREE.BufferGeometry} baryonGeometry - The scaled Baryon logo geometry
 * @param {object} parameters - { count, radius, surfaceRatio, surfaceThreshold, threshold }
 * @param {object} audioConfig  - { capacity, fftSize, sampleRate }
 * @returns {object} tslState — pass to tickTSL and dispose
 */
export function setupTSL(baryonGeometry, parameters, audioConfig) {
  const count       = parameters.count;
  const capacity    = audioConfig.capacity;
  const fftHalfSize = audioConfig.fftSize / 2;

  // ─── Input storage buffers ─────────────────────────────────────────────────
  // Resolved mode triplets + amplitude per slot, uploaded each frame from CPU analysis.
  const modeBuffer = instancedArray(capacity, 'vec4');
  modeBuffer.value.array.fill(0);
  modeBuffer.value.needsUpdate = true;

  // FFT bin magnitudes, normalized to [0,1] (updated each frame from analyser)
  const fftBuffer = instancedArray(fftHalfSize, 'float');

  // ─── Base positions (uploaded once) ────────────────────────────────────────
  const basePositions = initializeParticlesInSphereVolumeAndSurface(
    count, parameters.radius, parameters.surfaceRatio
  );
  const basePositionBuffer = instancedArray(count, 'vec4');
  for (let i = 0; i < count; i++) {
    basePositionBuffer.value.array[i * 4]     = basePositions[i * 3];
    basePositionBuffer.value.array[i * 4 + 1] = basePositions[i * 3 + 1];
    basePositionBuffer.value.array[i * 4 + 2] = basePositions[i * 3 + 2];
    basePositionBuffer.value.array[i * 4 + 3] = 1.0;
  }
  basePositionBuffer.value.needsUpdate = true;

  // ─── Baryon logo positions (uploaded once, wraps if count > logo verts) ────
  const logoAttr  = baryonGeometry.attributes.position;
  const logoCount = logoAttr.count;
  const baryonBuffer = instancedArray(count, 'vec4');
  for (let i = 0; i < count; i++) {
    const j = i % logoCount;
    baryonBuffer.value.array[i * 4]     = logoAttr.array[j * 3];
    baryonBuffer.value.array[i * 4 + 1] = logoAttr.array[j * 3 + 1];
    baryonBuffer.value.array[i * 4 + 2] = logoAttr.array[j * 3 + 2];
    baryonBuffer.value.array[i * 4 + 3] = Math.random();
  }
  baryonBuffer.value.needsUpdate = true;

  // ─── Compute intermediate buffers ─────────────────────────────────────────
  const scalarFieldBuffer = instancedArray(count, 'vec4');   // [x,y,z,chladniValue]
  const zeroPointsBuffer  = instancedArray(count, 'vec4');   // [x,y,z,groupTag]

  // Initialise zeroPoints with base positions so particles don't rush to origin
  for (let i = 0; i < count; i++) {
    zeroPointsBuffer.value.array[i * 4]     = basePositions[i * 3];
    zeroPointsBuffer.value.array[i * 4 + 1] = basePositions[i * 3 + 1];
    zeroPointsBuffer.value.array[i * 4 + 2] = basePositions[i * 3 + 2];
    zeroPointsBuffer.value.array[i * 4 + 3] = 2.0; // volume group
  }
  zeroPointsBuffer.value.needsUpdate = true;

  // ─── Particle buffer (compute output + vertex attribute for rendering) ──────
  // attributeArray → StorageBufferAttribute → vertex step mode (per-vertex read in render)
  const initialParticlePositions = initializeParticlesInSphere(count, parameters.radius);
  const particlesBuffer = attributeArray(count, 'vec4'); // [x,y,z,groupTag]
  for (let i = 0; i < count; i++) {
    particlesBuffer.value.array[i * 4]     = initialParticlePositions[i * 3];
    particlesBuffer.value.array[i * 4 + 1] = initialParticlePositions[i * 3 + 1];
    particlesBuffer.value.array[i * 4 + 2] = initialParticlePositions[i * 3 + 2];
    particlesBuffer.value.array[i * 4 + 3] = 0.0;
  }
  particlesBuffer.value.needsUpdate = true;

  // ─── Uniforms ──────────────────────────────────────────────────────────────
  const uTime               = uniform(0.0);
  const uDeltaTime          = uniform(0.0);
  const uAverageAmplitude   = uniform(0.0);
  const uFieldState         = uniform(FIELD_STATE_VALUES.idle);
  const uRadius             = uniform(parameters.radius);
  const uThreshold          = uniform(parameters.threshold);
  const uSurfaceThreshold   = uniform(parameters.surfaceThreshold);
  const uFlowFieldInfluence = uniform(DEFAULTS.flowFieldInfluence);
  const uFlowFieldStrength  = uniform(DEFAULTS.flowFieldStrength);
  const uFlowFieldFrequency = uniform(DEFAULTS.flowFieldFrequency);
  const uParticleSpeed      = uniform(DEFAULTS.particleSpeed);
  const uDistanceThreshold  = uniform(DEFAULTS.distanceThreshold);
  const uActiveModeCount    = uniform(0);
  const uSurfaceControl     = uniform(1);
  const uParticleMovementType = uniform(1);
  const uIdleLogoIntensity  = uniform(DEFAULTS.idleLogoIntensity);
  const uIdleLogoAlpha      = uniform(DEFAULTS.idleLogoAlpha);
  const uIdleLogoSize       = uniform(DEFAULTS.idleLogoSize);
  const PI = float(Math.PI);

  // ─── Stage 1: scalarField ──────────────────────────────────────────────────
  // Runs `count` threads. Each computes the 3D Chladni standing-wave sum.
  const scalarFieldCompute = Fn(() => {
    const base = basePositionBuffer.element(instanceIndex);
    const pos  = base.xyz;
    const invR = float(1.0).div(uRadius);

    const sum = float(0.0).toVar();

    Loop(capacity, ({ i }) => {
      const w  = modeBuffer.element(i);
      const Ai = w.w;
      const ui = w.x;
      const vi = w.y;
      const wi = w.z;
      sum.addAssign(
        Ai
          .mul(sin(ui.mul(PI).mul(pos.x).mul(invR)))
          .mul(sin(vi.mul(PI).mul(pos.y).mul(invR)))
          .mul(sin(wi.mul(PI).mul(pos.z).mul(invR)))
      );
    });

    scalarFieldBuffer.element(instanceIndex).assign(vec4(pos, sum));
  })().compute(count);

  // ─── Stage 2: zeroPoints ──────────────────────────────────────────────────
  // Runs `count` threads. Keeps particles whose Chladni value crosses zero.
  // Non-node particles retain their last valid nodal target so the field can
  // morph over time instead of collapsing back onto the base sphere surface.
  const zeroPointsCompute = Fn(() => {
    const scalarVal = scalarFieldBuffer.element(instanceIndex);
    const baryonVal = baryonBuffer.element(instanceIndex);
    const prevZero = zeroPointsBuffer.element(instanceIndex);
    const scaledBaryonPos = baryonVal.xyz.mul(uIdleLogoSize);

    const useBaryon = uFieldState.equal(FIELD_STATE_VALUES.idle);

    If(useBaryon, () => {
      // Silent: write logo position directly — no Chladni check needed
      zeroPointsBuffer.element(instanceIndex).assign(vec4(scaledBaryonPos, float(1.0)));
    }).Else(() => {
      If(uActiveModeCount.lessThanEqual(0), () => {
        zeroPointsBuffer.element(instanceIndex).assign(prevZero);
      }).Else(() => {
        // Audio active: find zero-crossings of the Chladni standing wave
        const pos     = scalarVal.xyz;
        const chladni = scalarVal.w;
        const dist    = length(pos);
        If(dist.greaterThan(uRadius.mul(0.12)).and(abs(chladni).lessThan(uThreshold)), () => {
          const isOnSurface = abs(dist.sub(uRadius)).lessThanEqual(uSurfaceThreshold);
          const groupTag    = select(isOnSurface, float(1.0), float(2.0));
          If(isOnSurface.and(uSurfaceControl.equal(0)), () => {
            zeroPointsBuffer.element(instanceIndex).assign(prevZero);
          }).Else(() => {
            zeroPointsBuffer.element(instanceIndex).assign(vec4(pos, groupTag));
          });
        }).Else(() => {
          zeroPointsBuffer.element(instanceIndex).assign(prevZero);
        });
      });
    });
  })().compute(count);

  // ─── Stage 3: particles ────────────────────────────────────────────────────
  // Runs `count` threads. Moves each particle toward its zero-point target
  // using a flow-field (MaterialX noise) + lerp.
  const particlesCompute = Fn(() => {
    const oldParticle = particlesBuffer.element(instanceIndex);
    const oldPos      = oldParticle.xyz;
    const zeroPoint   = zeroPointsBuffer.element(instanceIndex);
    const baryonPos   = baryonBuffer.element(instanceIndex).xyz.mul(uIdleLogoSize);

    // Target: zero-point whenever the modal field is driving the system,
    // otherwise Baryon logo in idle mode.
    const target   = select(uFieldState.greaterThan(FIELD_STATE_VALUES.idle), zeroPoint.xyz, baryonPos);
    const toTarget = target.sub(oldPos);
    const dist     = length(toTarget);
    // Safe normalize: avoids NaN when particle reaches its target exactly
    const dir      = toTarget.div(dist.add(0.0001));

    // Flow field — materialX 3D Perlin noise used as 4D simplex approximation
    const freq     = uFlowFieldFrequency;
    const nPos     = oldPos.mul(freq);
    const nx       = mx_noise_float(vec3(nPos.x,        nPos.y, nPos.z.add(uTime)));
    const ny       = mx_noise_float(vec3(nPos.x.add(1.0), nPos.y, nPos.z.add(uTime)));
    const nz       = mx_noise_float(vec3(nPos.x.add(2.0), nPos.y, nPos.z.add(uTime)));
    const flowField = normalize(vec3(nx, ny, nz));

    const rawStrength  = mx_noise_float(vec3(target.mul(0.2).add(vec3(0.0, 0.0, uTime.add(1.0)))));
    const influence    = uFlowFieldInfluence.sub(0.5).mul(-2.0);
    const strength     = smoothstep(influence, float(1.0), rawStrength);
    const flowBlend    = select(
      uFieldState.greaterThan(FIELD_STATE_VALUES.idle),
      clamp(dist.div(uDistanceThreshold.add(0.0001)), float(0.0), float(1.0)),
      float(0.0)
    );

    const adjustedDir  = dir.add(flowField.mul(strength).mul(flowBlend));
    const movement     = adjustedDir.mul(uDeltaTime).mul(uFlowFieldStrength);

    const lerpMovement = vec3(0.0).toVar();
    const timeFactor     = clamp(uParticleSpeed.mul(uDeltaTime), float(0.0), float(1.0));
    const distanceFactor = smoothstep(float(0.0), uDistanceThreshold.add(float(1.0)), dist);

    const alpha = timeFactor.toVar();
    If(uFieldState.greaterThan(FIELD_STATE_VALUES.idle).and(uParticleMovementType.equal(1)), () => {
      alpha.assign(mix(timeFactor.mul(0.35), float(1.0), distanceFactor));
    }).Else(() => {
      alpha.assign(timeFactor.mul(0.12));
    });
    const damping = float(1.0).sub(dist.mul(-5.0).exp());
    alpha.mulAssign(damping);

    const interpolated = mix(oldPos, target, alpha);
    lerpMovement.assign(interpolated.sub(oldPos));

    const newPos   = oldPos.add(movement).add(lerpMovement);
    const maxR     = uRadius;
    const pLen     = length(newPos);
    const finalPos = select(pLen.greaterThan(maxR), normalize(newPos).mul(maxR), newPos);

    particlesBuffer.element(instanceIndex).assign(vec4(finalPos, zeroPoint.w));
  })().compute(count);

  // ─── Particle material ─────────────────────────────────────────────────────
  const uColor        = uniform(new THREE.Color(DEFAULTS.color));
  const uSurfaceColor = uniform(new THREE.Color(DEFAULTS.surfaceColor));

  // Pass per-vertex group tag from buffer to fragment stage via a varying
  const vGroupTag = varying(particlesBuffer.toAttribute().w, 'vGroupTag');

  const colorNode = Fn(() => {
    const groupTag   = vGroupTag; // interpolated from vertex stage

    // Holographic stripes + Fresnel
    const stripes   = pow(mod(positionWorld.y.sub(uTime.mul(0.02)).mul(20.0), float(1.0)), float(3.0));
    const radialN   = normalize(positionWorld); // radial normal (identity transform assumed)
    const viewDir   = normalize(positionWorld.sub(cameraPosition));
    const fresnel   = pow(abs(float(1.0).sub(viewDir.negate().dot(radialN))), float(2.0));
    const holoColor = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 0.0, 1.0), fresnel);
    const falloff   = smoothstep(float(0.8), float(0.0), fresnel);
    const holo      = fresnel.mul(stripes).add(fresnel.mul(1.25)).mul(falloff);

    // Color by group tag
    const defaultBlue  = vec3(0.35686, 0.57255, 0.96078);
    const particleColor = select(
      groupTag.equal(float(1.0)), uSurfaceColor,
      select(groupTag.equal(float(2.0)), uColor, defaultBlue)
    );
    const logoIntensity = select(uFieldState.equal(FIELD_STATE_VALUES.idle), uIdleLogoIntensity, float(1.0));
    const finalColor = mix(particleColor, holoColor, holo).mul(logoIntensity);
    const alpha = select(uFieldState.equal(FIELD_STATE_VALUES.idle), uIdleLogoAlpha, float(1.0));

    return vec4(finalColor, alpha);
  })();

  const uParticleSize = uniform(DEFAULTS.particleSize);

  const particleMaterial = new PointsNodeMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  particleMaterial.positionNode = particlesBuffer.toAttribute().xyz;
  particleMaterial.colorNode    = colorNode;
  particleMaterial.sizeNode     = uParticleSize;

  // Dummy geometry — gives WebGPU the vertex count; positionNode overrides positions
  const geom     = new THREE.BufferGeometry();
  const dummyPos = new Float32Array(count * 3);
  geom.setAttribute('position', new THREE.BufferAttribute(dummyPos, 3));

  const points = new THREE.Points(geom, particleMaterial);
  const audit = createAuditState(basePositions, initialParticlePositions, baryonBuffer.value.array);

  return {
    points,
    modeBuffer,
    fftBuffer,
    particlesBuffer,
    zeroPointsBuffer,
    capacity,
    fftSize: audioConfig.fftSize,
    baseThreshold: parameters.threshold,
    basePositions,
    prevModeSlots: new Float32Array(capacity * 4),
    prevFieldState: 'idle',
    audit,
    uniforms: {
      uTime, uDeltaTime, uAverageAmplitude, uFieldState,
      uRadius, uThreshold, uSurfaceThreshold,
      uFlowFieldInfluence, uFlowFieldStrength, uFlowFieldFrequency,
      uParticleSpeed, uDistanceThreshold, uActiveModeCount, uSurfaceControl, uParticleMovementType,
      uIdleLogoIntensity, uIdleLogoAlpha, uIdleLogoSize,
      uColor, uSurfaceColor, uParticleSize,
    },
    compute: { scalarFieldCompute, zeroPointsCompute, particlesCompute },
  };
}

/**
 * Per-frame update: upload audio data to GPU buffers and run the compute chain.
 *
 * @param {import('three/webgpu').WebGPURenderer} renderer
 * @param {object} tslState - result of setupTSL
 * @param {object} featureFrame - CPU-resolved audio feature frame
 * @param {number} time
 * @param {number} deltaTime
 */
export function tickTSL(renderer, tslState, featureFrame, time, deltaTime) {
  const {
    modeBuffer,
    fftBuffer,
    particlesBuffer,
    uniforms,
    compute,
    zeroPointsBuffer,
    basePositions,
  } = tslState;

  // Time uniforms
  uniforms.uTime.value      = time;
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
    ? {
        ...featureFrame.debug,
        ...auditSnapshot,
      }
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

  // ── Run sequential compute chain ──
  // renderer.compute() dispatches each pass synchronously to the WebGPU command queue.
  // WebGPU guarantees ordered execution within a queue, so each pass reads the correct
  // output from the previous pass without explicit await.
  renderer.compute(compute.scalarFieldCompute);
  renderer.compute(compute.zeroPointsCompute);
  renderer.compute(compute.particlesCompute);
}

/**
 * Clean up GPU resources.
 */
export function disposeTSL(tslState) {
  tslState.points.geometry.dispose();
  tslState.points.material.dispose();
}
