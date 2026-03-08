import {
  Fn, instanceIndex, float, vec3, vec4, If, Loop,
  abs, length, normalize, mix, smoothstep, clamp, sin,
  select, mx_noise_float,
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
  } = buffers;
  const {
    uTime,
    uDeltaTime,
    uRadius,
    uThreshold,
    uSurfaceThreshold,
    uFlowFieldInfluence,
    uFlowFieldStrength,
    uFlowFieldFrequency,
    uParticleSpeed,
    uDistanceThreshold,
    uActiveModeCount,
    uSurfaceControl,
    uParticleMovementType,
    uFieldState,
    uIdleLogoSize,
  } = uniforms;
  const PI = float(Math.PI);

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
    const baryonVal = baryonBuffer.element(instanceIndex);
    const prevZero = zeroPointsBuffer.element(instanceIndex);
    const scaledBaryonPos = baryonVal.xyz.mul(uIdleLogoSize);
    const useBaryon = uFieldState.equal(FIELD_STATE_VALUES.idle);

    If(useBaryon, () => {
      zeroPointsBuffer.element(instanceIndex).assign(vec4(scaledBaryonPos, float(1.0)));
    }).Else(() => {
      If(uActiveModeCount.lessThanEqual(0), () => {
        zeroPointsBuffer.element(instanceIndex).assign(prevZero);
      }).Else(() => {
        const pos = scalarVal.xyz;
        const chladni = scalarVal.w;
        const dist = length(pos);
        If(dist.greaterThan(uRadius.mul(0.12)).and(abs(chladni).lessThan(uThreshold)), () => {
          const isOnSurface = abs(dist.sub(uRadius)).lessThanEqual(uSurfaceThreshold);
          const groupTag = select(isOnSurface, float(1.0), float(2.0));
          If(isOnSurface.and(uSurfaceControl.equal(0)), () => {
            zeroPointsBuffer.element(instanceIndex).assign(prevZero);
          }).Else(() => {
            zeroPointsBuffer.element(instanceIndex).assign(vec4(pos, groupTag));
          });
        }).Else(() => {
          zeroPointsBuffer.element(instanceIndex).assign(prevZero);
        });
      });
    });
  })().compute(count);

  const particlesCompute = Fn(() => {
    const oldParticle = particlesBuffer.element(instanceIndex);
    const oldPos = oldParticle.xyz;
    const zeroPoint = zeroPointsBuffer.element(instanceIndex);
    const baryonPos = baryonBuffer.element(instanceIndex).xyz.mul(uIdleLogoSize);
    const target = select(uFieldState.greaterThan(FIELD_STATE_VALUES.idle), zeroPoint.xyz, baryonPos);
    const toTarget = target.sub(oldPos);
    const dist = length(toTarget);
    const dir = toTarget.div(dist.add(0.0001));

    const freq = uFlowFieldFrequency;
    const nPos = oldPos.mul(freq);
    const nx = mx_noise_float(vec3(nPos.x, nPos.y, nPos.z.add(uTime)));
    const ny = mx_noise_float(vec3(nPos.x.add(1.0), nPos.y, nPos.z.add(uTime)));
    const nz = mx_noise_float(vec3(nPos.x.add(2.0), nPos.y, nPos.z.add(uTime)));
    const flowField = normalize(vec3(nx, ny, nz));

    const rawStrength = mx_noise_float(vec3(target.mul(0.2).add(vec3(0.0, 0.0, uTime.add(1.0)))));
    const influence = uFlowFieldInfluence.sub(0.5).mul(-2.0);
    const strength = smoothstep(influence, float(1.0), rawStrength);
    const flowBlend = select(
      uFieldState.greaterThan(FIELD_STATE_VALUES.idle),
      clamp(dist.div(uDistanceThreshold.add(0.0001)), float(0.0), float(1.0)),
      float(0.0)
    );

    const adjustedDir = dir.add(flowField.mul(strength).mul(flowBlend));
    const movement = adjustedDir.mul(uDeltaTime).mul(uFlowFieldStrength);

    const lerpMovement = vec3(0.0).toVar();
    const timeFactor = clamp(uParticleSpeed.mul(uDeltaTime), float(0.0), float(1.0));
    const distanceFactor = smoothstep(float(0.0), uDistanceThreshold.add(float(1.0)), dist);
    const alpha = timeFactor.toVar();
    If(uFieldState.greaterThan(FIELD_STATE_VALUES.idle).and(uParticleMovementType.equal(1)), () => {
      alpha.assign(mix(timeFactor.mul(0.35), float(1.0), distanceFactor));
    }).Else(() => {
      alpha.assign(timeFactor.mul(0.12));
    });
    const damping = float(1.0).sub(dist.mul(-5.0).exp());
    alpha.mulAssign(damping);

    const interpolated = mix(oldPos, target, alpha);
    lerpMovement.assign(interpolated.sub(oldPos));

    const newPos = oldPos.add(movement).add(lerpMovement);
    const pLen = length(newPos);
    const finalPos = select(pLen.greaterThan(uRadius), normalize(newPos).mul(uRadius), newPos);

    particlesBuffer.element(instanceIndex).assign(vec4(finalPos, zeroPoint.w));
  })().compute(count);

  return {
    scalarFieldCompute,
    zeroPointsCompute,
    particlesCompute,
  };
}
