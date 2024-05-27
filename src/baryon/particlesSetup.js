import * as THREE from 'three';

import particlesVertexShader from '../shaders/particles/vertex.glsl';
import particlesFragmentShader from '../shaders/particles/fragment.glsl';

import { audioObject } from '../audio/audioSetup';
/**
 * Particles
 */

export function particlesSetup(parameters, sizes, gpgpu, baseGeometry, colors, scene) {
  const particles = {};
  const materialParameters = {};

  // materialParameters.color = new THREE.Color('rgb(77,142,236)');
  materialParameters.color = new THREE.Color('rgb(5, 134, 255)');
  // rgb(77,142,236)

  // Material
  particles.material = new THREE.ShaderMaterial({
    // transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    // vertexColors: true,
    vertexShader: particlesVertexShader,
    fragmentShader: particlesFragmentShader,
    uniforms: {
      uSize: new THREE.Uniform(0.03),
      uResolution: new THREE.Uniform(
        new THREE.Vector2(sizes.width * sizes.pixelRatio, sizes.height * sizes.pixelRatio)
      ),
      uParticlesTexture: new THREE.Uniform(),
      uTime: new THREE.Uniform(0),
      uColor: new THREE.Uniform(new THREE.Color(materialParameters.color)),
      uRadius: new THREE.Uniform(parameters.radius),
      uAverageAmplitude: new THREE.Uniform(0.0),
      uRotation: new THREE.Uniform(2.5),
      uDeltaTime: new THREE.Uniform(0),
      uSoundPlaying: new THREE.Uniform(audioObject.sound.isPlaying),
    },
  });

  // Texture Initialization
  particles.material.uniforms.uParticlesTexture.value = gpgpu.computation.getCurrentRenderTarget(
    gpgpu.particlesVariable
  ).texture;

  // Geometry
  const particlesUvArray = new Float32Array(baseGeometry.count * 2);

  // Sizes
  const sizesArray = new Float32Array(baseGeometry.count);

  for (let y = 0; y < gpgpu.size; y++) {
    for (let x = 0; x < gpgpu.size; x++) {
      const i = y * gpgpu.size + x;
      const i2 = i * 2;

      const uvX = (x + 0.5) / gpgpu.size;
      const uvY = (y + 0.5) / gpgpu.size;

      particlesUvArray[i2 + 0] = uvX;
      particlesUvArray[i2 + 1] = uvY;

      // Sizes
      sizesArray[i] = Math.random();
    }
  }

  particles.geometry = new THREE.BufferGeometry();
  particles.geometry.setDrawRange(0, baseGeometry.count);
  particles.geometry.setAttribute('aParticlesUv', new THREE.BufferAttribute(particlesUvArray, 2));
  particles.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  particles.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizesArray, 1));

  // Points
  particles.points = new THREE.Points(particles.geometry, particles.material);
  scene.add(particles.points);

  return { particles: particles, materialParameters: materialParameters };
}
