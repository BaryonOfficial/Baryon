export const RAYMARCH_GRAZING_START = 0.78;
export const RAYMARCH_GRAZING_END = 0.98;
export const RAYMARCH_BOUNDARY_START = 0.74;
export const RAYMARCH_BOUNDARY_END = 0.98;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }

  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function intersectRaySphereSegment(
  origin,
  direction,
  radius,
  maxDistance = Infinity,
) {
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;
  const dx = direction.x;
  const dy = direction.y;
  const dz = direction.z;

  const b = ox * dx + oy * dy + oz * dz;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const discriminant = b * b - c;

  if (discriminant <= 0) {
    return null;
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const enter = Math.max(0, -b - sqrtDiscriminant);
  const exit = Math.min(maxDistance, -b + sqrtDiscriminant);

  if (exit <= enter) {
    return null;
  }

  return {
    enter,
    exit,
    length: exit - enter,
  };
}

export function estimateProjectedSphereStats({
  radius,
  samples = 33,
  grazingStart = RAYMARCH_GRAZING_START,
  grazingEnd = RAYMARCH_GRAZING_END,
  boundaryStart = RAYMARCH_BOUNDARY_START,
  boundaryEnd = RAYMARCH_BOUNDARY_END,
}) {
  let hits = 0;
  let misses = 0;
  let totalLength = 0;
  let totalSuppression = 0;

  for (let yIndex = 0; yIndex < samples; yIndex += 1) {
    const y = ((yIndex / (samples - 1)) * 2 - 1) * radius;

    for (let xIndex = 0; xIndex < samples; xIndex += 1) {
      const x = ((xIndex / (samples - 1)) * 2 - 1) * radius;
      const radialDistance = Math.hypot(x, y);

      if (radialDistance >= radius) {
        misses += 1;
        continue;
      }

      const segmentLength =
        2 * Math.sqrt(radius * radius - radialDistance * radialDistance);
      const normalizedRadialDistance = radialDistance / radius;
      const boundaryMask = smoothstep(
        boundaryStart,
        boundaryEnd,
        normalizedRadialDistance,
      );
      const grazingMask = smoothstep(
        grazingStart,
        grazingEnd,
        normalizedRadialDistance,
      );

      hits += 1;
      totalLength += segmentLength;
      totalSuppression += boundaryMask * grazingMask;
    }
  }

  const sampleCount = hits + misses;

  return {
    avgRaySegmentLength: hits > 0 ? totalLength / hits : 0,
    missRatio: sampleCount > 0 ? misses / sampleCount : 0,
    avgSilhouetteSuppression: hits > 0 ? totalSuppression / hits : 0,
  };
}
