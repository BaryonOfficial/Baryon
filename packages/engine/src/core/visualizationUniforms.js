import * as THREE from "three";
import { uniform } from "three/tsl";
import {
  RAYMARCH_DEFAULTS,
  RENDER_DEFAULTS,
  SIMULATION_DEFAULTS,
} from "../defaults.js";
import { FIELD_STATE_VALUES } from "./fieldState.js";
import { getBoundaryModeValue } from "./modeFamily.js";
import {
  deriveObservationTransferParameters,
  HOLOGRAPHIC_BASE_RADIANCE_LIVE_PREVIEW_GAIN,
  REFERENCE_ABSORPTION_COEFFICIENT,
} from "./raymarch/observationTransfer.js";

export function createVisualizationUniforms(parameters) {
  const observationParameters = deriveObservationTransferParameters();

  return {
    uTime: uniform(0.0),
    uAverageAmplitude: uniform(0.0),
    uFieldState: uniform(FIELD_STATE_VALUES.idle),
    uRadius: uniform(parameters.radius),
    uCarrierCoreFwhmWorld: uniform(
      parameters.carrierCoreFwhmWorld ??
        SIMULATION_DEFAULTS.carrierCoreFwhmWorld,
    ),
    uBoundaryMode: uniform(
      getBoundaryModeValue(SIMULATION_DEFAULTS.boundaryMode),
    ),
    uModalFieldModeCount: uniform(0),
    uIdleLogoIntensity: uniform(RENDER_DEFAULTS.idleLogoIntensity),
    uIdleLogoAlpha: uniform(RENDER_DEFAULTS.idleLogoAlpha),
    uIdleLogoSize: uniform(RENDER_DEFAULTS.idleLogoSize),
    uIdleLogoColor: uniform(new THREE.Color(RENDER_DEFAULTS.idleLogoColor)),
    uColor: uniform(new THREE.Color(RENDER_DEFAULTS.volumeColor)),
    uSurfaceColor: uniform(new THREE.Color(RENDER_DEFAULTS.surfaceColor)),
    uSpectralMix: uniform(
      RENDER_DEFAULTS.colorMode === "spectral"
        ? RENDER_DEFAULTS.spectralMix
        : 0,
    ),
    uDensityGain: uniform(RAYMARCH_DEFAULTS.densityGain),
    // Fixed production coefficient. The DEV-only frozen-fixture adapter may
    // override it to replay historical v1 evidence; no public control owns it.
    uMaterialAbsorptionCoefficient: uniform(REFERENCE_ABSORPTION_COEFFICIENT),
    // Checkpoint B starts on an explicit half-stop sweep candidate so the live
    // canvas can be judged. This is not a ceiling or a signed selection; the
    // fixture still owns the zero canary and complete logarithmic sweep.
    uHolographicBaseRadianceGain: uniform(
      HOLOGRAPHIC_BASE_RADIANCE_LIVE_PREVIEW_GAIN,
    ),
    uLaserDeflectionGain: uniform(RAYMARCH_DEFAULTS.laserDeflectionGain),
    uContourSharpness: uniform(RAYMARCH_DEFAULTS.contourSharpness),
    uHolographicIntensity: uniform(RAYMARCH_DEFAULTS.holographicIntensity),
    uHolographicFresnelPower: uniform(
      RAYMARCH_DEFAULTS.holographicFresnelPower,
    ),
    uRaymarchSteps: uniform(RAYMARCH_DEFAULTS.raymarchSteps),
    uBandEnergies: uniform(new THREE.Vector4(0, 0, 0, 0)),
    uTransientEnergy: uniform(0.0),
    uSpectralCentroid: uniform(0.0),
    uSpectralFlux: uniform(0.0),
    uSlicePosition: uniform(0.0),
    uStructureSignal: uniform(0.0),
    uEnergySignal: uniform(0.0),
    uChangeSignal: uniform(0.0),
    uBassSalience: uniform(0.0),
    uTimbreSpread: uniform(0.0),
    uSpectralNovelty: uniform(0.0),
    uBeatPulse: uniform(0.0),
    uBeatPhase: uniform(0.0),
    uTempoNorm: uniform(0.0),
    uRhythmicDensity: uniform(0.0),
    uKeyTint: uniform(new THREE.Color(0x56d7ff)),
    uKeyTintStrength: uniform(0.0),
    uKeyMode: uniform(0.0),
    uTrebleBroadbandEnergy: uniform(0.0),
    uModeCoherence: uniform(0.0),
    uTotalSlotAmplitude: uniform(0.0),
    // RMS pressure amplitude of the represented modal superposition:
    // sqrt(sum(a_m^2)) for unit-mean-square basis functions.
    uModalEnergyAmplitude: uniform(0.0),
    uStructuralProjectionDrive: uniform(0.0),
    uStructuralProjectionConcentration: uniform(0.0),
    // Bounded [0, 1] column-density normalization derived per descriptor
    // commit from the admitted modes' energy-weighted RMS spatial wavenumber.
    uCarrierColumnDensityScale: uniform(1.0),
    uModalResponseEnergy: uniform(0.0),
    uPhaseEvaluationTime: uniform(0.0),
    uPhaseProjectionMix: uniform(0.0),
    uPhaseProjectionStrength: uniform(0.0),
    uLiveFieldCacheActive: uniform(0.0),
    uLaserCausticActive: uniform(0.0),
    uObservationDensityFadeStart: uniform(
      observationParameters.densityFadeStart,
    ),
    uObservationDensityFadeEnd: uniform(observationParameters.densityFadeEnd),
    uObservationTransferGain: uniform(observationParameters.transferGain),
    uObservationDensityFloor: uniform(observationParameters.densityFloor),
    uObservationContourSupportScale: uniform(
      observationParameters.contourSupportScale,
    ),
  };
}
