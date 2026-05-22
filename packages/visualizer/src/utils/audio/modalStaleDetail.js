function buildModeKey(u, v, w) {
  return `${u}:${v}:${w}`;
}

function buildModeKeySet(slots, capacity) {
  const keys = new Set();
  if (!(slots instanceof Float32Array)) {
    return keys;
  }

  const slotLimit = Math.min(capacity, Math.floor(slots.length / 4));
  for (let index = 0; index < slotLimit; index += 1) {
    const offset = index * 4;
    if ((slots[offset + 3] ?? 0) <= 0) {
      continue;
    }
    keys.add(buildModeKey(slots[offset], slots[offset + 1], slots[offset + 2]));
  }

  return keys;
}

export function buildStaleDetailReleaseOverrides({
  visibleSlots,
  targetSlots,
  capacity,
  release,
}) {
  const targetKeys = buildModeKeySet(targetSlots, capacity);
  const overrides = new Map();
  if (!(visibleSlots instanceof Float32Array) || targetKeys.size === 0) {
    return overrides;
  }

  const slotLimit = Math.min(capacity, Math.floor(visibleSlots.length / 4));
  for (let index = 0; index < slotLimit; index += 1) {
    const offset = index * 4;
    if ((visibleSlots[offset + 3] ?? 0) <= 0) {
      continue;
    }
    const key = buildModeKey(
      visibleSlots[offset],
      visibleSlots[offset + 1],
      visibleSlots[offset + 2],
    );
    if (!targetKeys.has(key)) {
      overrides.set(key, release);
    }
  }

  return overrides;
}

export function computeStaleDetailPressure({
  visibleSlots,
  targetSlots,
  capacity,
}) {
  if (
    !(visibleSlots instanceof Float32Array) ||
    !(targetSlots instanceof Float32Array)
  ) {
    return 0;
  }

  const targetAmplitudes = new Map();
  const targetLimit = Math.min(capacity, Math.floor(targetSlots.length / 4));
  for (let index = 0; index < targetLimit; index += 1) {
    const offset = index * 4;
    const amplitude = targetSlots[offset + 3] ?? 0;
    if (amplitude <= 0) {
      continue;
    }
    targetAmplitudes.set(
      buildModeKey(
        targetSlots[offset],
        targetSlots[offset + 1],
        targetSlots[offset + 2],
      ),
      amplitude,
    );
  }

  let pressure = 0;
  const visibleLimit = Math.min(capacity, Math.floor(visibleSlots.length / 4));
  for (let index = 0; index < visibleLimit; index += 1) {
    const offset = index * 4;
    const amplitude = visibleSlots[offset + 3] ?? 0;
    if (amplitude <= 0) {
      continue;
    }
    const targetAmplitude = targetAmplitudes.get(
      buildModeKey(
        visibleSlots[offset],
        visibleSlots[offset + 1],
        visibleSlots[offset + 2],
      ),
    );
    pressure += Number.isFinite(targetAmplitude)
      ? Math.max(0, amplitude - targetAmplitude)
      : amplitude;
  }

  return pressure;
}

export function buildStaleDetailTrackingOverrides({
  visibleSlots,
  targetSlots,
  capacity,
  tracking,
}) {
  const targetAmplitudes = new Map();
  if (!(targetSlots instanceof Float32Array)) {
    return targetAmplitudes;
  }

  const targetLimit = Math.min(capacity, Math.floor(targetSlots.length / 4));
  for (let index = 0; index < targetLimit; index += 1) {
    const offset = index * 4;
    const amplitude = targetSlots[offset + 3] ?? 0;
    if (amplitude <= 0) {
      continue;
    }
    targetAmplitudes.set(
      buildModeKey(
        targetSlots[offset],
        targetSlots[offset + 1],
        targetSlots[offset + 2],
      ),
      amplitude,
    );
  }

  const overrides = new Map();
  if (!(visibleSlots instanceof Float32Array) || targetAmplitudes.size === 0) {
    return overrides;
  }

  const visibleLimit = Math.min(capacity, Math.floor(visibleSlots.length / 4));
  for (let index = 0; index < visibleLimit; index += 1) {
    const offset = index * 4;
    const amplitude = visibleSlots[offset + 3] ?? 0;
    if (amplitude <= 0) {
      continue;
    }
    const key = buildModeKey(
      visibleSlots[offset],
      visibleSlots[offset + 1],
      visibleSlots[offset + 2],
    );
    const targetAmplitude = targetAmplitudes.get(key);
    if (Number.isFinite(targetAmplitude) && targetAmplitude < amplitude) {
      overrides.set(key, tracking);
    }
  }

  return overrides;
}
