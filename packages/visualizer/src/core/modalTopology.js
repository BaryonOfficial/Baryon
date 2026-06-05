const COORDINATE_NAMES = ["u", "v", "w"];

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeModalTopologyCoordinate(value) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

export function readModalTopologyMode(source) {
  const directMode =
    source?.mode ??
    source?.payload?.slot ??
    source?.lastRenderablePayload?.slot ??
    source?.slot ??
    null;
  const modeSource =
    directMode ??
    (Array.isArray(source) || ArrayBuffer.isView(source) ? source : null);

  if (modeSource) {
    return [
      normalizeModalTopologyCoordinate(modeSource[0]),
      normalizeModalTopologyCoordinate(modeSource[1]),
      normalizeModalTopologyCoordinate(modeSource[2]),
    ];
  }

  return COORDINATE_NAMES.map((name) =>
    normalizeModalTopologyCoordinate(source?.[name]),
  );
}

export function getRectangularModeShellKey(source) {
  const [u, v, w] = readModalTopologyMode(source).map(Math.abs);
  return `rect:${u * u + v * v + w * w}`;
}

export function getRectangularModeFamilyKey(source) {
  return readModalTopologyMode(source)
    .map(Math.abs)
    .sort((left, right) => left - right)
    .join(":");
}

export function summarizeModalTopology(
  records,
  {
    getShellKey = getRectangularModeShellKey,
    getFamilyKey = getRectangularModeFamilyKey,
    includeRecord = null,
  } = {},
) {
  const shellKeys = new Set();
  const familyKeys = new Set();
  let recordCount = 0;

  for (const record of records ?? []) {
    if (!record || (includeRecord && !includeRecord(record))) {
      continue;
    }
    recordCount += 1;
    shellKeys.add(getShellKey(record));
    familyKeys.add(getFamilyKey(record));
  }

  return {
    recordCount,
    shellCount: shellKeys.size,
    familyCount: familyKeys.size,
    duplicateShellPressure:
      recordCount > 0
        ? clamp01((recordCount - shellKeys.size) / recordCount)
        : 0,
  };
}

export function summarizeModalSlotTopologyRange(
  slots,
  { startIndex = 0, count = undefined, skipZeroCoefficient = true } = {},
) {
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  const start = Math.min(slotCount, Math.max(0, Math.floor(startIndex ?? 0)));
  const rangeCount = Number.isFinite(count)
    ? Math.max(0, Math.floor(count))
    : slotCount - start;
  const end = Math.min(slotCount, start + rangeCount);
  const records = [];

  for (let slotIndex = start; slotIndex < end; slotIndex += 1) {
    const offset = slotIndex * 4;
    const coefficient = Math.max(0, slots?.[offset + 3] ?? 0);
    if (skipZeroCoefficient && coefficient <= 0) {
      continue;
    }
    records.push({
      u: slots?.[offset] ?? 0,
      v: slots?.[offset + 1] ?? 0,
      w: slots?.[offset + 2] ?? 0,
      coefficient,
    });
  }

  return summarizeModalTopology(records);
}
