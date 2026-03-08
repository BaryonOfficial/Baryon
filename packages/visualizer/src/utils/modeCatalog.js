const SOUND_SPEED = 340.0;

function lowerBound(catalog, frequency) {
  let lo = 0;
  let hi = catalog.length;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (catalog[mid].frequency < frequency) lo = mid + 1;
    else hi = mid;
  }

  return lo;
}

export function createModeCatalog(radius, maxMode = 12) {
  const catalog = [];

  for (let u = 1; u <= maxMode; u++) {
    for (let v = 1; v <= maxMode; v++) {
      for (let w = 1; w <= maxMode; w++) {
        catalog.push({
          u,
          v,
          w,
          frequency: (SOUND_SPEED * 0.5 * Math.sqrt(u * u + v * v + w * w)) / radius,
        });
      }
    }
  }

  catalog.sort((a, b) => a.frequency - b.frequency);
  return catalog;
}

export function resolveFrequenciesToModes(peaks, catalog, capacity, previousIndices = []) {
  const slots = new Float32Array(capacity * 4);
  const nextIndices = new Array(capacity).fill(-1);

  for (let slot = 0; slot < capacity; slot++) {
    const peak = peaks[slot];
    if (!peak || peak.amplitude <= 0) continue;

    const center = lowerBound(catalog, peak.frequency);
    const candidateIndices = new Set();
    const previousIndex = previousIndices[slot];

    if (previousIndex >= 0 && previousIndex < catalog.length) {
      candidateIndices.add(previousIndex);
    }

    for (let offset = -2; offset <= 2; offset++) {
      const index = Math.max(0, Math.min(catalog.length - 1, center + offset));
      candidateIndices.add(index);
    }

    let weightedU = 0;
    let weightedV = 0;
    let weightedW = 0;
    let weightSum = 0;
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const index of candidateIndices) {
      const mode = catalog[index];
      const distance = Math.abs(mode.frequency - peak.frequency);
      const hysteresis = index === previousIndex ? 0.6 : 1.0;
      const adjustedDistance = distance * hysteresis;
      const weight = 1 / Math.max(adjustedDistance, 1);

      weightedU += mode.u * weight;
      weightedV += mode.v * weight;
      weightedW += mode.w * weight;
      weightSum += weight;

      if (adjustedDistance < bestDistance) {
        bestDistance = adjustedDistance;
        bestIndex = index;
      }
    }

    if (weightSum === 0 || bestIndex < 0) continue;

    slots[slot * 4] = weightedU / weightSum;
    slots[slot * 4 + 1] = weightedV / weightSum;
    slots[slot * 4 + 2] = weightedW / weightSum;
    slots[slot * 4 + 3] = peak.amplitude;
    nextIndices[slot] = bestIndex;
  }

  return { slots, nextIndices };
}
