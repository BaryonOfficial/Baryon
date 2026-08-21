import { describe, expect, it } from "vitest";
import {
  HASH32_OFFSET_BASIS,
  getFloat32Bits,
  hashFloat32,
  hashUint32,
} from "./hash32.js";

describe("32-bit identity hashing", () => {
  it("serializes numbers with the existing finite float32 contract", () => {
    expect(getFloat32Bits(1)).toBe(0x3f800000);
    expect(getFloat32Bits(-0)).toBe(0x80000000);
    expect(getFloat32Bits(Number.NaN)).toBe(0);
    expect(getFloat32Bits(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("preserves the established word-mixing signatures", () => {
    expect(hashUint32(0, HASH32_OFFSET_BASIS)).toBe(84696351);
    expect(hashFloat32(1, HASH32_OFFSET_BASIS)).toBe(3582745887);
    expect(hashUint32(7, hashUint32(42, HASH32_OFFSET_BASIS))).toBe(1256106062);
  });
});
