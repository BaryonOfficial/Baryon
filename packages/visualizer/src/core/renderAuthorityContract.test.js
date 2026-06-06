import { describe, expect, it } from "vitest";
import {
  allowsModalDescriptorRenderAuthority,
  allowsAudioMotion,
  allowsCurrentLiveRenderFrame,
  hasRenderAuthority,
} from "./renderAuthorityContract.js";

describe("render authority contract", () => {
  it("allows render and motion from explicit ledger authority", () => {
    const ledgerDecayTail = {
      energyLedger: {
        projectedRenderEnergy: 0.08,
        renderEnergyEpsilon: 1e-6,
      },
    };

    expect(hasRenderAuthority(ledgerDecayTail)).toBe(true);
    expect(allowsAudioMotion(ledgerDecayTail)).toBe(true);
  });

  it("lets held render-authorized frames block audio motion explicitly", () => {
    const heldFrame = {
      audioMotionAuthority: false,
      energyLedger: {
        projectedRenderEnergy: 0.08,
        renderEnergyEpsilon: 1e-6,
      },
    };

    expect(hasRenderAuthority(heldFrame)).toBe(true);
    expect(allowsAudioMotion(heldFrame)).toBe(false);
  });

  it("allows recoverable capacity-limited descriptors as render authority", () => {
    const capacityLimitedFrame = {
      energyLedger: {
        projectedRenderEnergy: 0.08,
        renderEnergyEpsilon: 1e-6,
      },
      modalDescriptor: {
        fieldAuthority: "capacity-limited",
      },
      sourceEvidence: {
        sourceBoundaryState: "live",
        currentSourceEvidence: true,
      },
    };

    expect(allowsModalDescriptorRenderAuthority(capacityLimitedFrame)).toBe(
      true,
    );
    expect(hasRenderAuthority(capacityLimitedFrame)).toBe(true);
    expect(allowsAudioMotion(capacityLimitedFrame)).toBe(true);
    expect(allowsCurrentLiveRenderFrame(capacityLimitedFrame)).toBe(true);
  });

  it("rejects explicit fatal descriptors as render authority", () => {
    for (const fieldAuthority of ["bandwidth-limited", "blocked"]) {
      const fatalDescriptorFrame = {
        energyLedger: {
          projectedRenderEnergy: 0.08,
          renderEnergyEpsilon: 1e-6,
        },
        modalDescriptor: {
          fieldAuthority,
        },
        sourceEvidence: {
          sourceBoundaryState: "live",
          currentSourceEvidence: true,
        },
      };

      expect(allowsModalDescriptorRenderAuthority(fatalDescriptorFrame)).toBe(
        false,
      );
      expect(hasRenderAuthority(fatalDescriptorFrame)).toBe(false);
      expect(allowsAudioMotion(fatalDescriptorFrame)).toBe(false);
      expect(allowsCurrentLiveRenderFrame(fatalDescriptorFrame)).toBe(false);
    }
  });

  it("does not allow legacy render-shaped fields without the ledger", () => {
    expect(
      hasRenderAuthority({
        fieldState: "active",
        renderAuthority: true,
        hasModalField: true,
        activeModeCount: 1,
      }),
    ).toBe(false);
    expect(hasRenderAuthority({ fieldState: "test" })).toBe(false);
    expect(allowsAudioMotion({ renderAuthority: true })).toBe(false);
  });

  it("does not treat decay as authority by itself", () => {
    expect(hasRenderAuthority({ fieldState: "decay" })).toBe(false);
    expect(allowsAudioMotion({ fieldState: "decay" })).toBe(false);
  });

  it("derives authority from the ledger when explicit authority is absent", () => {
    expect(
      hasRenderAuthority({
        fieldState: "active",
        energyLedger: {
          projectedRenderEnergy: 0.004,
          renderEnergyEpsilon: 1e-6,
        },
      }),
    ).toBe(true);
    expect(
      hasRenderAuthority({
        fieldState: "active",
        energyLedger: {
          projectedRenderEnergy: 1e-6,
          renderEnergyEpsilon: 1e-6,
        },
      }),
    ).toBe(false);
  });

  it("does not derive authority from the projected energy mirror", () => {
    expect(
      hasRenderAuthority({
        fieldState: "active",
        projectedRenderEnergy: 0.004,
      }),
    ).toBe(false);
  });

  it("does not let explicit authority override a closed ledger", () => {
    expect(
      hasRenderAuthority({
        fieldState: "active",
        renderAuthority: true,
        energyLedger: {
          projectedRenderEnergy: 0,
          renderEnergyEpsilon: 1e-6,
        },
      }),
    ).toBe(false);
  });

  it("blocks current live render frames through closed ledger authority", () => {
    expect(
      allowsCurrentLiveRenderFrame({
        fieldState: "active",
        renderAuthority: true,
        energyLedger: {
          projectedRenderEnergy: 0,
          renderEnergyEpsilon: 1e-6,
        },
      }),
    ).toBe(false);
    expect(
      allowsCurrentLiveRenderFrame({
        fieldState: "active",
        renderAuthority: true,
        energyLedger: {
          projectedRenderEnergy: 0.02,
          renderEnergyEpsilon: 1e-6,
        },
        sourceEvidence: {
          sourceBoundaryState: "live",
          currentSourceEvidence: true,
        },
      }),
    ).toBe(true);
  });

  it("requires ledger-backed current source evidence for current live render frames", () => {
    expect(
      allowsCurrentLiveRenderFrame({
        fieldState: "active",
        renderAuthority: true,
      }),
    ).toBe(false);
    expect(
      allowsCurrentLiveRenderFrame({
        fieldState: "active",
        renderAuthority: true,
        energyLedger: {
          projectedRenderEnergy: 0.02,
          renderEnergyEpsilon: 1e-6,
        },
        sourceEvidence: {
          sourceBoundaryState: "muted",
          currentSourceEvidence: false,
        },
      }),
    ).toBe(false);
  });

  it("does not infer authority from stale render-shaped fields", () => {
    const staleFrame = {
      fieldState: "active",
      hasModalField: true,
      activeModeCount: 3,
      modalCoefficientEnergy: 0.4,
      modalResponseRenderEnergy: 0.5,
      observationEnergy: 0.6,
      modalVisibilityEnergy: 0.7,
      modalObserverVisibilityEnergy: 0.8,
      backboneSlots: new Float32Array([3, 4, 6, 0.8]),
      detailSlots: new Float32Array([4, 5, 5, 0.4]),
      modeSlots: new Float32Array([2, 3, 7, 0.5]),
    };

    expect(hasRenderAuthority(staleFrame)).toBe(false);
    expect(allowsAudioMotion(staleFrame)).toBe(false);
  });
});
