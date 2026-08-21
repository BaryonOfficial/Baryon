import { CAVITY_ACOUSTIC_DEFAULTS } from "../../defaults.js";

const INTRINSIC_QUALITY_REFERENCE_HZ = 100;

export const MIN_MODAL_QUALITY_FACTOR = 0.5;
export const MAX_MODAL_QUALITY_FACTOR = 50000;

function readAcousticScale(value) {
  return value?.acousticScale && typeof value.acousticScale === "object"
    ? value.acousticScale
    : value;
}

/**
 * Normalize optional boundary input into the one declared damping apparatus.
 * Core response code receives explicit Q and never performs this translation.
 */
export function resolveModalDampingApparatus(cavityAcousticScale) {
  const acousticScale = readAcousticScale(cavityAcousticScale);
  const modalIntrinsicQualityFactorAt100Hz =
    Number.isFinite(acousticScale?.modalIntrinsicQualityFactorAt100Hz) &&
    acousticScale.modalIntrinsicQualityFactorAt100Hz > 0
      ? acousticScale.modalIntrinsicQualityFactorAt100Hz
      : CAVITY_ACOUSTIC_DEFAULTS.modalIntrinsicQualityFactorAt100Hz;
  const modalLoadLinewidthHz =
    Number.isFinite(acousticScale?.modalLoadLinewidthHz) &&
    acousticScale.modalLoadLinewidthHz > 0
      ? acousticScale.modalLoadLinewidthHz
      : CAVITY_ACOUSTIC_DEFAULTS.modalLoadLinewidthHz;

  return {
    modalIntrinsicQualityFactorAt100Hz,
    modalLoadLinewidthHz,
  };
}

/**
 * Loaded Q from the declared intrinsic and transducer/load loss channels.
 * Independent dissipative channels add rates:
 * 1/Q_loaded = 1/Q_intrinsic + 1/Q_load.
 */
export function computeLoadedModalQualityFactor({
  naturalFrequencyHz,
  modalIntrinsicQualityFactorAt100Hz,
  modalLoadLinewidthHz,
}) {
  if (!(Number.isFinite(naturalFrequencyHz) && naturalFrequencyHz > 0)) {
    throw new TypeError("Modal damping requires a positive natural frequency");
  }
  if (
    !(
      Number.isFinite(modalIntrinsicQualityFactorAt100Hz) &&
      modalIntrinsicQualityFactorAt100Hz > 0
    )
  ) {
    throw new TypeError(
      "Modal damping requires the declared intrinsic quality factor",
    );
  }
  if (!(Number.isFinite(modalLoadLinewidthHz) && modalLoadLinewidthHz > 0)) {
    throw new TypeError("Modal damping requires the declared load linewidth");
  }

  const intrinsicQualityFactor = Math.max(
    MIN_MODAL_QUALITY_FACTOR,
    modalIntrinsicQualityFactorAt100Hz *
      Math.sqrt(naturalFrequencyHz / INTRINSIC_QUALITY_REFERENCE_HZ),
  );
  const loadQualityFactor = Math.max(
    MIN_MODAL_QUALITY_FACTOR,
    naturalFrequencyHz / modalLoadLinewidthHz,
  );
  return Math.min(
    MAX_MODAL_QUALITY_FACTOR,
    Math.max(
      MIN_MODAL_QUALITY_FACTOR,
      1 / (1 / intrinsicQualityFactor + 1 / loadQualityFactor),
    ),
  );
}

export function requireModalQualityFactor(value, subject) {
  if (!(Number.isFinite(value) && value > 0)) {
    throw new TypeError(
      `${subject ?? "Modal mode"} must declare an apparatus-derived Q`,
    );
  }
  return Math.min(
    MAX_MODAL_QUALITY_FACTOR,
    Math.max(MIN_MODAL_QUALITY_FACTOR, value),
  );
}
