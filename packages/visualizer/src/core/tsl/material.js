import * as THREE from "three";
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
} from "three/tsl";
import { PointsNodeMaterial } from "three/webgpu";
import { FIELD_STATE_VALUES } from "./uniforms.js";

const BODY_VISIBILITY_MIN = 0.04;
const BODY_VISIBILITY_MAX = 0.18;
const CONTOUR_VISIBILITY_MIN = 0.2;
const CONTOUR_VISIBILITY_MAX = 0.48;
const ACTIVE_VISIBILITY_BODY_WEIGHT = 0.42;
const ACTIVE_VISIBILITY_CONTOUR_WEIGHT = 0.58;
const ALPHA_ACTIVE_MIN = 0.08;
const ALPHA_ACTIVE_MAX = 0.98;
const SIZE_ACTIVE_MIN = 0.18;
const SIZE_ACTIVE_MAX = 2.9;

export function createParticlePoints({
  count,
  particlesBuffer,
  velocityBuffer,
  uniforms,
}) {
  const {
    uTime,
    uFieldState,
    uIdleLogoIntensity,
    uIdleLogoAlpha,
    uColor,
    uSurfaceColor,
    uParticleSize,
  } = uniforms;

  const vGroupTag = varying(particlesBuffer.toAttribute().w, "vGroupTag");
  const vBandStrength = varying(
    velocityBuffer.toAttribute().w,
    "vBandStrength",
  );
  const bodyVisibility = smoothstep(
    float(BODY_VISIBILITY_MIN),
    float(BODY_VISIBILITY_MAX),
    vBandStrength,
  );
  const contourVisibility = smoothstep(
    float(CONTOUR_VISIBILITY_MIN),
    float(CONTOUR_VISIBILITY_MAX),
    vBandStrength,
  );
  const activeVisibility = bodyVisibility
    .mul(float(ACTIVE_VISIBILITY_BODY_WEIGHT))
    .add(contourVisibility.mul(float(ACTIVE_VISIBILITY_CONTOUR_WEIGHT)));

  const colorNode = Fn(() => {
    const groupTag = vGroupTag;
    const stripes = pow(
      mod(positionWorld.y.sub(uTime.mul(0.02)).mul(20.0), float(1.0)),
      float(3.0),
    );
    const radialN = normalize(positionWorld);
    const viewDir = normalize(positionWorld.sub(cameraPosition));
    const fresnel = pow(
      abs(float(1.0).sub(viewDir.negate().dot(radialN))),
      float(2.0),
    );
    const holoColor = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 0.0, 1.0), fresnel);
    const falloff = smoothstep(float(0.8), float(0.0), fresnel);
    const holo = fresnel.mul(stripes).add(fresnel.mul(1.25)).mul(falloff);

    const defaultBlue = vec3(0.35686, 0.57255, 0.96078);
    const particleColor = select(
      groupTag.equal(float(1.0)),
      uSurfaceColor,
      select(groupTag.equal(float(2.0)), uColor, defaultBlue),
    );
    const contourColor = mix(
      particleColor.mul(float(0.48)),
      vec3(1.0),
      contourVisibility.mul(float(0.34)),
    );
    const logoIntensity = select(
      uFieldState.equal(FIELD_STATE_VALUES.idle),
      uIdleLogoIntensity,
      float(1.0),
    );
    const activeColor = mix(
      particleColor.mul(float(0.34)),
      contourColor.add(holoColor.mul(holo.mul(float(0.08)))),
      contourVisibility,
    );
    const finalColor = select(
      uFieldState.equal(FIELD_STATE_VALUES.idle),
      mix(particleColor, holoColor, holo).mul(logoIntensity),
      activeColor.mul(logoIntensity),
    );
    const alpha = select(
      uFieldState.equal(FIELD_STATE_VALUES.idle),
      uIdleLogoAlpha,
      mix(float(ALPHA_ACTIVE_MIN), float(ALPHA_ACTIVE_MAX), activeVisibility),
    );

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
  particleMaterial.sizeNode = select(
    uFieldState.equal(FIELD_STATE_VALUES.idle),
    uParticleSize,
    uParticleSize.mul(
      mix(float(SIZE_ACTIVE_MIN), float(SIZE_ACTIVE_MAX), activeVisibility),
    ),
  );

  const geom = new THREE.BufferGeometry();
  const dummyPos = new Float32Array(count * 3);
  geom.setAttribute("position", new THREE.BufferAttribute(dummyPos, 3));

  return new THREE.Points(geom, particleMaterial);
}
