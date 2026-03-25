import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  Loop,
  abs,
  clamp,
  float,
  length,
  max,
  mix,
  screenUV,
  smoothstep,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { evaluatePermutationFamilyNode } from "../modeFamilyNode.js";

const CYMATICS_2D_TUNING = Object.freeze({
  detailLayerWeight: 0.35,
  fieldBandScale: 1.85,
  contourBlend: 0.74,
  densityMax: 1.5,
  fieldViewScale: 1.7,
  highlightStart: 0.08,
  highlightEnd: 0.9,
  colorBlendStart: 0.18,
  colorBlendEnd: 0.9,
});

function accumulateLayer({
  buffer,
  colorBuffer,
  capacity,
  weight,
  pi,
  x,
  y,
  slice,
  boundaryMode,
  field,
  gradX,
  gradY,
  colorSum,
  colorWeight,
}) {
  Loop(capacity, ({ i }) => {
    const slot = buffer.element(i);
    const amplitude = slot.w.mul(weight);
    const family = evaluatePermutationFamilyNode({
      u: slot.x,
      v: slot.y,
      w: slot.z,
      xCoord: x,
      yCoord: y,
      zCoord: slice,
      scale: pi,
      boundaryMode,
    });
    field.addAssign(amplitude.mul(family.field));
    gradX.addAssign(amplitude.mul(family.gradX));
    gradY.addAssign(amplitude.mul(family.gradY));

    if (colorBuffer && colorSum && colorWeight) {
      const colorSlot = colorBuffer.element(i);
      const localInfluence = amplitude.mul(abs(family.field));
      colorSum.addAssign(
        vec3(colorSlot.x, colorSlot.y, colorSlot.z).mul(
          localInfluence.mul(colorSlot.w),
        ),
      );
      colorWeight.addAssign(localInfluence.mul(colorSlot.w));
    }
  });
}

function createFieldNode({
  backboneModeBuffer,
  detailModeBuffer,
  backboneColorBuffer,
  detailColorBuffer,
  capacity,
  uniforms,
}) {
  const {
    uThreshold,
    uStructureMin,
    uStructureMax,
    uBoundaryMode,
    uActiveModeCount,
    uBackboneModeCount,
    uDetailModeCount,
    uColor,
    uSurfaceColor,
    uChromesthesiaMix,
    uDensityGain,
    uOpacityGain,
    uContourSharpness,
    uTransientEnergy,
    uSpectralCentroid,
    uSpectralFlux,
    uSlicePosition,
  } = uniforms;
  const pi = float(Math.PI);

  return Fn(() => {
    const centered = vec2(
      screenUV.x
        .mul(2.0)
        .sub(1.0)
        .mul(float(CYMATICS_2D_TUNING.fieldViewScale)),
      screenUV.y
        .mul(2.0)
        .sub(1.0)
        .mul(float(CYMATICS_2D_TUNING.fieldViewScale)),
    );
    const field = float(0.0).toVar();
    const gradX = float(0.0).toVar();
    const gradY = float(0.0).toVar();
    const colorSum = vec3(0.0).toVar();
    const colorWeight = float(0.0).toVar();

    accumulateLayer({
      buffer: backboneModeBuffer,
      colorBuffer: backboneColorBuffer,
      capacity,
      weight: float(1.0),
      pi,
      x: centered.x,
      y: centered.y,
      slice: uSlicePosition,
      boundaryMode: uBoundaryMode,
      field,
      gradX,
      gradY,
      colorSum,
      colorWeight,
    });
    accumulateLayer({
      buffer: detailModeBuffer,
      colorBuffer: detailColorBuffer,
      capacity,
      weight: float(CYMATICS_2D_TUNING.detailLayerWeight),
      pi,
      x: centered.x,
      y: centered.y,
      slice: uSlicePosition,
      boundaryMode: uBoundaryMode,
      field,
      gradX,
      gradY,
      colorSum,
      colorWeight,
    });

    const fieldAbs = abs(field);
    const gradientMagnitude = length(vec2(gradX, gradY)).mul(float(0.16));
    const activeCount = float(uActiveModeCount);
    const activeMask = smoothstep(float(0.0), float(1.0), activeCount);
    const nodeBand = float(1.0).sub(
      smoothstep(float(0.0), uThreshold, fieldAbs),
    );
    const broadBand = float(1.0).sub(
      smoothstep(
        float(0.0),
        uThreshold.mul(float(CYMATICS_2D_TUNING.fieldBandScale)),
        fieldAbs,
      ),
    );
    const contourCore = nodeBand.pow(
      uContourSharpness.mul(float(1.0).add(uTransientEnergy.mul(0.25))),
    );
    const contourShape = mix(
      broadBand,
      contourCore,
      float(CYMATICS_2D_TUNING.contourBlend),
    );
    const structure = smoothstep(
      uStructureMin,
      uStructureMax,
      gradientMagnitude,
    );
    const density = clamp(
      contourShape
        .mul(structure.add(float(0.12)))
        .mul(activeMask)
        .mul(uDensityGain)
        .mul(
          float(1.0)
            .add(uTransientEnergy.mul(0.26))
            .add(uSpectralFlux.mul(0.18)),
        ),
      float(0.0),
      float(CYMATICS_2D_TUNING.densityMax),
    );
    const visibleDensity = density.mul(
      smoothstep(float(0.02), float(0.24), /** @type {any} */ (density)),
    );
    const opacity = clamp(
      visibleDensity
        .mul(uOpacityGain)
        .mul(float(0.82).add(uSpectralFlux.mul(0.12))),
      float(0.0),
      float(1.0),
    );
    const highlightMask = smoothstep(
      float(CYMATICS_2D_TUNING.highlightStart),
      float(CYMATICS_2D_TUNING.highlightEnd),
      /** @type {any} */ (visibleDensity),
    );
    const contourMix = smoothstep(
      float(CYMATICS_2D_TUNING.colorBlendStart),
      float(CYMATICS_2D_TUNING.colorBlendEnd),
      contourShape,
    );
    const spectralColorBias = clamp(
      contourMix
        .add(uSpectralCentroid.mul(0.22))
        .add(uTransientEnergy.mul(0.1)),
      float(0.0),
      float(1.0),
    );
    const staticBaseColor = mix(uColor, uSurfaceColor, spectralColorBias);
    const spectralColor = colorSum.div(max(colorWeight, float(1e-4)));
    const chromesthesiaPresence = smoothstep(
      float(0.0),
      float(0.18),
      colorWeight,
    );
    const chromesthesiaWeight = clamp(
      uChromesthesiaMix.mul(chromesthesiaPresence),
      float(0.0),
      float(1.0),
    );
    const chromesthesiaNeutralColor = mix(
      vec3(0.7),
      vec3(1.0),
      spectralColorBias,
    );
    const chromesthesiaBaseColor = mix(
      chromesthesiaNeutralColor,
      spectralColor,
      chromesthesiaWeight,
    );
    const staticColor = mix(
      staticBaseColor.mul(float(0.86)),
      staticBaseColor,
      highlightMask,
    );
    const chromesthesiaColor = mix(
      chromesthesiaBaseColor.mul(float(0.9)),
      chromesthesiaBaseColor,
      highlightMask,
    );
    const backbonePresence = smoothstep(
      float(0.0),
      float(1.0),
      float(uBackboneModeCount),
    );
    const detailPresence = smoothstep(
      float(0.0),
      float(1.0),
      float(uDetailModeCount),
    );
    const activityAccent = backbonePresence.add(
      detailPresence.mul(float(0.14)),
    );
    const color = mix(
      staticColor,
      chromesthesiaColor,
      smoothstep(float(0.0), float(1e-4), uChromesthesiaMix),
    )
      .mul(float(0.9).add(activityAccent.mul(float(0.08))))
      .mul(visibleDensity);

    return vec4(color, opacity);
  })();
}

export function createFullscreenFieldMesh({
  backboneModeBuffer,
  detailModeBuffer,
  backboneColorBuffer,
  detailColorBuffer,
  capacity,
  uniforms,
}) {
  const geometry = new THREE.PlaneGeometry(100, 100, 1, 1);
  const material = new MeshBasicNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = false;
  material.fog = false;
  material.outputNode = createFieldNode({
    backboneModeBuffer,
    detailModeBuffer,
    backboneColorBuffer,
    detailColorBuffer,
    capacity,
    uniforms,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  return mesh;
}
