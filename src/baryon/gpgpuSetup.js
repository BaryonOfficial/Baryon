import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

import gpgpuParticlesShader from '../shaders/gpgpu/particles.glsl';
import scalarFieldShader from '../shaders/gpgpu/scalarField.glsl';
import zeroPointsShader from '../shaders/gpgpu/zeroPoints.glsl';
import audioDataShader from '../shaders/gpgpu/audioData.glsl';

import { audioObject } from '../audio/audioSetup';

/**
 * GPU Compute
 */

function initializeParticlesInSphereVolumeAndSurface(count, radius, surfaceRatio) {
  const positions = new Float32Array(count * 3);
  const surfaceCount = Math.floor(count * surfaceRatio);
  // const volumeCount = count - surfaceCount;

  // Generate points on the surface
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const angleIncrement = Math.PI * 2 * goldenRatio;
  for (let i = 0; i < surfaceCount; i++) {
    const t = i / surfaceCount;
    const inclination = Math.acos(1 - 2 * t);
    const azimuth = angleIncrement * i;
    const x = radius * Math.sin(inclination) * Math.cos(azimuth);
    const y = radius * Math.sin(inclination) * Math.sin(azimuth);
    const z = radius * Math.cos(inclination);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  // Generate points within the volume
  for (let i = surfaceCount; i < count; i++) {
    const r = Math.pow(Math.random(), 1 / 3) * radius;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  return positions;
}

function initializeParticlesInSphere(count, radius) {
  // Scale down the radius to 1/10th
  const scaledRadius = radius / 10;

  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Use the scaled radius in the calculation
    const r = Math.pow(Math.random(), 1 / 3) * scaledRadius; // Adjust the power to 1/3 for uniform distribution within the sphere
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  return positions;
}

export function gpgpuSetup(baseGeometry, renderer, parameters, baseGeometry2) {
  // Setup
  const gpgpu = {};
  gpgpu.size = Math.ceil(Math.sqrt(baseGeometry.count));
  gpgpu.computation = new GPUComputationRenderer(gpgpu.size, gpgpu.size, renderer);

  // Particles w/ positions only for computation
  const baseParticlesTexture = gpgpu.computation.createTexture();

  baseGeometry.positions = initializeParticlesInSphereVolumeAndSurface(
    parameters.count,
    parameters.radius,
    parameters.surfaceRatio
  );

  for (let i = 0; i < baseGeometry.count; i++) {
    const i3 = i * 3;
    const i4 = i * 4;

    // Position based on Geometry
    baseParticlesTexture.image.data[i4 + 0] = baseGeometry.positions[i3 + 0];
    baseParticlesTexture.image.data[i4 + 1] = baseGeometry.positions[i3 + 1];
    baseParticlesTexture.image.data[i4 + 2] = baseGeometry.positions[i3 + 2];
    baseParticlesTexture.image.data[i4 + 3] = 1.0;
  }

  const baryonLogoTexture = gpgpu.computation.createTexture();

  for (let i = 0; i < baseGeometry2.count; i++) {
    const i3 = i * 3;
    const i4 = i * 4;

    // Position based on geometry
    baryonLogoTexture.image.data[i4 + 0] = baseGeometry2.geometry.attributes.position.array[i3 + 0];
    baryonLogoTexture.image.data[i4 + 1] = baseGeometry2.geometry.attributes.position.array[i3 + 1];
    baryonLogoTexture.image.data[i4 + 2] = baseGeometry2.geometry.attributes.position.array[i3 + 2];
    baryonLogoTexture.image.data[i4 + 3] = Math.random();
  }

  // Initalization of particles for movement
  const initialParticlesTexture = gpgpu.computation.createTexture();
  const initialPositions = initializeParticlesInSphere(parameters.count, parameters.radius);

  for (let i = 0; i < baseGeometry.count; i++) {
    const i3 = i * 3;
    const i4 = i * 4;

    initialParticlesTexture.image.data[i4 + 0] = initialPositions[i3 + 0];
    initialParticlesTexture.image.data[i4 + 1] = initialPositions[i3 + 1];
    initialParticlesTexture.image.data[i4 + 2] = initialPositions[i3 + 2];
    initialParticlesTexture.image.data[i4 + 3] = 1.0;
  }

  function generateRandomPitches(capacity) {
    const pitches = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) {
      // Generate a random pitch, for example between 200 Hz and 2000 Hz
      pitches[i] = 200 + Math.random() * 2000;
    }
    return pitches;
  }

  const randomPitches = generateRandomPitches(audioObject.capacity);

  // Global Uniform Variables
  const waveUniforms = {
    pitches: { value: randomPitches },
  };

  /**
   * AudioData Variable
   */
  const audioDataTexture = gpgpu.computation.createTexture();
  gpgpu.audioDataVariable = gpgpu.computation.addVariable(
    'uAudioData',
    audioDataShader,
    audioDataTexture
  );

  // Audio Data & Uniforms
  const format = renderer.capabilities.isWebGL2 ? THREE.RedFormat : THREE.LuminanceFormat;
  let essentiaData = new Float32Array(audioObject.capacity);

  gpgpu.audioDataVariable.material.uniforms.tPitches = {
    value: new THREE.DataTexture(
      essentiaData,
      audioObject.capacity,
      1,
      THREE.RedFormat,
      THREE.FloatType
    ),
  };
  gpgpu.audioDataVariable.material.uniforms.tDataArray = {
    value: new THREE.DataTexture(
      audioObject.analyser.data, // Initial empty data
      audioObject.fftSize / 2,
      1,
      format
    ),
  };
  gpgpu.audioDataVariable.material.uniforms.uRadius = new THREE.Uniform(parameters.radius);
  gpgpu.audioDataVariable.material.uniforms.sampleRate = new THREE.Uniform(
    audioObject.audioCtx.sampleRate
  );
  gpgpu.audioDataVariable.material.uniforms.bufferSize = new THREE.Uniform(audioObject.fftSize);
  gpgpu.audioDataVariable.material.uniforms.capacity = new THREE.Uniform(audioObject.capacity);
  gpgpu.audioDataVariable.material.uniforms.uRandomPitches = waveUniforms.pitches;

  // Dependencies
  gpgpu.computation.setVariableDependencies(gpgpu.audioDataVariable, []);

  /**
   * ScalarField Variable
   */
  const scalarTexture = gpgpu.computation.createTexture();
  gpgpu.scalarFieldVariable = gpgpu.computation.addVariable(
    'uScalarField',
    scalarFieldShader,
    scalarTexture
  );

  gpgpu.scalarFieldVariable.material.uniforms.uRadius = new THREE.Uniform(parameters.radius);
  gpgpu.scalarFieldVariable.material.uniforms.uBase = new THREE.Uniform(baseParticlesTexture);
  gpgpu.scalarFieldVariable.material.uniforms.capacity = new THREE.Uniform(audioObject.capacity);

  // Dependencies
  gpgpu.computation.setVariableDependencies(gpgpu.scalarFieldVariable, [gpgpu.audioDataVariable]);

  /**
   * ZeroPoints Variable
   */
  gpgpu.zeroPointsVariable = gpgpu.computation.addVariable(
    'uZeroPoints',
    zeroPointsShader,
    gpgpu.computation.createTexture()
  );

  gpgpu.zeroPointsVariable.material.uniforms.uThreshold = new THREE.Uniform(parameters.threshold);
  gpgpu.zeroPointsVariable.material.uniforms.uRadius = new THREE.Uniform(parameters.radius);
  gpgpu.zeroPointsVariable.material.uniforms.uSurfaceThreshold = new THREE.Uniform(
    parameters.surfaceThreshold
  );
  gpgpu.zeroPointsVariable.material.uniforms.uSurfaceControl = new THREE.Uniform(true);
  gpgpu.zeroPointsVariable.material.uniforms.uAverageAmplitude = new THREE.Uniform(0.0);

  // Dependencies
  gpgpu.computation.setVariableDependencies(gpgpu.zeroPointsVariable, [gpgpu.scalarFieldVariable]);

  /**
   * Particles Variable
   */
  gpgpu.particlesVariable = gpgpu.computation.addVariable(
    'uParticles',
    gpgpuParticlesShader,
    baseParticlesTexture
  );

  // Uniforms
  gpgpu.particlesVariable.material.uniforms.uTime = new THREE.Uniform(0);
  gpgpu.particlesVariable.material.uniforms.uDeltaTime = new THREE.Uniform(0);
  gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence = new THREE.Uniform(1.0);
  gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength = new THREE.Uniform(3.6);
  gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency = new THREE.Uniform(0.64);
  gpgpu.particlesVariable.material.uniforms.uThreshold = new THREE.Uniform(parameters.threshold);
  gpgpu.particlesVariable.material.uniforms.uBase = new THREE.Uniform(baryonLogoTexture);
  gpgpu.particlesVariable.material.uniforms.uAverageAmplitude = new THREE.Uniform(0.0);
  gpgpu.particlesVariable.material.uniforms.uParticleSpeed = new THREE.Uniform(36);
  gpgpu.particlesVariable.material.uniforms.uStarted = new THREE.Uniform(audioObject.sound.started);
  gpgpu.particlesVariable.material.uniforms.uParticleMovementType = new THREE.Uniform(1);
  gpgpu.particlesVariable.material.uniforms.uRadius = new THREE.Uniform(parameters.radius);
  gpgpu.particlesVariable.material.uniforms.uDistanceThreshold = new THREE.Uniform(0.8);
  gpgpu.particlesVariable.material.uniforms.uMicActive = new THREE.Uniform(
    audioObject.gumStream && audioObject.gumStream.active
  );

  // Dependencies
  gpgpu.computation.setVariableDependencies(gpgpu.particlesVariable, [
    gpgpu.zeroPointsVariable,
    gpgpu.particlesVariable,
  ]);

  //******************************************************* GPGPU INITIALIZATION *******************************************************//

  gpgpu.computation.init();

  // Debug Planes
  let mode = false;
  gpgpu.audioDebug = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3),
    new THREE.MeshBasicMaterial({
      map: gpgpu.computation.getCurrentRenderTarget(gpgpu.audioDataVariable).texture,
    })
  );
  gpgpu.audioDebug.visible = mode;
  gpgpu.audioDebug.position.x = -4;
  gpgpu.audioDebug.position.y = 2;

  const scalarFieldDebug = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3),
    new THREE.MeshBasicMaterial({
      map: gpgpu.computation.getCurrentRenderTarget(gpgpu.scalarFieldVariable).texture,
    })
  );
  scalarFieldDebug.visible = mode;
  scalarFieldDebug.position.x = -4;
  scalarFieldDebug.position.y = 1;

  const zeroPointsDebug = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3), // The size of the plane can be adjusted as needed
    new THREE.MeshBasicMaterial({
      map: gpgpu.computation.getCurrentRenderTarget(gpgpu.zeroPointsVariable).texture,
    })
  );
  zeroPointsDebug.visible = mode;
  zeroPointsDebug.position.x = -4;
  zeroPointsDebug.position.y = -1;

  gpgpu.particlesDebug = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3),
    new THREE.MeshBasicMaterial({
      map: gpgpu.computation.getCurrentRenderTarget(gpgpu.particlesVariable).texture,
    })
  );
  gpgpu.particlesDebug.visible = mode;
  gpgpu.particlesDebug.position.x = -4;
  gpgpu.particlesDebug.position.y = -2;

  if (mode) {
    scene.add(gpgpu.audioDebug);
    scene.add(scalarFieldDebug);
    scene.add(zeroPointsDebug);
    scene.add(gpgpu.particlesDebug);
  }

  return { gpgpu: gpgpu, essentiaData: essentiaData };
}
