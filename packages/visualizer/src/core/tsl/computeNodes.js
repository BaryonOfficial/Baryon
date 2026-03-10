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
} from 'three/tsl';
import { FIELD_STATE_VALUES } from './uniforms.js';

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
    uSurfaceThreshold,
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
        Ai
          .mul(sin(ui.mul(PI).mul(pos.x).mul(invR)))
          .mul(sin(vi.mul(PI).mul(pos.y).mul(invR)))
          .mul(sin(wi.mul(PI).mul(pos.z).mul(invR)))
      );
    });

    scalarFieldBuffer.element(instanceIndex).assign(vec4(pos, sum));
  })().compute(count);

  const zeroPointsCompute = Fn(() => {
    const scalarVal = scalarFieldBuffer.element(instanceIndex);
    const pos = scalarVal.xyz;
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
    const radialDist = length(pos);
    const nodeBand = float(1.0).sub(smoothstep(float(0.0), uThreshold, fieldAbs));
    const structure = smoothstep(uStructureMin, uStructureMax, gradientMagnitude);
    const centerSuppression = smoothstep(
      uCenterSuppressionInner,
      uCenterSuppressionOuter,
      radialDist
    );
    const isOnSurface = abs(radialDist.sub(uRadius)).lessThanEqual(uSurfaceThreshold);
    const groupTag = select(
      isOnSurface.and(uSurfaceControl.equal(1)),
      float(1.0),
      float(2.0)
    );
    const potential = nodeBand.mul(structure).mul(centerSuppression);

    If(uFieldState.equal(FIELD_STATE_VALUES.idle).or(uActiveModeCount.lessThanEqual(0)), () => {
      zeroPointsBuffer.element(instanceIndex).assign(vec4(float(0.0), float(1.0), float(0.0), float(0.0)));
    }).Else(() => {
      zeroPointsBuffer.element(instanceIndex).assign(
        vec4(potential, groupTag, fieldAbs, gradientMagnitude)
      );
    });
  })().compute(count);

  const particlesCompute = Fn(() => {
    const oldParticle = particlesBuffer.element(instanceIndex);
    const oldPos = oldParticle.xyz;
    const oldVelocity = velocityBuffer.element(instanceIndex).xyz;
    const baseSample = basePositionBuffer.element(instanceIndex).xyz;
    const baseSampleMeta = zeroPointsBuffer.element(instanceIndex);
    const baryonPos = baryonBuffer.element(instanceIndex).xyz.mul(uIdleLogoSize);
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
      const gx = cos(ui.mul(PI).mul(oldPos.x).mul(invR)).mul(ui.mul(PI).mul(invR));
      const gy = cos(vi.mul(PI).mul(oldPos.y).mul(invR)).mul(vi.mul(PI).mul(invR));
      const gz = cos(wi.mul(PI).mul(oldPos.z).mul(invR)).mul(wi.mul(PI).mul(invR));
      field.addAssign(Ai.mul(sx).mul(sy).mul(sz));
      gradX.addAssign(Ai.mul(gx).mul(sy).mul(sz));
      gradY.addAssign(Ai.mul(sx).mul(gy).mul(sz));
      gradZ.addAssign(Ai.mul(sx).mul(sy).mul(gz));
    });

    const gradient = vec3(gradX, gradY, gradZ);
    const gradientMagnitude = length(gradient);
    const fieldAbs = abs(field);
    const nodeBand = float(1.0).sub(smoothstep(float(0.0), uThreshold, fieldAbs));
    const structure = smoothstep(uStructureMin, uStructureMax, gradientMagnitude);
    const centerSuppression = smoothstep(
      uCenterSuppressionInner,
      uCenterSuppressionOuter,
      radialDist
    );
    const potential = nodeBand.mul(structure).mul(centerSuppression);
    const signScale = select(field.greaterThanEqual(float(0.0)), float(-1.0), float(1.0));
    const gradientDir = normalize(gradient.add(vec3(EPSILON, EPSILON, EPSILON)));
    const radialDir = normalize(oldPos.add(vec3(EPSILON, EPSILON, EPSILON)));
    const toAnchor = baseSample.sub(oldPos);
    const anchorDistance = length(toAnchor);
    const anchorDir = normalize(toAnchor.add(vec3(EPSILON, EPSILON, EPSILON)));
    const anchorPotential = baseSampleMeta.x;
    const attractionStrength = clamp(
      fieldAbs.div(uThreshold.mul(4.0).add(EPSILON)),
      float(0.0),
      float(1.0)
    )
      .mul(structure)
      .mul(centerSuppression)
      .mul(uAttractionStrength);
    const attraction = gradientDir.mul(signScale).mul(attractionStrength);
    const anchorStrength = smoothstep(float(0.0), uRadius.mul(0.35), anchorDistance)
      .mul(anchorPotential)
      .mul(uAttractionStrength.mul(float(0.8)));
    const anchorAttraction = anchorDir.mul(anchorStrength);
    const centerEscapeStrength = float(1.0)
      .sub(centerSuppression)
      .mul(float(1.0).sub(nodeBand.mul(structure)))
      .mul(uAttractionStrength.mul(float(0.35)));
    const centerEscape = radialDir.mul(centerEscapeStrength);
    const flowStrength = uFlowFieldStrength
      .mul(uFlowMix)
      .mul(float(1.0).sub(potential))
      .mul(float(1.0).sub(anchorPotential.mul(float(0.85))));
    const flow = flowField.mul(flowStrength);

    const activeVelocity = oldVelocity
      .mul(uVelocityDamping)
      .add(attraction.mul(uDeltaTime))
      .add(anchorAttraction.mul(uDeltaTime))
      .add(centerEscape.mul(uDeltaTime))
      .add(flow.mul(uDeltaTime));
    const activeVelocityLength = length(activeVelocity);
    const clampedActiveVelocity = select(
      activeVelocityLength.greaterThan(float(2.0)),
      normalize(activeVelocity).mul(float(2.0)),
      activeVelocity
    );
    const activePos = oldPos.add(clampedActiveVelocity.mul(uParticleSpeed).mul(uDeltaTime));

    const idleToLogo = baryonPos.sub(oldPos);
    const idleAlpha = clamp(uParticleSpeed.mul(uDeltaTime).mul(0.08), float(0.0), float(0.08));
    const idlePos = mix(oldPos, baryonPos, idleAlpha);
    const idleVelocity = oldVelocity.mul(float(0.6)).add(idleToLogo.mul(idleAlpha.mul(0.25)));

    const nextPos = select(fieldDriven, activePos, idlePos);
    const nextVelocity = select(fieldDriven, clampedActiveVelocity, idleVelocity);
    const pLen = length(nextPos);
    const finalPos = select(pLen.greaterThan(uRadius), normalize(nextPos).mul(uRadius), nextPos);
    const finalVelocity = select(
      pLen.greaterThan(uRadius),
      nextVelocity.mul(float(0.5)),
      nextVelocity
    );
    const finalRadius = length(finalPos);
    const isOnSurface = abs(finalRadius.sub(uRadius)).lessThanEqual(uSurfaceThreshold);
    const groupTag = select(
      fieldDriven.and(isOnSurface).and(uSurfaceControl.equal(1)),
      float(1.0),
      select(fieldDriven, float(2.0), float(1.0))
    );

    particlesBuffer.element(instanceIndex).assign(vec4(finalPos, groupTag));
    velocityBuffer.element(instanceIndex).assign(vec4(finalVelocity, potential));
  })().compute(count);

  return {
    scalarFieldCompute,
    zeroPointsCompute,
    particlesCompute,
  };
}
