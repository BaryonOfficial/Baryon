import { clamp01 } from "../utils/math.js";

const COORDINATE_NAMES = ["u", "v", "w"];

/**
 * @typedef {(record: unknown) => string} ModalTopologyKeyReader
 * @typedef {(record: unknown) => boolean} ModalTopologyRecordPredicate
 * @typedef {{
 *   getShellKey?: ModalTopologyKeyReader,
 *   getFamilyKey?: ModalTopologyKeyReader,
 *   includeRecord?: ModalTopologyRecordPredicate | null,
 * }} ModalTopologySummaryOptions
 * @typedef {ModalTopologySummaryOptions & {
 *   startIndex?: number,
 *   count?: number,
 *   skipZeroCoefficient?: boolean,
 * }} ModalSlotTopologyRangeOptions
 */

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

function assertTopologyKeyReader(reader, name) {
  if (typeof reader !== "function") {
    throw new TypeError(
      `${name} must be provided by the modal geometry backend`,
    );
  }
  return reader;
}

/**
 * @param {Iterable<unknown> | null | undefined} records
 * @param {ModalTopologySummaryOptions} [options]
 */
export function summarizeModalTopology(records, options = {}) {
  const {
    getShellKey,
    getFamilyKey,
    includeRecord = null,
  } = /** @type {ModalTopologySummaryOptions} */ (options);
  const readShellKey = assertTopologyKeyReader(getShellKey, "getShellKey");
  const readFamilyKey = assertTopologyKeyReader(getFamilyKey, "getFamilyKey");

  const shellKeys = new Set();
  const familyKeys = new Set();
  let recordCount = 0;

  for (const record of records ?? []) {
    if (!record || (includeRecord && !includeRecord(record))) {
      continue;
    }
    recordCount += 1;
    shellKeys.add(readShellKey(record));
    familyKeys.add(readFamilyKey(record));
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

/**
 * @param {Float32Array | number[] | null | undefined} slots
 * @param {ModalSlotTopologyRangeOptions} [options]
 */
export function summarizeModalSlotTopologyRange(slots, options = {}) {
  const {
    startIndex = 0,
    count = undefined,
    skipZeroCoefficient = true,
    getShellKey,
    getFamilyKey,
  } = /** @type {ModalSlotTopologyRangeOptions} */ (options);
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

  return summarizeModalTopology(records, { getShellKey, getFamilyKey });
}
