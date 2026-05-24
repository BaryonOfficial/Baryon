import { describe, expect, it } from "vitest";
import { buildCanonicalFullModalDescriptor } from "./modalDescriptor.js";

function makeSlots(entries) {
  const slots = new Float32Array(entries.length * 4);
  entries.forEach(([u, v, w, amplitude], index) => {
    const offset = index * 4;
    slots[offset] = u;
    slots[offset + 1] = v;
    slots[offset + 2] = w;
    slots[offset + 3] = amplitude;
  });
  return slots;
}

function makeRoleSlots(entries) {
  const slots = new Float32Array(entries.length * 4);
  entries.forEach((role, index) => {
    const offset = index * 4;
    slots[offset] = role === "backbone" ? 1 : 2;
    slots[offset + 1] = role === "backbone" ? 1 : 0;
    slots[offset + 2] = role === "detail" ? 1 : 0;
    slots[offset + 3] = 1;
  });
  return slots;
}

function readModeKeys(slots, count) {
  const keys = [];
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    keys.push(`${slots[offset]}:${slots[offset + 1]}:${slots[offset + 2]}`);
  }
  return keys;
}

describe("buildCanonicalFullModalDescriptor", () => {
  it("shares descriptor capacity across roles instead of enforcing fixed role buckets", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: makeSlots([
        [3, 2, 5, 0.34],
        [4, 3, 6, 0.22],
      ]),
      modalFieldRoleSlots: makeRoleSlots(["detail", "detail"]),
      activeModalFieldModeCount: 2,
    });

    expect(descriptor.fieldAuthority).toBe("complete");
    expect(descriptor.capacity.maxTotalModes).toBe(2);
    expect(descriptor.counts.validModeCount).toBe(2);
    expect(descriptor.counts.modalFieldModeCount).toBe(2);
    expect(descriptor.diagnostics.descriptorOverflow).toBe(false);
    expect(readModeKeys(descriptor.slotViews.modalFieldSlots, 2)).toEqual([
      "3:2:5",
      "4:3:6",
    ]);
  });

  it("keeps field slots role-invariant when final coefficients are equal", () => {
    const asBackbone = buildCanonicalFullModalDescriptor({
      maxTotalModes: 1,
      modalFieldSlots: makeSlots([[2, 2, 4, 0.5]]),
      modalFieldRoleSlots: makeRoleSlots(["backbone"]),
      activeModalFieldModeCount: 1,
    });
    const asDetail = buildCanonicalFullModalDescriptor({
      maxTotalModes: 1,
      modalFieldSlots: makeSlots([[2, 2, 4, 0.5]]),
      modalFieldRoleSlots: makeRoleSlots(["detail"]),
      activeModalFieldModeCount: 1,
    });

    expect(Array.from(asBackbone.slotViews.modalFieldSlots)).toEqual(
      Array.from(asDetail.slotViews.modalFieldSlots),
    );
    expect(asBackbone.diagnostics.roleHistogram.backbone).toBe(1);
    expect(asDetail.diagnostics.roleHistogram.detail).toBe(1);
  });

  it("records overflow count, rejected energy, and rejection reasons", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: makeSlots([
        [1, 1, 1, 0.6],
        [2, 2, 2, 0.25],
        [3, 3, 3, 0.15],
      ]),
      modalFieldRoleSlots: makeRoleSlots(["backbone", "detail", "detail"]),
      activeModalFieldModeCount: 3,
    });

    expect(descriptor.fieldAuthority).toBe("blocked");
    expect(descriptor.diagnostics.descriptorOverflow).toBe(true);
    expect(descriptor.counts.overflowModeCount).toBe(1);
    expect(descriptor.diagnostics.rejectedModalEnergy).toBeCloseTo(
      0.15 ** 2,
      6,
    );
    expect(descriptor.diagnostics.rejectionReasons).toEqual({
      descriptorCapacity: 1,
    });
  });

  it("combines duplicate mode keys into one signed descriptor coefficient", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 3,
      modalFieldSlots: makeSlots([
        [2, 2, 2, 0.4],
        [2, 2, 2, 0.15],
      ]),
      modalFieldRoleSlots: makeRoleSlots(["backbone", "detail"]),
      activeModalFieldModeCount: 2,
    });

    expect(descriptor.counts.validModeCount).toBe(2);
    expect(descriptor.counts.modalFieldModeCount).toBe(1);
    expect(Array.from(descriptor.slotViews.modalFieldSlots.slice(0, 3))).toEqual(
      [2, 2, 2],
    );
    expect(descriptor.slotViews.modalFieldSlots[3]).toBeCloseTo(0.55, 6);
    expect(Array.from(descriptor.slotViews.modalFieldRoleSlots.slice(0, 4))).toEqual([
      3, 1, 1, 1,
    ]);
  });
});
