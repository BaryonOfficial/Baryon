import {
  Fn,
  If,
  Loop,
  abs,
  clamp,
  cos,
  float,
  instanceIndex,
  length,
  mix,
  mx_noise_float,
  normalize,
  select,
  sin,
  smoothstep,
  vec3,
  vec4,
} from "three/tsl";
import { SHELL_COUNT, SHELL_MIN_RADIUS_RATIO } from "./shells.js";
import { FIELD_STATE_VALUES } from "./uniforms.js";

const CONTOUR_FIELD_WIDTH_SCALE = 2.4;
const CONTOUR_BAND_SHARPNESS = 2.5;
const SHELL_SPRING_STRENGTH = 12.0;
const CONTOUR_FORCE_STRENGTH = 30.0;
const ANCHOR_FORCE_STRENGTH = 0.0;
const FLOW_FORCE_SCALE = 0.015;

function createNodalMetrics({
  fieldAbs,
  gradientMagnitude,
  radialDist,
  radius,
  threshold,
  centerSuppressionInner,
  centerSuppressionOuter,
  structureMin,
  structureMax,
}) {
  const nodeBand = float(1.0).sub(smoothstep(float(0.0), threshold, fieldAbs));
  const structure = smoothstep(structureMin, structureMax, gradientMagnitude);
  const centerSuppression = smoothstep(
    centerSuppressionInner,
    centerSuppressionOuter,
    radialDist,
  );
  void radius;

  return {
    nodeBand,
    structure,
    centerSuppression,
    potential: nodeBand.mul(structure).mul(centerSuppression),
  };
}

function projectOntoTangent(vector, radialDir) {
  return vector.sub(radialDir.mul(vector.dot(radialDir)));
}

function createContourMetrics({ field, fieldAbs, structure, threshold }) {
  const contourBand = float(1.0).sub(
    smoothstep(
      float(0.0),
      threshold.mul(float(CONTOUR_FIELD_WIDTH_SCALE)),
      fieldAbs,
    ),
  );
  const bandStrength = contourBand
    .pow(float(CONTOUR_BAND_SHARPNESS))
    .mul(structure);
  return {
    bandStrength,
    contourSign: select(
      field.greaterThanEqual(float(0.0)),
      float(-1.0),
      float(1.0),
    ),
  };
}

function createShellGroupTag(baseShellRadius, radius, surfaceControl) {
  const shellSpacing = radius.mul(
    float((1 - SHELL_MIN_RADIUS_RATIO) / (SHELL_COUNT - 1)),
  );
  const isOuterShell = baseShellRadius.greaterThanEqual(
    radius.sub(shellSpacing),
  );

  return select(
    surfaceControl.equal(1).and(isOuterShell),
    float(1.0),
    float(2.0),
  );
}

export function createComputeNodes({ count, capacity, buffers, uniforms }) {
  const {
    modeBuffer,
    basePositionBuffer,
    baryonBuffer,
    scalarFieldBuffer,
    zeroPointsBuffer,
    particlesBuffer,
    velocityBuffer,
  } = buffers;
  const {
    uTime,
    uDeltaTime,
    uRadius,
    uThreshold,
    uFlowFieldStrength,
    uFlowFieldFrequency,
    uFlowMix,
    uParticleSpeed,
    uAttractionStrength,
    uVelocityDamping,
    uCenterSuppressionInner,
    uCenterSuppressionOuter,
    uStructureMin,
    uStructureMax,
    uActiveModeCount,
    uSurfaceControl,
    uFieldState,
    uIdleLogoSize,
  } = uniforms;
  const PI = float(Math.PI);
  const EPSILON = float(0.0001);

  const scalarFieldCompute = Fn(() => {
    const base = basePositionBuffer.element(instanceIndex);
    const pos = base.xyz;
    const invR = float(1.0).div(uRadius);
    const sum = float(0.0).toVar();

    Loop(capacity, ({ i }) => {
      const w = modeBuffer.element(i);
      const Ai = w.w;
      const ui = w.x;
      const vi = w.y;
      const wi = w.z;
      sum.addAssign(
        Ai.mul(sin(ui.mul(PI).mul(pos.x).mul(invR)))
          .mul(sin(vi.mul(PI).mul(pos.y).mul(invR)))
          .mul(sin(wi.mul(PI).mul(pos.z).mul(invR))),
      );
    });

    scalarFieldBuffer.element(instanceIndex).assign(vec4(pos, sum));
  })().compute(count);

  const zeroPointsCompute = Fn(() => {
    const scalarVal = scalarFieldBuffer.element(instanceIndex);
    const pos = scalarVal.xyz;
    const baseShellRadius = basePositionBuffer.element(instanceIndex).w;
    const field = scalarVal.w;
    const fieldAbs = abs(field);
    const invR = float(1.0).div(uRadius);
    const gradX = float(0.0).toVar();
    const gradY = float(0.0).toVar();
    const gradZ = float(0.0).toVar();

    Loop(capacity, ({ i }) => {
      const w = modeBuffer.element(i);
      const Ai = w.w;
      const ui = w.x;
      const vi = w.y;
      const wi = w.z;
      const sx = sin(ui.mul(PI).mul(pos.x).mul(invR));
      const sy = sin(vi.mul(PI).mul(pos.y).mul(invR));
      const sz = sin(wi.mul(PI).mul(pos.z).mul(invR));
      const gx = cos(ui.mul(PI).mul(pos.x).mul(invR)).mul(ui.mul(PI).mul(invR));
      const gy = cos(vi.mul(PI).mul(pos.y).mul(invR)).mul(vi.mul(PI).mul(invR));
      const gz = cos(wi.mul(PI).mul(pos.z).mul(invR)).mul(wi.mul(PI).mul(invR));
      gradX.addAssign(Ai.mul(gx).mul(sy).mul(sz));
      gradY.addAssign(Ai.mul(sx).mul(gy).mul(sz));
      gradZ.addAssign(Ai.mul(sx).mul(sy).mul(gz));
    });

    const gradient = vec3(gradX, gradY, gradZ);
    const gradientMagnitude = length(gradient);
    const nodalMetrics = createNodalMetrics({
      fieldAbs,
      gradientMagnitude,
      radialDist: length(pos),
      radius: uRadius,
      threshold: uThreshold,
      centerSuppressionInner: uCenterSuppressionInner,
      centerSuppressionOuter: uCenterSuppressionOuter,
      structureMin: uStructureMin,
      structureMax: uStructureMax,
    });
    const contourMetrics = createContourMetrics({
      field,
      fieldAbs,
      structure: nodalMetrics.structure,
      threshold: uThreshold,
    });

    If(
      uFieldState
        .equal(FIELD_STATE_VALUES.idle)
        .or(uActiveModeCount.lessThanEqual(0)),
      () => {
        zeroPointsBuffer
          .element(instanceIndex)
          .assign(vec4(float(0.0), float(1.0), float(0.0), float(0.0)));
      },
    ).Else(() => {
      zeroPointsBuffer
        .element(instanceIndex)
        .assign(
          vec4(
            contourMetrics.bandStrength,
            createShellGroupTag(baseShellRadius, uRadius, uSurfaceControl),
            fieldAbs,
            gradientMagnitude,
          ),
        );
    });
  })().compute(count);

  const particlesCompute = Fn(() => {
    const oldParticle = particlesBuffer.element(instanceIndex);
    const oldPos = oldParticle.xyz;
    const oldVelocity = velocityBuffer.element(instanceIndex).xyz;
    const basePoint = basePositionBuffer.element(instanceIndex);
    const baseSample = basePoint.xyz;
    const baseShellRadius = basePoint.w;
    const baryonPos = baryonBuffer
      .element(instanceIndex)
      .xyz.mul(uIdleLogoSize);
    const radialDist = length(oldPos);
    const fieldDriven = uFieldState
      .greaterThan(FIELD_STATE_VALUES.idle)
      .and(uActiveModeCount.greaterThan(float(0.0)));

    const freq = uFlowFieldFrequency;
    const nPos = oldPos.mul(freq);
    const nx = mx_noise_float(vec3(nPos.x, nPos.y, nPos.z.add(uTime)));
    const ny = mx_noise_float(vec3(nPos.x.add(1.0), nPos.y, nPos.z.add(uTime)));
    const nz = mx_noise_float(vec3(nPos.x.add(2.0), nPos.y, nPos.z.add(uTime)));
    const flowField = normalize(vec3(nx, ny, nz));

    const invR = float(1.0).div(uRadius);
    const field = float(0.0).toVar();
    const gradX = float(0.0).toVar();
    const gradY = float(0.0).toVar();
    const gradZ = float(0.0).toVar();

    Loop(capacity, ({ i }) => {
      const w = modeBuffer.element(i);
      const Ai = w.w;
      const ui = w.x;
      const vi = w.y;
      const wi = w.z;
      const sx = sin(ui.mul(PI).mul(oldPos.x).mul(invR));
      const sy = sin(vi.mul(PI).mul(oldPos.y).mul(invR));
      const sz = sin(wi.mul(PI).mul(oldPos.z).mul(invR));
      const gx = cos(ui.mul(PI).mul(oldPos.x).mul(invR)).mul(
        ui.mul(PI).mul(invR),
      );
      const gy = cos(vi.mul(PI).mul(oldPos.y).mul(invR)).mul(
        vi.mul(PI).mul(invR),
      );
      const gz = cos(wi.mul(PI).mul(oldPos.z).mul(invR)).mul(
        wi.mul(PI).mul(invR),
      );
      field.addAssign(Ai.mul(sx).mul(sy).mul(sz));
      gradX.addAssign(Ai.mul(gx).mul(sy).mul(sz));
      gradY.addAssign(Ai.mul(sx).mul(gy).mul(sz));
      gradZ.addAssign(Ai.mul(sx).mul(sy).mul(gz));
    });

    const gradient = vec3(gradX, gradY, gradZ);
    const gradientMagnitude = length(gradient);
    const fieldAbs = abs(field);
    const nodalMetrics = createNodalMetrics({
      fieldAbs,
      gradientMagnitude,
      radialDist,
      radius: uRadius,
      threshold: uThreshold,
      centerSuppressionInner: uCenterSuppressionInner,
      centerSuppressionOuter: uCenterSuppressionOuter,
      structureMin: uStructureMin,
      structureMax: uStructureMax,
    });
    const contourMetrics = createContourMetrics({
      field,
      fieldAbs,
      structure: nodalMetrics.structure,
      threshold: uThreshold,
    });
    const shellResponseScale = uAttractionStrength.div(float(18.0));
    const radialBasis = select(
      radialDist.greaterThan(EPSILON),
      oldPos,
      baseSample,
    );
    const radialDir = normalize(
      radialBasis.add(vec3(EPSILON, EPSILON, EPSILON)),
    );
    const dynamicShellRadius = baseShellRadius.add(
      clamp(field, float(-1.0), float(1.0))
        .mul(uRadius.mul(float(0.045)))
        .mul(nodalMetrics.structure),
    );
    const shellSpring = radialDir.mul(
      dynamicShellRadius
        .sub(radialDist)
        .mul(float(SHELL_SPRING_STRENGTH))
        .mul(shellResponseScale),
    );
    const tangentialGradient = projectOntoTangent(gradient, radialDir);
    const contourForce = normalize(
      tangentialGradient.add(vec3(EPSILON, EPSILON, EPSILON)),
    ).mul(
      contourMetrics.bandStrength
        .mul(float(CONTOUR_FORCE_STRENGTH))
        .mul(contourMetrics.contourSign)
        .mul(shellResponseScale),
    );
    const anchorOffset = baseSample.sub(oldPos);
    const anchorForce = projectOntoTangent(anchorOffset, radialDir).mul(
      float(ANCHOR_FORCE_STRENGTH).mul(shellResponseScale),
    );
    const tangentialFlow = projectOntoTangent(flowField, radialDir);
    const flowStrength = uFlowFieldStrength
      .mul(uFlowMix)
      .mul(float(FLOW_FORCE_SCALE))
      .mul(float(1.0).sub(contourMetrics.bandStrength));
    const flow = tangentialFlow.mul(flowStrength);

    const activeVelocity = oldVelocity
      .mul(uVelocityDamping)
      .add(shellSpring.mul(uDeltaTime))
      .add(contourForce.mul(uDeltaTime))
      .add(anchorForce.mul(uDeltaTime))
      .add(flow.mul(uDeltaTime));
    const activeVelocityLength = length(activeVelocity);
    const clampedActiveVelocity = select(
      activeVelocityLength.greaterThan(float(2.0)),
      normalize(activeVelocity).mul(float(2.0)),
      activeVelocity,
    );
    const activePos = oldPos.add(
      clampedActiveVelocity.mul(uParticleSpeed).mul(uDeltaTime),
    );

    const idleToLogo = baryonPos.sub(oldPos);
    const idleAlpha = clamp(
      uParticleSpeed.mul(uDeltaTime).mul(0.08),
      float(0.0),
      float(0.08),
    );
    const idlePos = mix(oldPos, baryonPos, idleAlpha);
    const idleVelocity = oldVelocity
      .mul(float(0.6))
      .add(idleToLogo.mul(idleAlpha.mul(0.25)));

    const nextPos = select(fieldDriven, activePos, idlePos);
    const nextVelocity = select(
      fieldDriven,
      clampedActiveVelocity,
      idleVelocity,
    );
    const pLen = length(nextPos);
    const finalPos = select(
      pLen.greaterThan(uRadius),
      normalize(nextPos).mul(uRadius),
      nextPos,
    );
    const finalVelocity = select(
      pLen.greaterThan(uRadius),
      nextVelocity.mul(float(0.5)),
      nextVelocity,
    );
    const groupTag = select(
      fieldDriven,
      createShellGroupTag(baseShellRadius, uRadius, uSurfaceControl),
      float(1.0),
    );

    particlesBuffer.element(instanceIndex).assign(vec4(finalPos, groupTag));
    velocityBuffer
      .element(instanceIndex)
      .assign(vec4(finalVelocity, contourMetrics.bandStrength));
  })().compute(count);

  return {
    scalarFieldCompute,
    zeroPointsCompute,
    particlesCompute,
  };
}
