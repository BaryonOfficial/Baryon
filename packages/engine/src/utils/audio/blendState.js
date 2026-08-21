function createSpectralMomentArray(capacity) {
  return new Float32Array(capacity * 4);
}

export function createBlendableLayerState(capacity) {
  return {
    slots: new Float32Array(capacity * 4),
    referenceSlots: new Float32Array(capacity * 4),
    spectralMomentSlots: createSpectralMomentArray(capacity),
    referenceSpectralMomentSlots: createSpectralMomentArray(capacity),
    phaseSlots: new Float32Array(capacity * 4),
    _poolCurrentMap: new Map(),
    _poolTargetMap: new Map(),
    _poolAdmittedKeys: new Set(),
    _poolBlendedMap: new Map(),
  };
}
