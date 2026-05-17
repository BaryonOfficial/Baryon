const COLOR_SLOT_STRIDE = 4;

function createColorSlotArray(capacity) {
  return new Float32Array(capacity * COLOR_SLOT_STRIDE);
}

export function createBlendableLayerState(capacity) {
  return {
    slots: new Float32Array(capacity * 4),
    referenceSlots: new Float32Array(capacity * 4),
    colorSlots: createColorSlotArray(capacity),
    referenceColorSlots: createColorSlotArray(capacity),
    phaseSlots: new Float32Array(capacity * 4),
    _poolCurrentMap: new Map(),
    _poolTargetMap: new Map(),
    _poolAdmittedKeys: new Set(),
    _poolBlendedMap: new Map(),
    _poolCurrentColorMap: new Map(),
    _poolTargetColorMap: new Map(),
  };
}
