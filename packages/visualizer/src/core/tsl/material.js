import * as THREE from 'three';
import {
  varying,
  cameraPosition,
  positionWorld,
  normalize,
  mix,
  pow,
  abs,
  float,
  vec3,
  vec4,
  mod,
  smoothstep,
  select,
  Fn,
} from 'three/tsl';
import { PointsNodeMaterial } from 'three/webgpu';
import { FIELD_STATE_VALUES } from './uniforms.js';

export function createParticlePoints({ count, particlesBuffer, uniforms }) {
  const {
    uTime,
    uFieldState,
    uIdleLogoIntensity,
    uIdleLogoAlpha,
    uColor,
    uSurfaceColor,
    uParticleSize,
  } = uniforms;

  const vGroupTag = varying(particlesBuffer.toAttribute().w, 'vGroupTag');

  const colorNode = Fn(() => {
    const groupTag = vGroupTag;
    const stripes = pow(mod(positionWorld.y.sub(uTime.mul(0.02)).mul(20.0), float(1.0)), float(3.0));
    const radialN = normalize(positionWorld);
    const viewDir = normalize(positionWorld.sub(cameraPosition));
    const fresnel = pow(abs(float(1.0).sub(viewDir.negate().dot(radialN))), float(2.0));
    const holoColor = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 0.0, 1.0), fresnel);
    const falloff = smoothstep(float(0.8), float(0.0), fresnel);
    const holo = fresnel.mul(stripes).add(fresnel.mul(1.25)).mul(falloff);

    const defaultBlue = vec3(0.35686, 0.57255, 0.96078);
    const particleColor = select(
      groupTag.equal(float(1.0)), uSurfaceColor,
      select(groupTag.equal(float(2.0)), uColor, defaultBlue)
    );
    const logoIntensity = select(uFieldState.equal(FIELD_STATE_VALUES.idle), uIdleLogoIntensity, float(1.0));
    const finalColor = mix(particleColor, holoColor, holo).mul(logoIntensity);
    const alpha = select(uFieldState.equal(FIELD_STATE_VALUES.idle), uIdleLogoAlpha, float(1.0));

    return vec4(finalColor, alpha);
  })();

  const particleMaterial = new PointsNodeMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  particleMaterial.positionNode = particlesBuffer.toAttribute().xyz;
  particleMaterial.colorNode = colorNode;
  particleMaterial.sizeNode = uParticleSize;

  const geom = new THREE.BufferGeometry();
  const dummyPos = new Float32Array(count * 3);
  geom.setAttribute('position', new THREE.BufferAttribute(dummyPos, 3));

  return new THREE.Points(geom, particleMaterial);
}
