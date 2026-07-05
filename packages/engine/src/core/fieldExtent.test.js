import { describe, expect, it } from "vitest";
import {
  FIELD_EXTENTS,
  UNBOUNDED_CORE_STEP_RADIUS_SCALE,
  UNBOUNDED_DIRECTIVITY_RADIUS,
  UNBOUNDED_DOMAIN_SCALE,
  UNBOUNDED_FIELD_FALLOFF,
  UNBOUNDED_FOCUS_PRESENCE,
  UNBOUNDED_OUTER_FADE_END,
  UNBOUNDED_OUTER_FADE_START,
  UNBOUNDED_OUTER_STEP_STRETCH,
  UNBOUNDED_RADIAL_PHASE_GAIN,
  UNBOUNDED_REACH_EXTENSION,
  UNBOUNDED_STEP_SCALE,
  UNBOUNDED_SUPPORT_PRESENCE_END,
  UNBOUNDED_SUPPORT_PRESENCE_START,
  UNBOUNDED_TRAVEL_BLEND_END,
  UNBOUNDED_TRAVEL_BLEND_START,
  UNBOUNDED_WAVE_DRIFT,
  deriveUnboundedFieldEnvelope,
  getFieldExtentDomainScale,
  getFieldExtentFromValue,
  getFieldExtentValue,
  normalizeFieldExtent,
} from "./fieldExtent.js";

describe("normalizeFieldExtent", () => {
  it("defaults unknown values to the flagship sphere", () => {
    expect(normalizeFieldExtent(undefined)).toBe(FIELD_EXTENTS.sphere);
    expect(normalizeFieldExtent(null)).toBe(FIELD_EXTENTS.sphere);
    expect(normalizeFieldExtent("open")).toBe(FIELD_EXTENTS.sphere);
    expect(normalizeFieldExtent("sphere")).toBe(FIELD_EXTENTS.sphere);
  });

  it("accepts the unbounded extent", () => {
    expect(normalizeFieldExtent("unbounded")).toBe(FIELD_EXTENTS.unbounded);
  });
});

describe("field extent uniform mapping", () => {
  it("round-trips extent through the uniform value", () => {
    expect(getFieldExtentValue(FIELD_EXTENTS.sphere)).toBe(0);
    expect(getFieldExtentValue(FIELD_EXTENTS.unbounded)).toBe(1);
    expect(getFieldExtentFromValue(0)).toBe(FIELD_EXTENTS.sphere);
    expect(getFieldExtentFromValue(1)).toBe(FIELD_EXTENTS.unbounded);
    expect(getFieldExtentFromValue(0.49)).toBe(FIELD_EXTENTS.sphere);
    expect(getFieldExtentFromValue(0.51)).toBe(FIELD_EXTENTS.unbounded);
  });

  it("scales the march domain only for the unbounded extent", () => {
    expect(getFieldExtentDomainScale(FIELD_EXTENTS.sphere)).toBe(1);
    expect(getFieldExtentDomainScale(FIELD_EXTENTS.unbounded)).toBe(
      UNBOUNDED_DOMAIN_SCALE,
    );
    expect(getFieldExtentDomainScale("nonsense")).toBe(1);
  });

  it("keeps the canvas-filling reach inside its fidelity budget", () => {
    // The reach covers the canvas corners at flagship framing and ends by
    // absorption; radial-adaptive stepping keeps core sample density at
    // flagship level, with the outer stretch bounded so the traveling
    // wavelength (2π / phase gain) keeps ≥ ~4 samples per shell.
    expect(UNBOUNDED_OUTER_FADE_START).toBeLessThan(UNBOUNDED_OUTER_FADE_END);
    expect(UNBOUNDED_OUTER_FADE_END).toBeLessThan(1);
    expect(UNBOUNDED_OUTER_FADE_START).toBeGreaterThan(0.8);
    expect(UNBOUNDED_DOMAIN_SCALE).toBeGreaterThan(2.5);
    expect(UNBOUNDED_DOMAIN_SCALE).toBeLessThan(3.5);
    expect(UNBOUNDED_STEP_SCALE).toBeGreaterThan(0.6);
    expect(UNBOUNDED_STEP_SCALE).toBeLessThan(0.95);
    expect(UNBOUNDED_RADIAL_PHASE_GAIN).toBeGreaterThan(8);
  });

  it("keeps the dense march covering the travel blend with bounded stretch", () => {
    // Coarse steps must never touch the cavity→radiating morph zone, and
    // the stretch stays small enough to resolve the expanding shells.
    expect(UNBOUNDED_CORE_STEP_RADIUS_SCALE).toBeGreaterThanOrEqual(
      UNBOUNDED_TRAVEL_BLEND_END,
    );
    expect(UNBOUNDED_CORE_STEP_RADIUS_SCALE).toBeLessThan(2);
    expect(UNBOUNDED_OUTER_STEP_STRETCH).toBeGreaterThan(1);
    expect(UNBOUNDED_OUTER_STEP_STRETCH).toBeLessThan(4);
  });

  it("keeps the radiating continuation moving and anchored mid-cavity", () => {
    // Wavefronts must keep drifting between beats; the directivity sample
    // sits well inside the cavity (never the old sphere surface); a full
    // reach extension would cancel absorption entirely. The cavity →
    // radiating transition straddles the old cavity radius so no shell
    // feature appears at r = 1.
    expect(UNBOUNDED_WAVE_DRIFT).toBeGreaterThan(0);
    expect(UNBOUNDED_DIRECTIVITY_RADIUS).toBeGreaterThan(0.3);
    expect(UNBOUNDED_DIRECTIVITY_RADIUS).toBeLessThan(0.9);
    expect(UNBOUNDED_REACH_EXTENSION).toBeGreaterThan(0);
    expect(UNBOUNDED_REACH_EXTENSION).toBeLessThan(1);
    expect(UNBOUNDED_TRAVEL_BLEND_START).toBeLessThan(1);
    expect(UNBOUNDED_TRAVEL_BLEND_END).toBeGreaterThan(1);
  });

  it("keeps exposure presence and support calibration inside real ranges", () => {
    // Focus presence restores flagship-level blackfield exposure without a
    // shell; the support window must sit in the small absolute range real
    // normalized support occupies, or the reach extension never engages.
    expect(UNBOUNDED_FOCUS_PRESENCE).toBeGreaterThan(0);
    expect(UNBOUNDED_FOCUS_PRESENCE).toBeLessThanOrEqual(1);
    expect(UNBOUNDED_SUPPORT_PRESENCE_START).toBeGreaterThanOrEqual(0);
    expect(UNBOUNDED_SUPPORT_PRESENCE_START).toBeLessThan(
      UNBOUNDED_SUPPORT_PRESENCE_END,
    );
    expect(UNBOUNDED_SUPPORT_PRESENCE_END).toBeLessThan(0.5);
  });
});

describe("deriveUnboundedFieldEnvelope", () => {
  it("is the identity inside the flagship radius", () => {
    expect(deriveUnboundedFieldEnvelope({ radialDistance: 0 })).toBe(1);
    expect(deriveUnboundedFieldEnvelope({ radialDistance: 0.5 })).toBe(1);
    expect(deriveUnboundedFieldEnvelope({ radialDistance: 1 })).toBe(1);
  });

  it("decays monotonically beyond the flagship radius", () => {
    const samples = [1, 1.2, 1.45, 1.7, UNBOUNDED_DOMAIN_SCALE].map(
      (radialDistance) => deriveUnboundedFieldEnvelope({ radialDistance }),
    );
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]).toBeLessThan(samples[index - 1]);
    }
  });

  it("fades display energy exponentially beyond the flagship radius", () => {
    const radialDistance = 1.5;
    const expected = Math.exp(-(radialDistance - 1) * UNBOUNDED_FIELD_FALLOFF);
    expect(deriveUnboundedFieldEnvelope({ radialDistance })).toBeCloseTo(
      expected,
      12,
    );
  });

  it("lets modal support extend the reach so lobes shape the silhouette", () => {
    const nodalDirection = deriveUnboundedFieldEnvelope({
      radialDistance: 1.7,
    });
    const excitedLobe = deriveUnboundedFieldEnvelope({
      radialDistance: 1.7,
      supportPresence: 1,
    });

    // Lobes must carry visible energy deep into the extension — the "too
    // dim" regression came from lobes decaying at near-nodal rate.
    expect(excitedLobe).toBeGreaterThan(nodalDirection * 2);
    expect(excitedLobe).toBeGreaterThan(0.35);
    expect(nodalDirection).toBeLessThan(0.2);
  });

  it("keeps nodal directions dark at the march bound", () => {
    expect(
      deriveUnboundedFieldEnvelope({ radialDistance: UNBOUNDED_DOMAIN_SCALE }),
    ).toBeLessThan(0.12);
    // Excited lobes still carry energy into the fail-safe fade band, which
    // owns the final dissolve to exact zero — anisotropically, so it reads
    // as lobes fading into distance, not a wall.
    expect(
      deriveUnboundedFieldEnvelope({
        radialDistance: UNBOUNDED_DOMAIN_SCALE,
        supportPresence: 1,
      }),
    ).toBeLessThan(0.45);
  });

  it("fails closed on non-finite input", () => {
    expect(deriveUnboundedFieldEnvelope({ radialDistance: Number.NaN })).toBe(
      1,
    );
    expect(
      deriveUnboundedFieldEnvelope({
        radialDistance: 1.5,
        falloff: Number.NaN,
      }),
    ).toBe(1);
    expect(
      deriveUnboundedFieldEnvelope({
        radialDistance: 1.5,
        supportPresence: Number.NaN,
      }),
    ).toBeCloseTo(Math.exp(-0.5 * UNBOUNDED_FIELD_FALLOFF), 12);
  });
});
