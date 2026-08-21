import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_CONTINUITY_SPINE_EXCITATION,
  CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_DETAIL_SPINE_EXCITATION,
  CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_EXTINCTION_COEFFICIENT,
  CYMATIC_PLASMA_INTRINSIC_EMISSION,
  CYMATIC_PLASMA_RADIANCE_GAIN,
  CYMATIC_PLASMA_SPINE_WHITE_MIX,
  CYMATIC_PLASMA_TANGENT_APERTURE_FILL,
  CYMATIC_PLASMA_TANGENT_EMISSION,
  CYMATIC_PLASMA_TANGENT_FOCUS,
  deriveCymaticPlasmaTransfer,
} from "./cymaticPlasmaTransfer.js";

const BASE_INPUT = Object.freeze({
  localRadiance: 0.8,
  continuitySpineDensity: 0.1,
  detailSpineDensity: 0.4,
  coreDensity: 0.3,
  sheathDensity: 0.2,
  materialDensityScale: 1,
  materialColor: [0.2, 0.7, 1],
  tangentColor: [0.1, 0.9, 1],
  normalDotRay: 0.2,
  tangentAuthority: 1,
  tangentPower: 1,
  audioAccentGain: 0,
});

function luminance(color) {
  return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
}

describe("cymatic plasma optical transfer", () => {
  it("locks one fixed, chromatic production radiance calibration", () => {
    expect(CYMATIC_PLASMA_RADIANCE_GAIN).toBeCloseTo(Math.SQRT2, 12);
    expect(CYMATIC_PLASMA_EXTINCTION_COEFFICIENT).toBe(0.6);
    expect(CYMATIC_PLASMA_CONTINUITY_SPINE_EXCITATION).toBe(130);
    expect(CYMATIC_PLASMA_DETAIL_SPINE_EXCITATION).toBe(25);
    expect(CYMATIC_PLASMA_SPINE_WHITE_MIX).toBe(0);
    expect(CYMATIC_PLASMA_INTRINSIC_EMISSION).toBe(0.32);
    expect(CYMATIC_PLASMA_TANGENT_EMISSION).toBe(0.75);
    expect(CYMATIC_PLASMA_TANGENT_FOCUS).toBe(1);
    expect(CYMATIC_PLASMA_TANGENT_APERTURE_FILL).toBe(2);
    expect(CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT).toBe(
      24,
    );
    expect(CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT).toBe(3);
    expect(CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT).toBe(2);
    const transfer = deriveCymaticPlasmaTransfer(BASE_INPUT);

    expect(transfer.baseRadiance.every((channel) => channel > 0)).toBe(true);
    expect(transfer.baseRadiance[2]).toBeGreaterThan(transfer.baseRadiance[0]);
  });

  it("keeps the topology filament hot while bounding fine detail below it", () => {
    const transfer = deriveCymaticPlasmaTransfer({
      ...BASE_INPUT,
      localRadiance: 1,
      audioAccentGain: 1,
      materialColor: [0.05, 0.5, 18],
      tangentColor: [0.05, 0.5, 18],
      normalDotRay: 0,
    });
    const continuitySpineLimit =
      transfer.continuitySpineExtinction *
      CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT;
    const detailSpineLimit =
      transfer.detailSpineExtinction *
      CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT;
    const bodyLimit =
      transfer.bodyExtinction *
      CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT;

    expect(
      Math.max(...transfer.continuitySpineBaseRadiance),
    ).toBeLessThanOrEqual(continuitySpineLimit + 1e-12);
    expect(Math.max(...transfer.detailSpineBaseRadiance)).toBeLessThanOrEqual(
      detailSpineLimit + 1e-12,
    );
    expect(Math.max(...transfer.bodyBaseRadiance)).toBeLessThanOrEqual(
      bodyLimit + 1e-12,
    );
    expect(transfer.continuitySpineRadianceAllocation).toBeGreaterThan(0);
    expect(transfer.continuitySpineRadianceAllocation).toBeLessThan(1);
    expect(transfer.detailSpineRadianceAllocation).toBeGreaterThan(0);
    expect(transfer.detailSpineRadianceAllocation).toBeLessThan(1);
    expect(transfer.bodyRadianceAllocation).toBeGreaterThan(0);
    expect(transfer.bodyRadianceAllocation).toBeLessThanOrEqual(1);
    expect(
      CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
    ).toBeGreaterThan(
      CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
    );
    expect(
      CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
    ).toBeGreaterThan(CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT);
    const spineLaneRadiancePairs = [
      [
        transfer.continuitySpineBaseRadiance,
        transfer.unallocatedContinuitySpineBaseRadiance,
      ],
      [
        transfer.detailSpineBaseRadiance,
        transfer.unallocatedDetailSpineBaseRadiance,
      ],
    ];
    for (const [
      allocatedRadiance,
      unallocatedRadiance,
    ] of spineLaneRadiancePairs) {
      expect(allocatedRadiance[2] / allocatedRadiance[1]).toBeCloseTo(
        unallocatedRadiance[2] / unallocatedRadiance[1],
        12,
      );
    }
    expect(
      transfer.bodyBaseRadiance[2] / transfer.bodyBaseRadiance[1],
    ).toBeCloseTo(
      transfer.unallocatedBodyBaseRadiance[2] /
        transfer.unallocatedBodyBaseRadiance[1],
      12,
    );
    transfer.baseRadiance.forEach((channel, index) => {
      expect(channel).toBeCloseTo(
        transfer.continuitySpineBaseRadiance[index] +
          transfer.detailSpineBaseRadiance[index] +
          transfer.bodyBaseRadiance[index],
        12,
      );
    });
  });

  it("keeps the observed geometry readable while local energy adds one bounded accent", () => {
    const quiet = deriveCymaticPlasmaTransfer({
      ...BASE_INPUT,
      localRadiance: 0,
      audioAccentGain: 1,
    });
    const active = deriveCymaticPlasmaTransfer({
      ...BASE_INPUT,
      localRadiance: 1,
      audioAccentGain: 1,
    });

    expect(quiet.extinction).toBeGreaterThan(0);
    expect(active.extinction).toBeCloseTo(quiet.extinction, 12);
    expect(quiet.baseRadiance.some((channel) => channel > 0)).toBe(true);
    active.baseRadiance.forEach((channel, index) => {
      expect(channel).toBeCloseTo(quiet.baseRadiance[index], 12);
      expect(active.sourceRadiance[index]).toBeCloseTo(
        quiet.baseRadiance[index] * 1.2,
        12,
      );
    });
    expect(quiet.audioAccentAuthority).toBe(0);
    expect(active.audioAccentAuthority).toBe(1);
  });

  it("preserves plasma chromaticity across the complete local-energy range", () => {
    const quiet = deriveCymaticPlasmaTransfer({
      ...BASE_INPUT,
      localRadiance: 0,
      audioAccentGain: 1,
    });
    const active = deriveCymaticPlasmaTransfer({
      ...BASE_INPUT,
      localRadiance: 1,
      audioAccentGain: 1,
    });
    const normalize = (color) => {
      const sum = color.reduce((total, channel) => total + channel, 0);
      return color.map((channel) => channel / sum);
    };

    normalize(active.sourceRadiance).forEach((channel, index) => {
      expect(channel).toBeCloseTo(normalize(quiet.sourceRadiance)[index], 12);
    });
  });

  it("keeps extinction independent of colour, view angle, and audio accent", () => {
    const reference = deriveCymaticPlasmaTransfer(BASE_INPUT);
    const altered = deriveCymaticPlasmaTransfer({
      ...BASE_INPUT,
      materialColor: [4, 0, 0],
      tangentColor: [0, 4, 0],
      normalDotRay: 1,
      tangentAuthority: 0,
      audioAccentGain: 1,
    });

    expect(altered.extinction).toBeCloseTo(reference.extinction, 12);
  });

  it("keeps the complete sheet visible while tangent emission reveals its line network", () => {
    const faceOn = deriveCymaticPlasmaTransfer({
      ...BASE_INPUT,
      normalDotRay: 1,
      tangentPower: 5,
    });
    const oblique = deriveCymaticPlasmaTransfer({
      ...BASE_INPUT,
      normalDotRay: 0.5,
      tangentPower: 5,
    });
    const grazing = deriveCymaticPlasmaTransfer({
      ...BASE_INPUT,
      normalDotRay: 0,
      tangentPower: 5,
    });

    const faceOnLuminance = luminance(faceOn.baseRadiance);
    const obliqueLuminance = luminance(oblique.baseRadiance);
    const grazingLuminance = luminance(grazing.baseRadiance);

    expect(faceOnLuminance).toBeGreaterThan(0);
    expect(grazing.tangentResponse).toBeGreaterThan(faceOn.tangentResponse);
    expect(obliqueLuminance).toBeGreaterThan(faceOnLuminance);
    expect(obliqueLuminance).toBeLessThan(grazingLuminance);
    expect(grazingLuminance).toBeGreaterThanOrEqual(faceOnLuminance * 1.5);
    expect(grazingLuminance).toBeLessThanOrEqual(faceOnLuminance * 4);
  });

  it("keeps laser focus authoritative beneath the fixed radiance ceiling", () => {
    const broad = deriveCymaticPlasmaTransfer({
      ...BASE_INPUT,
      normalDotRay: 0.5,
      tangentPower: 0.5,
    });
    const narrow = deriveCymaticPlasmaTransfer({
      ...BASE_INPUT,
      normalDotRay: 0.5,
      tangentPower: 8,
    });
    const broadGrazing = deriveCymaticPlasmaTransfer({
      ...BASE_INPUT,
      normalDotRay: 0,
      tangentPower: 0.5,
    });
    const narrowGrazing = deriveCymaticPlasmaTransfer({
      ...BASE_INPUT,
      normalDotRay: 0,
      tangentPower: 8,
    });

    expect(narrow.extinction).toBeCloseTo(broad.extinction, 12);
    expect(broad.continuitySpineRadianceAllocation).toBeCloseTo(
      narrow.continuitySpineRadianceAllocation,
      12,
    );
    expect(broad.detailSpineRadianceAllocation).toBeCloseTo(
      narrow.detailSpineRadianceAllocation,
      12,
    );
    expect(broad.bodyRadianceAllocation).toBeCloseTo(
      narrow.bodyRadianceAllocation,
      12,
    );
    expect(broad.tangentResponse).toBeGreaterThan(narrow.tangentResponse * 4);
    expect(luminance(broad.baseRadiance)).toBeGreaterThan(
      luminance(narrow.baseRadiance) * 1.5,
    );
    broadGrazing.baseRadiance.forEach((channel, index) => {
      expect(channel).toBeCloseTo(narrowGrazing.baseRadiance[index], 12);
    });
    expect(
      Math.max(...broadGrazing.continuitySpineBaseRadiance),
    ).toBeLessThanOrEqual(broadGrazing.continuitySpineRadianceLimit + 1e-12);
    expect(
      Math.max(...broadGrazing.detailSpineBaseRadiance),
    ).toBeLessThanOrEqual(broadGrazing.detailSpineRadianceLimit + 1e-12);
  });

  it("lets audio accent articulate but never gate the base sheet", () => {
    const base = deriveCymaticPlasmaTransfer({
      ...BASE_INPUT,
      localRadiance: 0,
      audioAccentGain: 1,
    });
    const accented = deriveCymaticPlasmaTransfer({
      ...BASE_INPUT,
      localRadiance: 1,
      audioAccentGain: 1,
    });

    expect(base.baseRadiance.some((channel) => channel > 0)).toBe(true);
    expect(base.accentRadiance).toEqual([0, 0, 0]);
    accented.sourceRadiance.forEach((channel, index) => {
      expect(channel).toBeGreaterThan(accented.baseRadiance[index]);
    });
  });

  it("has no legacy salience, column-normalization, or runtime gain inputs", () => {
    const cpuSource = readFileSync(
      new URL("./cymaticPlasmaTransfer.js", import.meta.url),
      "utf8",
    );
    const gpuSource = readFileSync(
      new URL("./cymaticPlasmaTransferNode.js", import.meta.url),
      "utf8",
    );
    for (const source of [cpuSource, gpuSource]) {
      expect(source).not.toContain("trapSalience");
      expect(source).not.toContain("carrierColumnDensityScale");
      expect(source).not.toContain("holographicBaseRadianceGain");
    }
  });
});
