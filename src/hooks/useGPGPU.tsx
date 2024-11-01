import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useControls } from 'leva';

// Import types
import type { 
  GPGPUReturn, 
  GPGPUParameters, 
  GPGPUGeometries, 
  GPGPUAudioObject ,
  GPGPUComputation
} from '@/types/gpgpu'

//Import Shaders
import audioDataShader from '../shaders/gpgpu/audioData.glsl';
import scalarFieldShader from '../shaders/gpgpu/scalarField.glsl';
import zeroPointsShader from '../shaders/gpgpu/zeroPoints.glsl';
import gpgpuParticlesShader from '../shaders/gpgpu/particles.glsl';

//Utils
import {
  initializeParticlesInSphereVolumeAndSurface,
  initializeParticlesInSphere,
} from '@/utils/particles';

export default function useGPGPU(
  parameters: GPGPUParameters,
  geometries: GPGPUGeometries,
  audioObject: GPGPUAudioObject
): GPGPUReturn {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  const audioDataTextureRef = useRef<THREE.Texture | null>(null)
  const scalarTextureRef = useRef<THREE.Texture | null>(null)
  const zeroPointsTextureRef = useRef<THREE.Texture | null>(null)
  const particlesTextureRef = useRef<THREE.Texture | null>(null)

  const gpgpu = useMemo<GPGPUComputation | null>(() => {
    if (!audioObject?.isReady) return null;

    const size = Math.ceil(Math.sqrt(geometries.base.count));
    const computation = new GPUComputationRenderer(size, size, gl);

    // Particles w/ positions only for computation
    const baseParticlesTexture = computation.createTexture();

    geometries.base.positions = initializeParticlesInSphereVolumeAndSurface(
      parameters.count,
      parameters.radius,
      parameters.surfaceRatio
    );

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

    // gpgpu variables

    /**
     * AudioData Variable
     */
    const audioDataTexture = computation.createTexture();
    const audioDataVariable = computation.addVariable(
      'uAudioData',
      audioDataShader,
      audioDataTexture
    );

    // Uniforms
    const format = gl.capabilities.isWebGL2 ? THREE.RedFormat : THREE.LuminanceFormat;
    let essentiaData = new Float32Array(audioObject.capacity);

    audioDataVariable.material.uniforms.tPitches = {
      value: new THREE.DataTexture(
        essentiaData,
        audioObject.capacity,
        1,
        THREE.RedFormat,
        THREE.FloatType
      ),
    };
    audioDataVariable.material.uniforms.tDataArray = {
      value: new THREE.DataTexture(
        audioObject.analyser.data, // Initial empty data
        audioObject.fftSize / 2,
        1,
        format
      ),
    };
    audioDataVariable.material.uniforms.uRadius = new THREE.Uniform(parameters.radius);
    audioDataVariable.material.uniforms.sampleRate = new THREE.Uniform(
      audioObject.audioCtx.sampleRate
    );
    audioDataVariable.material.uniforms.bufferSize = new THREE.Uniform(audioObject.fftSize);
    audioDataVariable.material.uniforms.capacity = new THREE.Uniform(audioObject.capacity);

    // Dependencies
    computation.setVariableDependencies(audioDataVariable, []);

    audioDataTextureRef.current = audioDataTexture;

    /**
     * ScalarField Variable
     */
    const scalarTexture = computation.createTexture();
    const scalarFieldVariable = computation.addVariable(
      'uScalarField',
      scalarFieldShader,
      scalarTexture
    );

    scalarFieldVariable.material.uniforms.uRadius = new THREE.Uniform(parameters.radius);
    scalarFieldVariable.material.uniforms.uBase = new THREE.Uniform(particlesForComputation);
    scalarFieldVariable.material.uniforms.capacity = new THREE.Uniform(audioObject.capacity);

    // Dependencies
    computation.setVariableDependencies(scalarFieldVariable, [audioDataVariable]);

    scalarTextureRef.current = scalarTexture;

    /**
     * ZeroPoints Variable
     */
    const zeroPointsTexture = computation.createTexture();
    const zeroPointsVariable = computation.addVariable(
      'uZeroPoints',
      zeroPointsShader,
      zeroPointsTexture
    );

    zeroPointsVariable.material.uniforms.uThreshold = new THREE.Uniform(parameters.threshold);
    zeroPointsVariable.material.uniforms.uRadius = new THREE.Uniform(parameters.radius);
    zeroPointsVariable.material.uniforms.uSurfaceThreshold = new THREE.Uniform(
      parameters.surfaceThreshold
    );
    zeroPointsVariable.material.uniforms.uSurfaceControl = new THREE.Uniform(true);
    zeroPointsVariable.material.uniforms.uAverageAmplitude = new THREE.Uniform(0.0);

    // Dependencies
    computation.setVariableDependencies(zeroPointsVariable, [scalarFieldVariable]);

    zeroPointsTextureRef.current = zeroPointsTexture;

    /**
     * Particles Variable
     */
    const particlesTexture = computation.createTexture();
    const particlesVariable = computation.addVariable(
      'uParticles',
      gpgpuParticlesShader,
      particlesTexture
    );

    // Uniforms
    particlesVariable.material.uniforms.uTime = new THREE.Uniform(0);
    particlesVariable.material.uniforms.uDeltaTime = new THREE.Uniform(0);
    particlesVariable.material.uniforms.uFlowFieldInfluence = new THREE.Uniform(1.0);
    particlesVariable.material.uniforms.uFlowFieldStrength = new THREE.Uniform(3.6);
    particlesVariable.material.uniforms.uFlowFieldFrequency = new THREE.Uniform(0.64);
    particlesVariable.material.uniforms.uThreshold = new THREE.Uniform(parameters.threshold);
    particlesVariable.material.uniforms.uBase = new THREE.Uniform(baryonLogoTexture);
    particlesVariable.material.uniforms.uAverageAmplitude = new THREE.Uniform(0.0);
    particlesVariable.material.uniforms.uParticleSpeed = new THREE.Uniform(32);
    particlesVariable.material.uniforms.uStarted = new THREE.Uniform(audioObject.sound.started);
    particlesVariable.material.uniforms.uParticleMovementType = new THREE.Uniform(1);
    particlesVariable.material.uniforms.uRadius = new THREE.Uniform(parameters.radius);
    particlesVariable.material.uniforms.uDistanceThreshold = new THREE.Uniform(0.5);
    particlesVariable.material.uniforms.uMicActive = new THREE.Uniform(
      audioObject.gumStream && audioObject.gumStream.active
    );

    // Dependencies
    computation.setVariableDependencies(particlesVariable, [zeroPointsVariable, particlesVariable]);

    particlesTextureRef.current = particlesTexture;

    return {
      computation,
      audioDataVariable,
      scalarFieldVariable,
      zeroPointsVariable,
      particlesVariable,
      essentiaData,
      size,
    };
  }, [gl, parameters, geometries, audioObject]);

  useLayoutEffect(() => {
    if (!gpgpu?.computation) return
    const error = gpgpu.computation.init()
    if (error !== null) {
      console.error(error)
    }
  }, [gpgpu])

  // Debug Planes
  const [debugPlanes, setDebugPlanes] = useState<THREE.Mesh[]>([])
  const { debugMode } = useControls({ debugMode: false });

  useEffect(() => {
    if (!gpgpu) return

    const audioDebug = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({
        map: gpgpu.computation.getCurrentRenderTarget(gpgpu.audioDataVariable).texture,
      })
    )
    audioDebug.visible = debugMode
    audioDebug.position.set(-4, 2, 0)

    const scalarFieldDebug = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({
        map: gpgpu.computation.getCurrentRenderTarget(gpgpu.scalarFieldVariable).texture,
      })
    )
    scalarFieldDebug.visible = debugMode
    scalarFieldDebug.position.set(-4, 1, 0)

    const zeroPointsDebug = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({
        map: gpgpu.computation.getCurrentRenderTarget(gpgpu.zeroPointsVariable).texture,
      })
    )
    zeroPointsDebug.visible = debugMode
    zeroPointsDebug.position.set(-4, -1, 0)

    const particlesDebug = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({
        map: gpgpu.computation.getCurrentRenderTarget(gpgpu.particlesVariable).texture,
      })
    )
    particlesDebug.visible = debugMode
    particlesDebug.position.set(-4, -2, 0)

    const planes = [audioDebug, scalarFieldDebug, zeroPointsDebug, particlesDebug]
    setDebugPlanes(planes)

    if (debugMode) {
      planes.forEach(plane => scene.add(plane))
    }

    return () => {
      planes.forEach(plane => scene.remove(plane))
    }
  }, [gpgpu, scene, debugMode])

  useFrame(() => {
    if (debugMode && debugPlanes.length && gpgpu) {
      debugPlanes.forEach((plane) => {
        if (plane.material instanceof THREE.MeshBasicMaterial) {
          plane.material.map!.needsUpdate = true
        }
      })
    }
  })

  return {
    audioDataTexture: audioDataTextureRef,
    scalarTexture: scalarTextureRef,
    zeroPointsTexture: zeroPointsTextureRef,
    particlesTexture: particlesTextureRef,
    gpgpu,
  };
}
