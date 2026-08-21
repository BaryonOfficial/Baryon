import { normalizePhaseRad } from "./modalPhaseSlots.js";
import { findCredibleSpectralPeaks } from "./spectralEvidence.js";

const DRIVE_PHASE_WINDOW_SAMPLES = 2048;
const DRIVE_PHASE_MIN_WINDOW_SAMPLES = 64;
const HARMONIC_LOCK_MAX_ORDER = 10;
const HARMONIC_LOCK_RELATIVE_TOLERANCE = 0.02;
const DRIVE_PHASE_MAGNITUDE_FLOOR = 1e-4;
const SOURCE_COMPONENT_DETECTION_LIMIT = 16;

/**
 * Build the shared measurement window for per-mode complex drive.
 *
 * All modes are measured on the same window tail, so measured drive phases
 * are mutually consistent within a frame even though the window's absolute
 * position on the audio clock is only known to render-frame accuracy.
 */
export function buildModalDrivePhaseContext({ timeDomainData, sampleRate }) {
  if (
    !(timeDomainData instanceof Float32Array) ||
    timeDomainData.length < DRIVE_PHASE_MIN_WINDOW_SAMPLES ||
    !(sampleRate > 0)
  ) {
    return null;
  }
  const windowLength = Math.min(
    DRIVE_PHASE_WINDOW_SAMPLES,
    timeDomainData.length,
  );
  return {
    samples: timeDomainData,
    start: timeDomainData.length - windowLength,
    windowLength,
    sampleRate,
  };
}

/**
 * Goertzel single-bin DFT at `frequencyHz` over the context window.
 *
 * Returns the complex drive component normalized so a full-scale sine at the
 * probe frequency measures magnitude ≈ 1. Phase is relative to the window
 * start; only within-window phase relationships between modes are
 * timing-jitter-free, which is why locking is harmonic (see below).
 */
export function measureModalComplexDrive(context, frequencyHz) {
  if (
    !context ||
    !(frequencyHz > 0) ||
    frequencyHz >= context.sampleRate / 2
  ) {
    return null;
  }

  const { samples, start, windowLength, sampleRate } = context;
  const omega = (2 * Math.PI * frequencyHz) / sampleRate;
  const cosOmega = Math.cos(omega);
  const sinOmega = Math.sin(omega);
  const coefficient = 2 * cosOmega;
  let s1 = 0;
  let s2 = 0;
  for (let index = 0; index < windowLength; index += 1) {
    const s0 = (samples[start + index] ?? 0) + coefficient * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const normalization = 2 / windowLength;
  const rawRe = (s1 - s2 * cosOmega) * normalization;
  const rawIm = s2 * sinOmega * normalization;
  // Rotate by +ω to reference phase at the window's first sample; the raw
  // recovery is one sample behind.
  const re = rawRe * cosOmega - rawIm * sinOmega;
  const im = rawRe * sinOmega + rawIm * cosOmega;
  return {
    re,
    im,
    magnitude: Math.hypot(re, im),
    phaseRad: Math.atan2(im, re),
  };
}

function resolveHarmonicOrder(frequencyHz, referenceFrequencyHz) {
  if (!(frequencyHz > 0) || !(referenceFrequencyHz > 0)) {
    return 0;
  }
  const ratio = frequencyHz / referenceFrequencyHz;
  const harmonicOrder = Math.round(ratio);
  return harmonicOrder >= 1 &&
    harmonicOrder <= HARMONIC_LOCK_MAX_ORDER &&
    Math.abs(ratio - harmonicOrder) <=
      HARMONIC_LOCK_RELATIVE_TOLERANCE * harmonicOrder
    ? harmonicOrder
    : 0;
}

/**
 * Measure the credible temporal components present in the source.
 *
 * A component carries source frequency and phase evidence only. Cavity
 * eigenfrequency, Q, damping, and transfer remain mode metadata and are
 * applied later by the modal-response owner.
 */
export function resolveCredibleSourceDriveComponents({
  fftLinearAmplitudes,
  timeDomainData,
  sampleRate,
}) {
  const phaseContext = buildModalDrivePhaseContext({
    timeDomainData,
    sampleRate,
  });
  if (!phaseContext) {
    return [];
  }
  const sourceComponents = findCredibleSpectralPeaks(
    fftLinearAmplitudes,
    sampleRate,
    SOURCE_COMPONENT_DETECTION_LIMIT,
  );
  const measuredComponents = [];
  for (const component of sourceComponents) {
    const frequencyHz = component?.frequency ?? 0;
    const measurement = measureModalComplexDrive(phaseContext, frequencyHz);
    if (!(measurement?.magnitude > DRIVE_PHASE_MAGNITUDE_FLOOR)) {
      continue;
    }
    measuredComponents.push({
      frequencyHz,
      sourceAmplitude: Math.max(0, component?.amplitude ?? 0),
      sourceEnergy: Math.max(0, component?.amplitude ?? 0) ** 2,
      magnitude: measurement.magnitude,
      phaseRad: measurement.phaseRad,
    });
  }
  if (measuredComponents.length === 0) {
    return [];
  }

  measuredComponents.sort(
    (left, right) =>
      right.sourceEnergy - left.sourceEnergy ||
      right.magnitude - left.magnitude ||
      left.frequencyHz - right.frequencyHz,
  );
  const reference = measuredComponents[0];

  return measuredComponents.map((component) => {
    const harmonicOrder = resolveHarmonicOrder(
      component.frequencyHz,
      reference.frequencyHz,
    );
    return {
      ...component,
      harmonicOrder,
      // The common source carrier is a rotating-frame gauge and is removed.
      // Harmonic relative phase is shift-invariant and therefore remains
      // physically observable. An inharmonic component starts a separate
      // carrier group with an arbitrary zero phase rather than borrowing a
      // cavity eigenfrequency.
      lockedPhaseRad:
        harmonicOrder > 0
          ? normalizePhaseRad(
              component.phaseRad - harmonicOrder * reference.phaseRad,
            )
          : 0,
      referenceFrequencyHz: reference.frequencyHz,
      drivenAngularVelocityRadPerSec: 2 * Math.PI * component.frequencyHz,
    };
  });
}

function resolveDrivePhaseReference(measurements) {
  let reference = null;
  for (const measurement of measurements) {
    if (!(measurement?.magnitude > DRIVE_PHASE_MAGNITUDE_FLOOR)) {
      continue;
    }
    const strength = measurement.magnitude * (measurement.driveWeight ?? 1);
    if (!reference || strength > reference.strength) {
      reference = { ...measurement, strength };
    }
  }
  return reference;
}

/**
 * Resolve harmonic drive-phase locks against the strongest driven mode.
 *
 * For modes whose frequency is a near-integer multiple n of the reference,
 * the invariant `θ_m − n·θ_ref` is independent of the window's absolute
 * position in time (a time shift δ adds ω_m·δ − n·ω_ref·δ = 0), so it is
 * immune to render-clock jitter and encodes the true relative harmonic
 * phases of the source waveform. Non-harmonic modes get no lock and keep
 * free-running envelope phase.
 *
 * @param {Array<{modeKey: string, frequencyHz: number, driveWeight?: number,
 *   magnitude: number, phaseRad: number}>} measurements
 * @returns {Map<string, {harmonicOrder: number, lockedPhaseRad: number,
 *   referenceFrequencyHz: number, drivenAngularVelocityRadPerSec: number}>}
 */
export function resolveHarmonicDrivePhaseLocks(measurements) {
  const locks = new Map();
  if (!Array.isArray(measurements) || measurements.length === 0) {
    return locks;
  }
  const reference = resolveDrivePhaseReference(measurements);
  if (!reference) {
    return locks;
  }

  for (const measurement of measurements) {
    if (!(measurement?.magnitude > DRIVE_PHASE_MAGNITUDE_FLOOR)) {
      continue;
    }
    const harmonicOrder = resolveHarmonicOrder(
      measurement.frequencyHz,
      reference.frequencyHz,
    );
    if (harmonicOrder === 0) {
      continue;
    }
    locks.set(measurement.modeKey, {
      harmonicOrder,
      lockedPhaseRad: normalizePhaseRad(
        measurement.phaseRad - harmonicOrder * reference.phaseRad,
      ),
      referenceFrequencyHz: reference.frequencyHz,
      drivenAngularVelocityRadPerSec:
        2 * Math.PI * harmonicOrder * reference.frequencyHz,
    });
  }
  return locks;
}
