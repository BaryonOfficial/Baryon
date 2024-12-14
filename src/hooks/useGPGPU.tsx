import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { useLayoutEffect, useMemo, useRef, useEffect } from 'react';
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

import { useParticleSettingsContext } from '@/contexts/ParticleSettingsContext';

function generateRandomPitches(capacity: number) {
  const pitches = new Float32Array(capacity);
  for (let i = 0; i < capacity; i++) {
    pitches[i] = 200 + Math.random() * 2000;
  }
  return pitches;
}

export default function useGPGPU(
  geometries: ParticleGeometries,
  particlesRef: React.RefObject<ParticlesRef>
): GPGPUReturn {
  const { parameters, settings } = useParticleSettingsContext();
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const { isPlaying, fftSize, sampleRate, capacity, data, processAudioData } = useAudioStore();
  const timeHandler = useTimeHandler();

  // Add refs for textures
  const audioDataTextureRef = useRef<THREE.Texture | null>(null);
  const scalarFieldTextureRef = useRef<THREE.Texture | null>(null);
  const zeroPointsTextureRef = useRef<THREE.Texture | null>(null);
  const particlesTextureRef = useRef<THREE.Texture | null>(null);

  const gpgpu = useMemo<GPGPUComputation | null>(() => {
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

    return {
      computation,
      audioDataVariable,
      scalarFieldVariable,
      zeroPointsVariable,
      particlesVariable,
      essentiaData,
      size,
    };
  }, [gl, geometries, parameters.count]);

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

  useLayoutEffect(() => {
    if (!gpgpu) return;
    const error = gpgpu.computation.init();
    if (error !== null) {
      console.error(error);
    }
  }, [gpgpu]);

  // Debug Planes
  const debugPlanesRef = useRef<THREE.Mesh[]>([]);
  const { debugMode } = useControls({ debugMode: { value: false, label: 'Texture Debug' } });
  const { showAudioDebug } = useControls({
    showAudioDebug: {
      value: false,
      label: 'Audio Debug',
    },
  });

  useLayoutEffect(() => {
    if (!gpgpu || !debugMode) return;

    // Create debug planes
    const audioDebug = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({
        map: audioDataTextureRef.current,
      })
    );
    audioDebug.position.set(-4, 2, 0);

    const scalarFieldDebug = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({
        map: scalarFieldTextureRef.current,
      })
    );
    scalarFieldDebug.position.set(-4, -1, 0);

    const zeroPointsDebug = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({
        map: zeroPointsTextureRef.current,
      })
    );
    zeroPointsDebug.position.set(-1, 2, 0);

    const particlesDebug = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({
        map: particlesTextureRef.current,
      })
    );
    particlesDebug.position.set(-1, -1, 0);

    const planes = [audioDebug, scalarFieldDebug, zeroPointsDebug, particlesDebug];
    debugPlanesRef.current = planes;

    planes.forEach((plane) => scene.add(plane));

    // Cleanup
    return () => {
      planes.forEach((plane) => {
        scene.remove(plane);
        plane.geometry.dispose();
        if (plane.material instanceof THREE.MeshBasicMaterial) {
          plane.material.dispose();
        }
      });
      debugPlanesRef.current = [];
    };
  }, [
    gpgpu,
    scene,
    debugMode,
    audioDataTextureRef.current,
    scalarFieldTextureRef.current,
    zeroPointsTextureRef.current,
    particlesTextureRef.current,
  ]);

  useFrame(({ clock }, delta) => {
    if (!gpgpu || !particlesRef?.current) return;

    // Destructure after validation to ensure type safety
    const { material, points } = particlesRef.current;
    if (!material?.uniforms || !points) return;

    // 1. Time updates
    const { time, deltaTime } = timeHandler.handleTime(clock.elapsedTime, delta);

    // 2. Update time-based uniforms
    gpgpu.particlesVariable.material.uniforms.uTime.value = time;
    gpgpu.particlesVariable.material.uniforms.uDeltaTime.value = deltaTime;

    material.uniforms.uSoundPlaying.value = isPlaying;
    material.uniforms.uTime.value = time;
    material.uniforms.uDeltaTime.value = deltaTime;

    // gpgpu.audioDataVariable.material.uniforms.uRandomPitches.value = generateRandomPitches(capacity);

    // 3. Process audio data
    processAudioData(gpgpu, particlesRef, showAudioDebug);

    // 4. Compute GPGPU
    gpgpu.computation.compute();

    // 5. Update textures and dependencies
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

    // 6. Update rotation
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
