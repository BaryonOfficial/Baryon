import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useControls } from 'leva';
import { useTimeHandler } from '@/hooks/useTimeHandler.tsx';
import { useAudioStore } from '@/store/audioStore.ts';

// Import types
import type { GPGPUReturn, GPGPUComputation, GPGPUShaderUniforms } from '@/types/gpgpu.types.ts';
import type { ParticleGeometries, ParticlesRef } from '@/types/particle.types.ts';

//Import Shaders
import audioDataShader from '@/shaders/gpgpu/audioData.glsl';
import scalarFieldShader from '@/shaders/gpgpu/scalarField.glsl';
import zeroPointsShader from '@/shaders/gpgpu/zeroPoints.glsl';
import gpgpuParticlesShader from '@/shaders/gpgpu/particles.glsl';

import { useParticleSettingsContext } from '@/contexts/useParticleSettingsContext';

function generateRandomPitches(capacity: number) {
  const pitches = new Float32Array(capacity);
  for (let i = 0; i < capacity; i++) {
    pitches[i] = 200 + Math.random() * 2000;
  }
  return pitches;
}

export function useGPGPU(
  geometries: ParticleGeometries,
  particlesRef: React.RefObject<ParticlesRef>
): GPGPUReturn {
  const { parameters, settings } = useParticleSettingsContext();
  const gl = useThree((state) => state.gl);
  const { isPlaying, fftSize, sampleRate, capacity, data, processAudioData } = useAudioStore();
  const timeHandler = useTimeHandler();

  // Add refs for textures
  const audioDataTextureRef = useRef<THREE.Texture | null>(null);
  const scalarFieldTextureRef = useRef<THREE.Texture | null>(null);
  const zeroPointsTextureRef = useRef<THREE.Texture | null>(null);
  const particlesTextureRef = useRef<THREE.Texture | null>(null);

  const gpgpu = useMemo<GPGPUComputation>(() => {
    const size = Math.ceil(Math.sqrt(parameters.count));
    const computation = new GPUComputationRenderer(size, size, gl);

    // Particles w/ positions only for computation
    const baseParticlesTexture = computation.createTexture();
    for (let i = 0; i < parameters.count; i++) {
      const i3 = i * 3;
      const i4 = i * 4;

      // Position based on Geometry
      baseParticlesTexture.image.data[i4 + 0] = geometries.base.positions[i3 + 0];
      baseParticlesTexture.image.data[i4 + 1] = geometries.base.positions[i3 + 1];
      baseParticlesTexture.image.data[i4 + 2] = geometries.base.positions[i3 + 2];
      baseParticlesTexture.image.data[i4 + 3] = 1.0;
    }

    // Logo made out of particles, initial positions
    const baryonLogoTexture = computation.createTexture();

    if (geometries.secondary.instance && geometries.secondary.instance.attributes.position) {
      for (let i = 0; i < geometries.secondary.count; i++) {
        const i3 = i * 3;
        const i4 = i * 4;

        // Position based on geometry
        baryonLogoTexture.image.data[i4 + 0] =
          geometries.secondary.instance.attributes.position.array[i3 + 0];
        baryonLogoTexture.image.data[i4 + 1] =
          geometries.secondary.instance.attributes.position.array[i3 + 1];
        baryonLogoTexture.image.data[i4 + 2] =
          geometries.secondary.instance.attributes.position.array[i3 + 2];
        baryonLogoTexture.image.data[i4 + 3] = Math.random();
      }
    }

    /**
     * Create all textures first
     */

    const audioDataTexture = computation.createTexture();
    const scalarTexture = computation.createTexture();
    const zeroPointsTexture = computation.createTexture();
    const particlesTexture = computation.createTexture();

    /**
     * Create all variables
     */
    const audioDataVariable = computation.addVariable(
      'uAudioData',
      audioDataShader,
      audioDataTexture
    );

    const scalarFieldVariable = computation.addVariable(
      'uScalarField',
      scalarFieldShader,
      scalarTexture
    );

    const zeroPointsVariable = computation.addVariable(
      'uZeroPoints',
      zeroPointsShader,
      zeroPointsTexture
    );

    const particlesVariable = computation.addVariable(
      'uParticles',
      gpgpuParticlesShader,
      particlesTexture
    );

    // Add refs for textures
    audioDataTextureRef.current = audioDataTexture;
    scalarFieldTextureRef.current = scalarTexture;
    zeroPointsTextureRef.current = zeroPointsTexture;
    particlesTextureRef.current = particlesTexture;

    const format = gl.capabilities.isWebGL2 ? THREE.RedFormat : THREE.LuminanceFormat;
    const essentiaData = new Float32Array(capacity);
    const randomPitches = generateRandomPitches(capacity);

    // Create typed uniforms object
    const uniforms: GPGPUShaderUniforms = {
      audioDataUniforms: {
        tPitches: {
          value: new THREE.DataTexture(essentiaData, capacity, 1, format, THREE.FloatType),
        },
        tDataArray: {
          value: new THREE.DataTexture(data, fftSize / 2, 1, format),
        },
        uRadius: new THREE.Uniform(parameters.radius),
        sampleRate: new THREE.Uniform(sampleRate),
        bufferSize: new THREE.Uniform(fftSize),
        capacity: new THREE.Uniform(capacity),
        uRandomPitches: new THREE.Uniform(randomPitches),
      },
      scalarFieldUniforms: {
        uRadius: new THREE.Uniform(parameters.radius),
        uBase: new THREE.Uniform(baseParticlesTexture),
        capacity: new THREE.Uniform(capacity),
      },
      zeroPointsUniforms: {
        uThreshold: new THREE.Uniform(parameters.threshold),
        uRadius: new THREE.Uniform(parameters.radius),
        uSurfaceThreshold: new THREE.Uniform(parameters.surfaceThreshold),
        uSurfaceControl: new THREE.Uniform(parameters.surfaceControl),
        uAverageAmplitude: new THREE.Uniform(0.0),
      },
      particlesUniforms: {
        uTime: new THREE.Uniform(0),
        uDeltaTime: new THREE.Uniform(0),
        uFlowFieldInfluence: new THREE.Uniform(parameters.flowFieldInfluence),
        uFlowFieldStrength: new THREE.Uniform(parameters.flowFieldStrength),
        uFlowFieldFrequency: new THREE.Uniform(parameters.flowFieldFrequency),
        uBase: new THREE.Uniform(baryonLogoTexture),
        uAverageAmplitude: new THREE.Uniform(0.0),
        uParticleSpeed: new THREE.Uniform(parameters.particleSpeed),
        uRadius: new THREE.Uniform(parameters.radius),
        uDistanceThreshold: new THREE.Uniform(parameters.distanceThreshold),
      },
    };

    // Assign uniforms to variables
    audioDataVariable.material.uniforms = uniforms.audioDataUniforms;
    scalarFieldVariable.material.uniforms = uniforms.scalarFieldUniforms;
    zeroPointsVariable.material.uniforms = uniforms.zeroPointsUniforms;
    particlesVariable.material.uniforms = uniforms.particlesUniforms;

    // Set dependencies
    computation.setVariableDependencies(audioDataVariable, []);
    computation.setVariableDependencies(scalarFieldVariable, [audioDataVariable]);
    computation.setVariableDependencies(zeroPointsVariable, [scalarFieldVariable]);
    computation.setVariableDependencies(particlesVariable, [zeroPointsVariable, particlesVariable]);

    // Initialize GPGPU computation while we know the state
    const error = computation.init();
    if (error) {
      // 1. Throw an error to be caught by error boundary
      throw new Error(`GPGPU initialization failed: ${error}`);
    }

    return {
      computation,
      audioDataVariable,
      scalarFieldVariable,
      zeroPointsVariable,
      particlesVariable,
      essentiaData,
      size,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, geometries, parameters.count, capacity, fftSize, sampleRate]);

  // Cleanup effect right after creation
  useEffect(() => {
    return () => {
      if (!gpgpu) return;

      const variables = [
        gpgpu.audioDataVariable,
        gpgpu.scalarFieldVariable,
        gpgpu.zeroPointsVariable,
        gpgpu.particlesVariable,
      ];

      variables.forEach((variable) => {
        if (!variable) return;
        variable.renderTargets?.forEach((target) => target?.dispose());
        variable.material?.dispose();
        Object.values(variable.material?.uniforms || {}).forEach((uniform) => {
          if (uniform.value instanceof THREE.Texture) {
            uniform.value.dispose();
          }
        });
      });

      gpgpu.computation?.dispose();
    };
  }, [gpgpu]);

  const { audioProcessing: showAudioDebug } = useControls(
    'Debug Views',
    {
      audioProcessing: {
        value: false,
        label: 'Show Audio Logs',
      },
    },
    {
      collapsed: true,
    }
  );

  // Update gpgpu variables uniforms
  useEffect(() => {
    if (!gpgpu) return;

    // Audio data uniforms
    gpgpu.audioDataVariable.material.uniforms.uRadius.value = parameters.radius;

    // Scalar field uniforms
    gpgpu.scalarFieldVariable.material.uniforms.uRadius.value = parameters.radius;

    // Zero points uniforms
    gpgpu.zeroPointsVariable.material.uniforms.uThreshold.value = parameters.threshold;
    gpgpu.zeroPointsVariable.material.uniforms.uRadius.value = parameters.radius;
    gpgpu.zeroPointsVariable.material.uniforms.uSurfaceThreshold.value =
      parameters.surfaceThreshold;
    gpgpu.zeroPointsVariable.material.uniforms.uSurfaceControl.value = parameters.surfaceControl;

    // Particles uniforms
    gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence.value =
      parameters.flowFieldInfluence;
    gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength.value =
      parameters.flowFieldStrength;
    gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency.value =
      parameters.flowFieldFrequency;
    gpgpu.particlesVariable.material.uniforms.uParticleSpeed.value = parameters.particleSpeed;
    gpgpu.particlesVariable.material.uniforms.uRadius.value = parameters.radius;
    gpgpu.particlesVariable.material.uniforms.uDistanceThreshold.value =
      parameters.distanceThreshold;
  }, [
    gpgpu,
    parameters.radius,
    parameters.threshold,
    parameters.surfaceThreshold,
    parameters.surfaceControl,
    parameters.flowFieldInfluence,
    parameters.flowFieldStrength,
    parameters.flowFieldFrequency,
    parameters.particleSpeed,
    parameters.distanceThreshold,
  ]);

  useFrame(({ clock }, delta) => {
    if (!gpgpu || !particlesRef?.current) return;

    // Destructure after validation to ensure type safety
    const { material, points } = particlesRef.current;
    if (!material?.uniforms || !points) return;

    // 1. Update all time-based uniforms in one batch
    const { time, deltaTime } = timeHandler.handleTime(clock.elapsedTime, delta);
    const timeUniforms = {
      uTime: time,
      uDeltaTime: deltaTime,
      uSoundPlaying: isPlaying,
    };
    Object.entries(timeUniforms).forEach(([key, value]) => {
      if (material?.uniforms?.[key]) {
        material.uniforms[key].value = value;
      }
      if (gpgpu?.particlesVariable?.material?.uniforms?.[key]) {
        gpgpu.particlesVariable.material.uniforms[key].value = value;
      }
    });

    // gpgpu.audioDataVariable.material.uniforms.uRandomPitches.value = generateRandomPitches(capacity);

    // 2. Process audio before GPGPU compute to avoid stalling
    processAudioData(gpgpu, particlesRef, showAudioDebug);

    // 3. Compute GPGPU
    gpgpu.computation.compute();

    // 4. Update textures and dependencies
    const targets = gpgpu.computation;
    gpgpu.scalarFieldVariable.material.uniforms.uAudioData.value = targets.getCurrentRenderTarget(
      gpgpu.audioDataVariable
    ).texture;
    gpgpu.zeroPointsVariable.material.uniforms.uScalarField.value = targets.getCurrentRenderTarget(
      gpgpu.scalarFieldVariable
    ).texture;
    gpgpu.particlesVariable.material.uniforms.uZeroPoints.value = targets.getCurrentRenderTarget(
      gpgpu.zeroPointsVariable
    ).texture;
    material.uniforms.uParticlesTexture.value = targets.getCurrentRenderTarget(
      gpgpu.particlesVariable
    ).texture;

    // Update refs for debug planes
    [audioDataTextureRef, scalarFieldTextureRef, zeroPointsTextureRef, particlesTextureRef].forEach(
      (ref, i) => {
        ref.current = targets.getCurrentRenderTarget(
          [
            gpgpu.audioDataVariable,
            gpgpu.scalarFieldVariable,
            gpgpu.zeroPointsVariable,
            gpgpu.particlesVariable,
          ][i]
        ).texture;
      }
    );

    // 5. Update rotation
    points.rotation.y += settings.rotation * deltaTime;
  });

  return {
    gpgpu,
    audioDataTexture: audioDataTextureRef,
    scalarFieldTexture: scalarFieldTextureRef,
    zeroPointsTexture: zeroPointsTextureRef,
    particlesTexture: particlesTextureRef,
  };
}
