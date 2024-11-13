import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useControls } from 'leva';
import { createTimeHandler } from '@/utils/timeHandler';
import { useAudioStore } from '@/store/audioStore';

// Import types
import type { GPGPUReturn, GPGPUComputation, GPGPUShaderUniforms } from '@/types/gpgpu.types';
import type { ParticleGeometries, ParticlesRef } from '@/types/particle.types';

//Import Shaders
import audioDataShader from '../shaders/gpgpu/audioData.glsl';
import scalarFieldShader from '../shaders/gpgpu/scalarField.glsl';
import zeroPointsShader from '../shaders/gpgpu/zeroPoints.glsl';
import gpgpuParticlesShader from '../shaders/gpgpu/particles.glsl';

import { useParticleSettings } from './particles/useParticleSettings';

export default function useGPGPU(
  { parameters, settings }: ReturnType<typeof useParticleSettings>,
  geometries: ParticleGeometries,
  particlesRef: React.RefObject<ParticlesRef>
): GPGPUReturn {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const { isPlaying, isMicActive, sound, fftSize, sampleRate, capacity, data, processAudioData } =
    useAudioStore();
  const timeHandler = createTimeHandler();

  const gpgpu = useMemo<GPGPUComputation | null>(() => {
    const size = Math.ceil(Math.sqrt(geometries.base.count));
    const computation = new GPUComputationRenderer(size, size, gl);

    // Particles w/ positions only for computation
    const baseParticlesTexture = computation.createTexture();

    for (let i = 0; i < geometries.base.count; i++) {
      const i3 = i * 3;
      const i4 = i * 4;

      // Position based on Geometry
      baseParticlesTexture.image.data[i4 + 0] = geometries.base.positions[i3 + 0];
      baseParticlesTexture.image.data[i4 + 1] = geometries.base.positions[i3 + 1];
      baseParticlesTexture.image.data[i4 + 2] = geometries.base.positions[i3 + 2];
      baseParticlesTexture.image.data[i4 + 3] = 1.0;
    }

    const particlesForComputation = baseParticlesTexture.clone();

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

    // gpgpu variables
    const format = gl.capabilities.isWebGL2 ? THREE.RedFormat : THREE.LuminanceFormat;
    let essentiaData = new Float32Array(capacity);

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

    // Create typed uniforms object
    const uniforms: GPGPUShaderUniforms = {
      audioDataUniforms: {
        tPitches: {
          value: new THREE.DataTexture(essentiaData, capacity, 1, THREE.RedFormat, THREE.FloatType),
        },
        tDataArray: {
          value: new THREE.DataTexture(data, fftSize / 2, 1, format),
        },
        uRadius: new THREE.Uniform(parameters.radius),
        sampleRate: new THREE.Uniform(sampleRate),
        bufferSize: new THREE.Uniform(fftSize),
        capacity: new THREE.Uniform(capacity),
      },
      scalarFieldUniforms: {
        uRadius: new THREE.Uniform(parameters.radius),
        uBase: new THREE.Uniform(particlesForComputation),
        capacity: new THREE.Uniform(capacity),
      },
      zeroPointsUniforms: {
        uThreshold: new THREE.Uniform(parameters.threshold),
        uRadius: new THREE.Uniform(parameters.radius),
        uSurfaceThreshold: new THREE.Uniform(parameters.surfaceThreshold),
        uSurfaceControl: new THREE.Uniform(true),
        uAverageAmplitude: new THREE.Uniform(0.0),
      },
      particlesUniforms: {
        uTime: new THREE.Uniform(0),
        uDeltaTime: new THREE.Uniform(0),
        uFlowFieldInfluence: new THREE.Uniform(1.0),
        uFlowFieldStrength: new THREE.Uniform(3.6),
        uFlowFieldFrequency: new THREE.Uniform(0.64),
        uThreshold: new THREE.Uniform(parameters.threshold),
        uBase: new THREE.Uniform(baryonLogoTexture),
        uAverageAmplitude: new THREE.Uniform(0.0),
        uParticleSpeed: new THREE.Uniform(32),
        uStarted: new THREE.Uniform(sound?.started ?? false),
        uParticleMovementType: new THREE.Uniform(1),
        uRadius: new THREE.Uniform(parameters.radius),
        uDistanceThreshold: new THREE.Uniform(0.5),
        uMicActive: new THREE.Uniform(isMicActive),
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
  }, [gl, parameters, geometries]);

  useLayoutEffect(() => {
    if (!gpgpu) return;

    try {
      const error = gpgpu.computation.init();
      if (error !== null) {
        console.error('GPGPU initialization failed:', error);
      }
    } catch (e) {
      console.error('GPGPU initialization error:', e);
    }
  }, [gpgpu]);

  // Debug Planes
  const [debugPlanes, setDebugPlanes] = useState<THREE.Mesh[]>([]);
  const { debugMode } = useControls({ debugMode: { value: false, label: 'Texture Debug' } });
  const { showAudioDebug } = useControls({
    showAudioDebug: {
      value: false,
      label: 'Audio Debug',
    },
  });

  useEffect(() => {
    if (!gpgpu) return;

    const audioDebug = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({
        map: gpgpu.computation.getCurrentRenderTarget(gpgpu.audioDataVariable).texture,
      })
    );
    audioDebug.visible = debugMode;
    audioDebug.position.set(-4, 2, 0);

    const scalarFieldDebug = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({
        map: gpgpu.computation.getCurrentRenderTarget(gpgpu.scalarFieldVariable).texture,
      })
    );
    scalarFieldDebug.visible = debugMode;
    scalarFieldDebug.position.set(-4, -1, 0);

    const zeroPointsDebug = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({
        map: gpgpu.computation.getCurrentRenderTarget(gpgpu.zeroPointsVariable).texture,
      })
    );
    zeroPointsDebug.visible = debugMode;
    zeroPointsDebug.position.set(-1, 2, 0);

    const particlesDebug = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({
        map: gpgpu.computation.getCurrentRenderTarget(gpgpu.particlesVariable).texture,
      })
    );
    particlesDebug.visible = debugMode;
    particlesDebug.position.set(-1, -1, 0);

    const planes = [audioDebug, scalarFieldDebug, zeroPointsDebug, particlesDebug];
    setDebugPlanes(planes);

    if (debugMode) {
      planes.forEach((plane) => scene.add(plane));
    }

    return () => {
      planes.forEach((plane) => scene.remove(plane));
    };
  }, [gpgpu, scene, debugMode]);

  useFrame(({ clock }, delta) => {
    // Early returns for all required dependencies
    if (!gpgpu) return;
    if (!particlesRef.current?.material?.uniforms) return;
    if (!particlesRef.current?.points) return;

    // Destructure after validation to ensure type safety
    const { material, points } = particlesRef.current;

    // 1. Time updates
    const { time, deltaTime } = timeHandler.handleTime(clock.elapsedTime, delta);

    // 2. Update time-based uniforms
    gpgpu.particlesVariable.material.uniforms.uTime.value = time;
    gpgpu.particlesVariable.material.uniforms.uDeltaTime.value = deltaTime;
    gpgpu.particlesVariable.material.uniforms.uStarted.value = sound?.started ?? false;
    gpgpu.particlesVariable.material.uniforms.uMicActive.value = isMicActive;

    material.uniforms.uSoundPlaying.value = isPlaying;
    material.uniforms.uTime.value = time;
    material.uniforms.uDeltaTime.value = deltaTime;

    // 3. Process audio data first
    processAudioData(gpgpu, particlesRef, showAudioDebug);

    // 4. Update dependencies before compute
    const audioTarget = gpgpu.computation.getCurrentRenderTarget(gpgpu.audioDataVariable);
    gpgpu.scalarFieldVariable.material.uniforms.uAudioData.value = audioTarget.texture;

    const scalarTarget = gpgpu.computation.getCurrentRenderTarget(gpgpu.scalarFieldVariable);
    gpgpu.zeroPointsVariable.material.uniforms.uScalarField.value = scalarTarget.texture;

    const zeroTarget = gpgpu.computation.getCurrentRenderTarget(gpgpu.zeroPointsVariable);
    gpgpu.particlesVariable.material.uniforms.uZeroPoints.value = zeroTarget.texture;

    gpgpu.computation.compute();

    const particlesTarget = gpgpu.computation.getCurrentRenderTarget(gpgpu.particlesVariable);
    material.uniforms.uParticlesTexture.value = particlesTarget.texture;

    // 5. Update rotation
    points.rotation.y += settings.rotation * deltaTime;

    // 6. Update debug planes if needed
    if (debugMode && debugPlanes.length) {
      debugPlanes.forEach((plane) => {
        if (plane.material instanceof THREE.MeshBasicMaterial && plane.material.map)
          plane.material.map.needsUpdate = true;
      });
    }
  });

  return {
    gpgpu,
  };
}
