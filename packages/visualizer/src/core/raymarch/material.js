import * as THREE from "three";
import { VolumeNodeMaterial } from "three/webgpu";
import {
  Fn,
  Loop,
  abs,
  cameraPosition,
  clamp,
  cos,
  dot,
  float,
  length,
  mix,
  modelWorldMatrixInverse,
  sin,
  smoothstep,
  vec3,
  vec4,
} from "three/tsl";
import SafeVolumetricLightingModel from "./SafeVolumetricLightingModel.js";
import {
  RAYMARCH_BOUNDARY_END,
  RAYMARCH_BOUNDARY_START,
  RAYMARCH_GRAZING_END,
  RAYMARCH_GRAZING_START,
} from "./intersection.js";

const EDGE_FADE_START = 0.88;
const EDGE_FADE_END = 1.0;
const SHELL_WEIGHT_MIN = 0.42;
const SHELL_WEIGHT_START = 0.16;
const SHELL_WEIGHT_END = 0.96;
const COLOR_BLEND_START = 0.32;
const COLOR_BLEND_END = 0.88;
const DENSITY_BOOST = 3.5;
const DENSITY_MAX = 6.0;
const LOW_DENSITY_FADE_START = 0.14;
const LOW_DENSITY_FADE_END = 0.42;
const WEAK_CONTOUR_START = 0.32;
const WEAK_CONTOUR_END = 0.82;
const SILHOUETTE_MIN_VISIBILITY = 0.2;
const DETAIL_LAYER_WEIGHT = 0.35;

/**
 * @typedef {{ positionRay: any }} ScatteringNodeInputs
 */

/**
 * @typedef {import("three/webgpu").VolumeNodeMaterial & {
 *   steps: number,
 *   radiusNode?: any,
 *   scatteringNode?: any
 * }} BaryonVolumeMaterial
 */

class BaryonVolumeNodeMaterial extends VolumeNodeMaterial {
  setupLightingModel() {
    return new SafeVolumetricLightingModel();
  }
}

function accumulateLayer({
  buffer,
  capacity,
  weight,
  pi,
  localPosition,
  invRadius,
  field,
  gradX,
  gradY,
  gradZ,
}) {
  Loop(capacity, ({ i }) => {
    const slot = buffer.element(i);
    const amplitude = slot.w.mul(weight);
    const u = slot.x;
    const v = slot.y;
    const w = slot.z;
    const sx = sin(u.mul(pi).mul(localPosition.x).mul(invRadius));
    const sy = sin(v.mul(pi).mul(localPosition.y).mul(invRadius));
    const sz = sin(w.mul(pi).mul(localPosition.z).mul(invRadius));
    const gx = cos(u.mul(pi).mul(localPosition.x).mul(invRadius)).mul(
      u.mul(pi).mul(invRadius),
    );
    const gy = cos(v.mul(pi).mul(localPosition.y).mul(invRadius)).mul(
      v.mul(pi).mul(invRadius),
    );
    const gz = cos(w.mul(pi).mul(localPosition.z).mul(invRadius)).mul(
      w.mul(pi).mul(invRadius),
    );
    field.addAssign(amplitude.mul(sx).mul(sy).mul(sz));
    gradX.addAssign(amplitude.mul(gx).mul(sy).mul(sz));
    gradY.addAssign(amplitude.mul(sx).mul(gy).mul(sz));
    gradZ.addAssign(amplitude.mul(sx).mul(sy).mul(gz));
  });
}

function createScatteringNode({
  backboneModeBuffer,
  detailModeBuffer,
  capacity,
  uniforms,
}) {
  const {
    uRadius,
    uThreshold,
    uStructureMin,
    uStructureMax,
    uActiveModeCount,
    uBackboneModeCount,
    uDetailModeCount,
    uColor,
    uSurfaceColor,
    uDensityGain,
    uAbsorption,
    uContourSharpness,
    uBandEnergies,
    uTransientEnergy,
    uSpectralCentroid,
    uSpectralFlux,
  } = uniforms;
  const pi = float(Math.PI);
  const invRadius = float(1.0).div(uRadius);

  return Fn(
    /**
     * @param {ScatteringNodeInputs} args
     */
    ({ positionRay }) => {
      const localPosition = modelWorldMatrixInverse.mul(
        vec4(positionRay, 1.0),
      ).xyz;
      const cameraLocal = modelWorldMatrixInverse.mul(
        vec4(cameraPosition, 1.0),
      ).xyz;
      const normalizedPosition = localPosition.div(uRadius);
      const radialDistance = length(normalizedPosition);
      const edgeFade = float(1.0).sub(
        smoothstep(
          float(EDGE_FADE_START),
          float(EDGE_FADE_END),
          radialDistance,
        ),
      );
      const field = float(0.0).toVar();
      const gradX = float(0.0).toVar();
      const gradY = float(0.0).toVar();
      const gradZ = float(0.0).toVar();

      accumulateLayer({
        buffer: backboneModeBuffer,
        capacity,
        weight: float(1.0),
        pi,
        localPosition,
        invRadius,
        field,
        gradX,
        gradY,
        gradZ,
      });
      accumulateLayer({
        buffer: detailModeBuffer,
        capacity,
        weight: float(DETAIL_LAYER_WEIGHT),
        pi,
        localPosition,
        invRadius,
        field,
        gradX,
        gradY,
        gradZ,
      });

      const fieldAbs = abs(field);
      const gradientMagnitude = length(vec3(gradX, gradY, gradZ));
      const activeCount = float(uActiveModeCount);
      const backboneCount = float(uBackboneModeCount);
      const detailCount = float(uDetailModeCount);
      const contourGain = float(1.0).add(uTransientEnergy.mul(0.25));
      const nodeBand = float(1.0).sub(
        smoothstep(float(0.0), uThreshold, fieldAbs),
      );
      const structure = smoothstep(
        uStructureMin,
        uStructureMax,
        gradientMagnitude,
      );
      const innerShellAccent = smoothstep(
        float(0.0),
        float(0.45),
        radialDistance,
      );
      const outerShellAccent = smoothstep(
        float(0.35),
        float(1.0),
        radialDistance,
      );
      const shellBandMod = float(1.0)
        .add(
          uBandEnergies.x
            .mul(float(0.18))
            .mul(float(1.0).sub(innerShellAccent)),
        )
        .add(uBandEnergies.y.mul(float(0.1)))
        .add(uBandEnergies.z.mul(float(0.12)).mul(outerShellAccent))
        .add(uBandEnergies.w.mul(float(0.18)).mul(outerShellAccent));
      const shellWeight = mix(
        float(SHELL_WEIGHT_MIN),
        float(1.0),
        smoothstep(
          float(SHELL_WEIGHT_START),
          float(SHELL_WEIGHT_END),
          radialDistance,
        ),
      ).mul(shellBandMod);
      const contour = nodeBand.pow(uContourSharpness.mul(contourGain));
      const activeMask = smoothstep(float(0.0), float(1.0), activeCount);
      const densityMod = float(1.0)
        .add(uTransientEnergy.mul(0.3))
        .add(uSpectralFlux.mul(0.2));
      const density = clamp(
        contour
          .mul(structure)
          .mul(shellWeight)
          .mul(edgeFade)
          .mul(uDensityGain)
          .mul(uAbsorption)
          .mul(densityMod)
          .mul(activeMask),
        float(0.0),
        float(DENSITY_MAX),
      ).mul(float(DENSITY_BOOST));
      const visibleDensity = density.mul(
        smoothstep(
          float(LOW_DENSITY_FADE_START),
          float(LOW_DENSITY_FADE_END),
          density,
        ),
      );
      const radialNormal = localPosition.div(
        length(localPosition).max(float(1e-4)),
      );
      const viewDirection = cameraLocal.sub(localPosition).normalize();
      const grazingFactor = float(1.0).sub(
        abs(dot(viewDirection, radialNormal)),
      );
      const boundaryMask = smoothstep(
        float(RAYMARCH_BOUNDARY_START),
        float(RAYMARCH_BOUNDARY_END),
        radialDistance,
      );
      const grazingMask = smoothstep(
        float(RAYMARCH_GRAZING_START),
        float(RAYMARCH_GRAZING_END),
        grazingFactor,
      );
      const weakContourMask = float(1.0).sub(
        smoothstep(float(WEAK_CONTOUR_START), float(WEAK_CONTOUR_END), contour),
      );
      const silhouetteSuppression = mix(
        float(1.0),
        float(SILHOUETTE_MIN_VISIBILITY),
        boundaryMask.mul(grazingMask).mul(weakContourMask),
      );
      const contourMix = smoothstep(
        float(COLOR_BLEND_START),
        float(COLOR_BLEND_END),
        contour,
      );
      const spectralColorBias = clamp(
        contourMix
          .add(uSpectralCentroid.mul(0.25))
          .add(uTransientEnergy.mul(0.1)),
        float(0.0),
        float(1.0),
      );
      const baseColor = mix(uColor, uSurfaceColor, spectralColorBias);
      const detailPresence = smoothstep(float(0.0), float(1.0), detailCount);
      const backbonePresence = smoothstep(
        float(0.0),
        float(1.0),
        backboneCount,
      );
      const volumeColor = mix(
        baseColor.mul(float(0.92)),
        baseColor,
        backbonePresence.add(detailPresence.mul(float(0.15))),
      );

      return volumeColor.mul(visibleDensity).mul(silhouetteSuppression);
    },
  );
}

export function createRaymarchVolumeMesh({
  radius,
  backboneModeBuffer,
  detailModeBuffer,
  capacity,
  uniforms,
}) {
  const geometry = new THREE.BoxGeometry(radius * 2, radius * 2, radius * 2);
  const material = /** @type {BaryonVolumeMaterial} */ (
    new BaryonVolumeNodeMaterial()
  );
  material.transparent = true;
  material.blending = THREE.NormalBlending;

  material.steps = Math.round(uniforms.uRaymarchSteps.value);
  material.radiusNode = uniforms.uRadius;
  material.scatteringNode = createScatteringNode({
    backboneModeBuffer,
    detailModeBuffer,
    capacity,
    uniforms,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;

  return mesh;
}

export function createIdleOverlay({ baryonGeometry, uniforms }) {
  const geometry = new THREE.EdgesGeometry(baryonGeometry);
  const overlay = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: uniforms.uSurfaceColor.value.clone(),
      transparent: true,
      opacity: uniforms.uIdleLogoAlpha.value,
    }),
  );
  overlay.scale.setScalar(uniforms.uIdleLogoSize.value);
  overlay.frustumCulled = false;

  return overlay;
}
