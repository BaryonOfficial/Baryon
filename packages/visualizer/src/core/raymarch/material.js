import * as THREE from "three";
import { VolumeNodeMaterial } from "three/webgpu";
import {
  Fn,
  Loop,
  abs,
  clamp,
  cos,
  float,
  length,
  mix,
  modelWorldMatrixInverse,
  sin,
  smoothstep,
  vec3,
  vec4,
} from "three/tsl";
import SafeVolumetricLightingModel, {
  raymarchLightNode,
  raymarchOpacityNode,
} from "./SafeVolumetricLightingModel.js";
import {
  RAYMARCH_BOUNDARY_END,
  RAYMARCH_BOUNDARY_START,
} from "./intersection.js";
import {
  BOUNDARY_CONTOUR_ACCENT_WEIGHT,
  AIR_BAND_WEIGHT,
  BODY_BOUNDARY_REDUCTION,
  BODY_DENSITY_GAIN,
  BROAD_BAND_SCALE,
  COLOR_BIAS_SCALE,
  COLOR_BLEND_END,
  COLOR_BLEND_START,
  CONTOUR_BLEND,
  DENSITY_BOOST,
  DENSITY_MAX,
  DETAIL_LAYER_WEIGHT,
  EDGE_FADE_END,
  EDGE_FADE_START,
  HIGHLIGHT_CONTOUR_ACCENT_WEIGHT,
  HIGHLIGHT_MASK_END,
  HIGHLIGHT_MASK_START,
  HIGH_MID_BAND_WEIGHT,
  INNER_BAND_WEIGHT,
  INTERIOR_MASK_END,
  INTERIOR_MASK_START,
  LOW_DENSITY_FADE_END,
  LOW_DENSITY_FADE_START,
  LOW_MID_BAND_WEIGHT,
  RIM_BLOOM_BIAS_BASE,
  RIM_BLOOM_BIAS_GAIN,
  SHELL_WEIGHT_END,
  SHELL_WEIGHT_MAX,
  SHELL_WEIGHT_MIN,
  SHELL_WEIGHT_START,
} from "./fieldShaping.js";

/**
 * @typedef {{ positionRay: any }} ScatteringNodeInputs
 */

/**
 * @typedef {import("three/webgpu").VolumeNodeMaterial & {
 *   steps: number,
 *   radiusNode?: any,
 *   scatteringNode?: any,
 *   opacityGainNode?: any
 * }} BaryonVolumeMaterial
 */

class BaryonVolumeNodeMaterial extends VolumeNodeMaterial {
  setupLightingModel() {
    return new SafeVolumetricLightingModel();
  }
}

function accumulateLayer({
  buffer,
  colorBuffer,
  capacity,
  weight,
  pi,
  localPosition,
  invRadius,
  field,
  gradX,
  gradY,
  gradZ,
  colorSum,
  colorWeight,
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
    const localShape = sx.mul(sy).mul(sz);
    field.addAssign(amplitude.mul(localShape));
    gradX.addAssign(amplitude.mul(gx).mul(sy).mul(sz));
    gradY.addAssign(amplitude.mul(sx).mul(gy).mul(sz));
    gradZ.addAssign(amplitude.mul(sx).mul(sy).mul(gz));
    if (colorBuffer && colorSum && colorWeight) {
      const colorSlot = colorBuffer.element(i);
      const localInfluence = amplitude.mul(abs(localShape));
      colorSum.addAssign(
        vec3(colorSlot.x, colorSlot.y, colorSlot.z).mul(
          localInfluence.mul(colorSlot.w),
        ),
      );
      colorWeight.addAssign(localInfluence.mul(colorSlot.w));
    }
  });
}

function createScatteringNode({
  backboneModeBuffer,
  detailModeBuffer,
  backboneColorBuffer,
  detailColorBuffer,
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
    uChromesthesiaMix,
    uDensityGain,
    uAbsorption,
    uContourSharpness,
    uRimBloomBias,
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
      const colorSum = vec3(0.0).toVar();
      const colorWeight = float(0.0).toVar();

      accumulateLayer({
        buffer: backboneModeBuffer,
        colorBuffer: backboneColorBuffer,
        capacity,
        weight: float(1.0),
        pi,
        localPosition,
        invRadius,
        field,
        gradX,
        gradY,
        gradZ,
        colorSum,
        colorWeight,
      });
      accumulateLayer({
        buffer: detailModeBuffer,
        colorBuffer: detailColorBuffer,
        capacity,
        weight: float(DETAIL_LAYER_WEIGHT),
        pi,
        localPosition,
        invRadius,
        field,
        gradX,
        gradY,
        gradZ,
        colorSum,
        colorWeight,
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
      const broadBand = float(1.0).sub(
        smoothstep(
          float(0.0),
          uThreshold.mul(float(BROAD_BAND_SCALE)),
          fieldAbs,
        ),
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
      const rimBandBias = float(RIM_BLOOM_BIAS_BASE).add(
        uRimBloomBias.mul(float(RIM_BLOOM_BIAS_GAIN)),
      );
      const shellBandMod = float(1.0)
        .add(
          uBandEnergies.x
            .mul(float(INNER_BAND_WEIGHT))
            .mul(float(1.0).sub(innerShellAccent)),
        )
        .add(uBandEnergies.y.mul(float(LOW_MID_BAND_WEIGHT)))
        .add(
          uBandEnergies.z
            .mul(float(HIGH_MID_BAND_WEIGHT))
            .mul(rimBandBias)
            .mul(outerShellAccent),
        )
        .add(
          uBandEnergies.w
            .mul(float(AIR_BAND_WEIGHT))
            .mul(rimBandBias)
            .mul(outerShellAccent),
        );
      const shellWeight = mix(
        float(SHELL_WEIGHT_MIN),
        float(SHELL_WEIGHT_MAX),
        smoothstep(
          float(SHELL_WEIGHT_START),
          float(SHELL_WEIGHT_END),
          radialDistance,
        ),
      ).mul(shellBandMod);
      const contourCore = nodeBand.pow(uContourSharpness.mul(contourGain));
      const contourShape = mix(broadBand, contourCore, float(CONTOUR_BLEND));
      const activeMask = smoothstep(float(0.0), float(1.0), activeCount);
      const densityMod = float(1.0)
        .add(uTransientEnergy.mul(0.3))
        .add(uSpectralFlux.mul(0.2));
      const boundaryMask = smoothstep(
        float(RAYMARCH_BOUNDARY_START),
        float(RAYMARCH_BOUNDARY_END),
        radialDistance,
      );
      const interiorMask = float(1.0).sub(
        smoothstep(
          float(INTERIOR_MASK_START),
          float(INTERIOR_MASK_END),
          radialDistance,
        ),
      );
      const bodyDensity = broadBand
        .mul(structure)
        .mul(edgeFade)
        .mul(activeMask)
        .mul(interiorMask)
        .mul(float(BODY_DENSITY_GAIN))
        .mul(float(1.0).sub(boundaryMask.mul(float(BODY_BOUNDARY_REDUCTION))));
      const coreDensity = contourShape.mul(structure).mul(shellWeight);
      const density = clamp(
        coreDensity
          .add(bodyDensity)
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
      const highlightMask = smoothstep(
        float(HIGHLIGHT_MASK_START),
        float(HIGHLIGHT_MASK_END),
        visibleDensity,
      );
      const stabilizedDensity = visibleDensity;
      const contourMix = smoothstep(
        float(COLOR_BLEND_START),
        float(COLOR_BLEND_END),
        contourShape,
      );
      const spectralColorBias = clamp(
        contourMix
          .add(uSpectralCentroid.mul(0.25))
          .add(uTransientEnergy.mul(0.1))
          .mul(float(COLOR_BIAS_SCALE)),
        float(0.0),
        float(1.0),
      );
      const staticBaseColor = mix(uColor, uSurfaceColor, spectralColorBias);
      const spectralColor = colorSum.div(colorWeight.max(float(1e-4)));
      const chromesthesiaPresence = smoothstep(
        float(0.0),
        float(0.18),
        colorWeight,
      );
      const chromesthesiaEnabled = smoothstep(
        float(0.0),
        float(1e-4),
        uChromesthesiaMix,
      );
      const chromesthesiaWeight = clamp(
        uChromesthesiaMix.mul(chromesthesiaPresence),
        float(0.0),
        float(1.0),
      );
      const contourAccent = contourMix
        .mul(float(0.18))
        .add(boundaryMask.mul(float(BOUNDARY_CONTOUR_ACCENT_WEIGHT)))
        .add(highlightMask.mul(float(HIGHLIGHT_CONTOUR_ACCENT_WEIGHT)));
      const staticContourColor = mix(
        staticBaseColor,
        uSurfaceColor,
        contourAccent,
      );
      const chromesthesiaNeutralColor = mix(
        vec3(0.72),
        vec3(1.0),
        spectralColorBias,
      );
      const chromesthesiaBaseColor = mix(
        chromesthesiaNeutralColor,
        spectralColor,
        chromesthesiaWeight,
      );
      const chromesthesiaContourColor = mix(
        chromesthesiaBaseColor.mul(float(0.92)),
        chromesthesiaBaseColor,
        contourAccent,
      );
      const detailPresence = smoothstep(float(0.0), float(1.0), detailCount);
      const backbonePresence = smoothstep(
        float(0.0),
        float(1.0),
        backboneCount,
      );
      const activityAccent = backbonePresence.add(
        detailPresence.mul(float(0.15)),
      );
      const staticVolumeColor = mix(
        staticContourColor.mul(float(0.92)),
        staticContourColor,
        activityAccent,
      );
      const chromesthesiaVolumeColor = mix(
        chromesthesiaContourColor.mul(float(0.92)),
        chromesthesiaContourColor,
        activityAccent,
      );
      const volumeColor = mix(
        staticVolumeColor,
        chromesthesiaVolumeColor,
        chromesthesiaEnabled,
      );

      return volumeColor.mul(stabilizedDensity);
    },
  );
}

export function createRaymarchVolumeMesh({
  radius,
  backboneModeBuffer,
  detailModeBuffer,
  backboneColorBuffer,
  detailColorBuffer,
  capacity,
  uniforms,
}) {
  const geometry = new THREE.BoxGeometry(radius * 2, radius * 2, radius * 2);
  const material = /** @type {BaryonVolumeMaterial} */ (
    new BaryonVolumeNodeMaterial()
  );
  material.transparent = true;
  material.blending = THREE.NormalBlending;
  material.outputNode = vec4(raymarchLightNode, raymarchOpacityNode);

  material.steps = Math.round(uniforms.uRaymarchSteps.value);
  material.radiusNode = uniforms.uRadius;
  material.opacityGainNode = uniforms.uOpacityGain;
  material.scatteringNode = createScatteringNode({
    backboneModeBuffer,
    detailModeBuffer,
    backboneColorBuffer,
    detailColorBuffer,
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
