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

export function estimateProjectedSphereStats({ radius, samples = 33 }) {
  let hits = 0;
  let misses = 0;
  let totalLength = 0;

  for (let yIndex = 0; yIndex < samples; yIndex += 1) {
    const y = ((yIndex / (samples - 1)) * 2 - 1) * radius;

    for (let xIndex = 0; xIndex < samples; xIndex += 1) {
      const x = ((xIndex / (samples - 1)) * 2 - 1) * radius;
      const radialDistance = Math.hypot(x, y);

      if (radialDistance >= radius) {
        misses += 1;
        continue;
      }

      hits += 1;
      totalLength +=
        2 * Math.sqrt(radius * radius - radialDistance * radialDistance);
    }
  }

  const sampleCount = hits + misses;

  return {
    avgRaySegmentLength: hits > 0 ? totalLength / hits : 0,
    missRatio: sampleCount > 0 ? misses / sampleCount : 0,
  };
}
