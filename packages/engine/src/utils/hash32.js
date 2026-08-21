// Deterministic 32-bit word hashing for internal identity signatures. Domain
// modules own which values enter a signature; this module owns only canonical
// float serialization and word mixing.
export const HASH32_OFFSET_BASIS = 0x811c9dc5;

const HASH32_PRIME = 0x01000193;
const FLOAT32_VALUE = new Float32Array(1);
const FLOAT32_BITS = new Uint32Array(FLOAT32_VALUE.buffer);

export function hashUint32(value, hash) {
  return Math.imul(hash ^ (value >>> 0), HASH32_PRIME) >>> 0;
}

export function getFloat32Bits(value) {
  FLOAT32_VALUE[0] = Math.fround(Number.isFinite(value) ? value : 0);
  return FLOAT32_BITS[0];
}

export function hashFloat32(value, hash) {
  return hashUint32(getFloat32Bits(value), hash);
}
