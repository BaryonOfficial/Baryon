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
import { extractHarmonicPeaks, getCombinedAnalyserState } from '../utils/audioFeatures.js';
import { createModeCatalog, resolveFrequenciesToModes } from '../utils/modeCatalog.js';

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
  const audioDataBuffer  = instancedArray(capacity, 'vec4'); // [modeU,modeV,modeW,amplitude]
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
  const particlesBuffer = attributeArray(count, 'vec4'); // [x,y,z,groupTag]
  for (let i = 0; i < count; i++) {
    particlesBuffer.value.array[i * 4]     = basePositions[i * 3];
    particlesBuffer.value.array[i * 4 + 1] = basePositions[i * 3 + 1];
    particlesBuffer.value.array[i * 4 + 2] = basePositions[i * 3 + 2];
    particlesBuffer.value.array[i * 4 + 3] = 0.0;
  }
  particlesBuffer.value.needsUpdate = true;

  // ─── Uniforms ──────────────────────────────────────────────────────────────
  const uTime               = uniform(0.0);
  const uDeltaTime          = uniform(0.0);
  const uAverageAmplitude   = uniform(0.0);
  const uStarted            = uniform(0);   // int: 0=false, 1=true (bool uniforms unreliable in WGSL)
  const uRadius             = uniform(parameters.radius);
  const uThreshold          = uniform(parameters.threshold);
  const uSurfaceThreshold   = uniform(parameters.surfaceThreshold);
  const uFlowFieldInfluence = uniform(DEFAULTS.flowFieldInfluence);
  const uFlowFieldStrength  = uniform(DEFAULTS.flowFieldStrength);
  const uFlowFieldFrequency = uniform(DEFAULTS.flowFieldFrequency);
  const uParticleSpeed      = uniform(DEFAULTS.particleSpeed);
  const uDistanceThreshold  = uniform(DEFAULTS.distanceThreshold);
  const PI = float(Math.PI);

  // ─── Stage 1: audioData ────────────────────────────────────────────────────
  // Runs `capacity` threads. CPU analysis resolves each slot to a modal triplet
  // and amplitude, and this pass uploads them into the compute chain.
  const audioDataCompute = Fn(() => {
    audioDataBuffer.element(instanceIndex).assign(modeBuffer.element(instanceIndex));
  })().compute(capacity);

  // ─── Stage 2: scalarField ──────────────────────────────────────────────────
  // Runs `count` threads. Each computes the 3D Chladni standing-wave sum.
  const scalarFieldCompute = Fn(() => {
    const base = basePositionBuffer.element(instanceIndex);
    const pos  = base.xyz;
    const invR = float(1.0).div(uRadius);

    const sum = float(0.0).toVar();

    Loop(capacity, ({ i }) => {
      const w  = audioDataBuffer.element(i);
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

  // ─── Stage 3: zeroPoints ──────────────────────────────────────────────────
  // Runs `count` threads. Keeps particles whose Chladni value crosses zero.
  // When a particle is no longer near a node, its target decays back toward the
  // base distribution instead of freezing forever at a stale zero-point.
  const zeroPointsCompute = Fn(() => {
    const scalarVal = scalarFieldBuffer.element(instanceIndex);
    const baryonVal = baryonBuffer.element(instanceIndex);
    const baseVal   = basePositionBuffer.element(instanceIndex);
    const prevZero  = zeroPointsBuffer.element(instanceIndex);

    const useBaryon = uAverageAmplitude.lessThan(0.02);

    If(useBaryon, () => {
      // Silent: write logo position directly — no Chladni check needed
      zeroPointsBuffer.element(instanceIndex).assign(vec4(baryonVal.xyz, float(1.0)));
    }).Else(() => {
      // Audio active: find zero-crossings of the Chladni standing wave
      const pos     = scalarVal.xyz;
      const chladni = scalarVal.w;
      const dist    = length(pos);
      If(abs(chladni).lessThan(uThreshold), () => {
        const isOnSurface = abs(dist.sub(uRadius)).lessThanEqual(uSurfaceThreshold);
        const groupTag    = select(isOnSurface, float(1.0), float(2.0));
        zeroPointsBuffer.element(instanceIndex).assign(vec4(pos, groupTag));
      }).Else(() => {
        const relaxedPos = mix(prevZero.xyz, baseVal.xyz, float(0.08));
        const relaxedDist = length(relaxedPos);
        const relaxedSurface = abs(relaxedDist.sub(uRadius)).lessThanEqual(uSurfaceThreshold);
        const relaxedTag = select(relaxedSurface, float(1.0), float(2.0));
        zeroPointsBuffer.element(instanceIndex).assign(vec4(relaxedPos, relaxedTag));
      });
    });
  })().compute(count);

  // ─── Stage 4: particles ────────────────────────────────────────────────────
  // Runs `count` threads. Moves each particle toward its zero-point target
  // using a flow-field (MaterialX noise) + lerp.
  const particlesCompute = Fn(() => {
    const oldParticle = particlesBuffer.element(instanceIndex);
    const oldPos      = oldParticle.xyz;
    const zeroPoint   = zeroPointsBuffer.element(instanceIndex);
    const baryonPos   = baryonBuffer.element(instanceIndex).xyz;

    // Target: zero-point when playing, Baryon logo when silent
    const target   = select(uAverageAmplitude.greaterThan(0.0), zeroPoint.xyz, baryonPos);
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

    const adjustedDir  = dir.add(flowField.mul(strength));
    const movement     = adjustedDir.mul(uDeltaTime).mul(uFlowFieldStrength);

    const lerpMovement = vec3(0.0).toVar();

    If(dist.greaterThan(uDistanceThreshold), () => {
      const timeFactor     = clamp(uParticleSpeed.mul(uDeltaTime), float(0.0), float(1.0));
      const distanceFactor = smoothstep(float(0.0), float(1.0), float(1.0).sub(dist.div(dist.add(1.0))));

      const alpha = timeFactor.toVar();
      If(uStarted.equal(1), () => {
        alpha.assign(mix(distanceFactor, float(1.0), timeFactor));
      });
      const damping = float(1.0).sub(dist.mul(-5.0).exp());
      alpha.mulAssign(damping);

      const interpolated = mix(oldPos, target, alpha);
      lerpMovement.assign(interpolated.sub(oldPos));
    });

    const newPos   = oldPos.add(movement).add(lerpMovement);
    const maxR     = uRadius.mul(1.5);
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

    return vec4(mix(particleColor, holoColor, holo), 1.0);
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

  return {
    points,
    modeBuffer,
    fftBuffer,
    particlesBuffer,
    capacity,
    fftSize: audioConfig.fftSize,
    modeCatalog: createModeCatalog(parameters.radius, 12),
    previousModeIndices: new Array(capacity).fill(-1),
    uniforms: {
      uTime, uDeltaTime, uAverageAmplitude, uStarted,
      uRadius, uThreshold, uSurfaceThreshold,
      uFlowFieldInfluence, uFlowFieldStrength, uFlowFieldFrequency,
      uParticleSpeed, uDistanceThreshold,
      uColor, uSurfaceColor, uParticleSize,
    },
    compute: { audioDataCompute, scalarFieldCompute, zeroPointsCompute, particlesCompute },
  };
}

/**
 * Per-frame update: upload audio data to GPU buffers and run the compute chain.
 *
 * @param {WebGPURenderer} renderer
 * @param {object} tslState - result of setupTSL
 * @param {object} audioState - result of audioContext.getState()
 * @param {number} time
 * @param {number} deltaTime
 */
export function tickTSL(renderer, tslState, audioState, time, deltaTime) {
  const {
    modeBuffer,
    fftBuffer,
    uniforms,
    compute,
    capacity,
    fftSize,
    modeCatalog,
  } = tslState;

  // Time uniforms
  uniforms.uTime.value      = time;
  uniforms.uDeltaTime.value = deltaTime;
  uniforms.uStarted.value   = audioState.sound?.started ? 1 : 0;

  const combinedState = getCombinedAnalyserState(audioState);
  if (combinedState) {
    const { avgAmplitude, freqData } = combinedState;
    const arr = fftBuffer.value.array;
    arr.fill(0);
    for (let i = 0, n = Math.min(freqData.length, arr.length); i < n; i++) {
      arr[i] = freqData[i];
    }
    fftBuffer.value.needsUpdate = true;

    const peaks = extractHarmonicPeaks(freqData, capacity, audioState.audioCtx?.sampleRate ?? 44100, fftSize);
    const { slots, nextIndices } = resolveFrequenciesToModes(
      peaks,
      modeCatalog,
      capacity,
      tslState.previousModeIndices
    );

    modeBuffer.value.array.set(slots);
    modeBuffer.value.needsUpdate = true;
    tslState.previousModeIndices = nextIndices;
    uniforms.uAverageAmplitude.value = avgAmplitude;
  } else {
    modeBuffer.value.array.fill(0);
    modeBuffer.value.needsUpdate = true;
    fftBuffer.value.array.fill(0);
    fftBuffer.value.needsUpdate = true;
    tslState.previousModeIndices.fill(-1);
    uniforms.uAverageAmplitude.value = 0;
  }

  // ── Run sequential compute chain ──
  // renderer.compute() dispatches each pass synchronously to the WebGPU command queue.
  // WebGPU guarantees ordered execution within a queue, so each pass reads the correct
  // output from the previous pass without explicit await.
  renderer.compute(compute.audioDataCompute);
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
