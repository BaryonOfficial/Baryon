const HIGH_Q_OBSERVER_HARMONIC_DRIVER_MIN_HZ = 140;
const HIGH_Q_OBSERVER_HARMONIC_DRIVER_MAX_HZ = 480;
const HIGH_Q_OBSERVER_BASS_HARMONIC_DRIVER_MIN_HZ = 72;
const HIGH_Q_OBSERVER_BASS_HARMONIC_DRIVER_MAX_HZ = 105;
const HIGH_Q_OBSERVER_BASS_HARMONIC_DRIVER_MIN_SUPPORT = 0.002;
const HIGH_Q_OBSERVER_NOISE_WINDOW_BINS = 9;
const HIGH_Q_OBSERVER_COHERENT_BACKGROUND_DRIVE_START = 0.00012;
const HIGH_Q_OBSERVER_COHERENT_BACKGROUND_DRIVE_FULL = 0.0009;
const HIGH_Q_OBSERVER_COHERENT_BACKGROUND_MIN_PERIODICITY = 0.68;
const HIGH_Q_OBSERVER_COHERENT_BACKGROUND_MIN_TONALNESS = 0.58;
const HIGH_Q_OBSERVER_COHERENT_BACKGROUND_MAX_DISTRIBUTION = 0.18;
const RESONANT_COUPLING_MIN_HARMONIC = 2;
const RESONANT_COUPLING_MAX_HARMONIC = 64;
const RESONANT_COUPLING_MODE_HARMONIC_TOLERANCE = 0.22;

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function isHighQHarmonicDriverFrequency(
  frequencyHz,
  spectralSupport = 1,
  allowBassDriver = true,
) {
  return (
    (frequencyHz >= HIGH_Q_OBSERVER_HARMONIC_DRIVER_MIN_HZ &&
      frequencyHz <= HIGH_Q_OBSERVER_HARMONIC_DRIVER_MAX_HZ) ||
    (allowBassDriver &&
      frequencyHz >= HIGH_Q_OBSERVER_BASS_HARMONIC_DRIVER_MIN_HZ &&
      frequencyHz <= HIGH_Q_OBSERVER_BASS_HARMONIC_DRIVER_MAX_HZ &&
      spectralSupport >= HIGH_Q_OBSERVER_BASS_HARMONIC_DRIVER_MIN_SUPPORT)
  );
}

export function classifyObservedModeRenderLayer({
  atlasEntry,
  observedSnr,
  observerCoherence,
  retainedEnergy,
  observedDrive,
  dominantDriveFrequencyHz,
  dominantDriveSpectralSupport,
  allowBassHarmonicDriver,
  highQResonantMinRetainedEnergy,
  lowQObserverSnrStart,
  lowQObserverMinObservedDrive,
}) {
  if ((atlasEntry?.renderLayer ?? atlasEntry?.layer ?? "resonant") === "resonant") {
    return "resonant";
  }

  const retained = clamp01(retainedEnergy);
  const drive = clamp01(observedDrive);
  const coherence = clamp01(observerCoherence);
  const snr = Math.max(0, observedSnr ?? 0);
  const harmonicDriver = isHighQHarmonicDriverFrequency(
    dominantDriveFrequencyHz,
    dominantDriveSpectralSupport,
    allowBassHarmonicDriver,
  );
  const retainedResonatorEvidence =
    harmonicDriver &&
    (atlasEntry?.naturalFrequencyHz ?? 0) >= 160 &&
    (atlasEntry?.naturalFrequencyHz ?? Infinity) <=
      HIGH_Q_OBSERVER_HARMONIC_DRIVER_MAX_HZ &&
    retained >= highQResonantMinRetainedEnergy &&
    coherence >= 0.52 &&
    (snr >= lowQObserverSnrStart || drive >= lowQObserverMinObservedDrive);

  return retainedResonatorEvidence ? "resonant" : "source-coupled";
}

export function computeModalObserverNoiseFloor({
  fftMagnitudes,
  sampleRate,
  frequencyHz,
  profile,
}) {
  if (
    !(fftMagnitudes instanceof Float32Array) ||
    fftMagnitudes.length === 0 ||
    frequencyHz <= 0
  ) {
    return 0;
  }

  const nyquist = sampleRate * 0.5;
  const centerBin = Math.max(
    1,
    Math.min(
      fftMagnitudes.length - 1,
      Math.round((frequencyHz / nyquist) * fftMagnitudes.length),
    ),
  );
  const noiseWindowBins =
    profile?.noiseWindowBins ?? HIGH_Q_OBSERVER_NOISE_WINDOW_BINS;
  const startBin = Math.max(1, centerBin - noiseWindowBins);
  const endBin = Math.min(
    fftMagnitudes.length - 1,
    centerBin + noiseWindowBins,
  );
  const samples = [];

  for (let index = startBin; index <= endBin; index += 1) {
    if (Math.abs(index - centerBin) <= 1) {
      continue;
    }
    samples.push(fftMagnitudes[index] ?? 0);
  }

  if (samples.length === 0) {
    return 0;
  }

  samples.sort((left, right) => left - right);
  const median = samples[Math.floor(samples.length * 0.5)] ?? 0;
  const upperQuartile = samples[Math.floor(samples.length * 0.75)] ?? median;
  return clamp01((median + upperQuartile) * 0.5);
}

export function computeModalObservation({
  atlasEntry,
  response,
  spectralSupport,
  localNoiseFloor,
  drivePeak,
  periodicity,
  tonalness,
  distributedExcitation,
  dominantDriveFrequencyHz,
  dominantDriveSpectralSupport,
  allowBassHarmonicDriver,
  avgAmplitude,
  analyserRms,
  driveSource,
  sourceMode,
  profile,
}) {
  if (
    atlasEntry?.layer === "source-coupled" &&
    sourceMode !== "live" &&
    driveSource === "spectral-fallback" &&
    avgAmplitude < 10 &&
    analyserRms < 0.025
  ) {
    return {
      observedDrive: 0,
      observedEnergy: 0,
      observedSnr: 0,
      observerCoherence: 0,
    };
  }
  if (
    atlasEntry?.layer === "source-coupled" &&
    distributedExcitation > 0.5 &&
    tonalness < 0.58
  ) {
    return {
      observedDrive: 0,
      observedEnergy: 0,
      observedSnr: 0,
      observerCoherence: 0,
    };
  }
  const spectralExcess = Math.max(0, spectralSupport - localNoiseFloor);
  const observedSnr =
    spectralSupport > 0
      ? spectralSupport / Math.max(localNoiseFloor, 0.0005)
      : 0;
  const responseGate = smoothstep(
    profile.responseStart,
    profile.responseFull,
    response?.magnitude ?? 0,
  );
  const peakGate = smoothstep(
    profile.drivePeakStart,
    profile.drivePeakFull,
    drivePeak,
  );
  const spectralGate =
    smoothstep(
      profile.spectralExcessStart,
      profile.spectralExcessFull,
      spectralExcess,
    ) * smoothstep(profile.snrStart, profile.snrFull, observedSnr);
  const periodicityGate = smoothstep(
    profile.periodicityStart,
    profile.periodicityFull,
    periodicity,
  );
  const tonalGate = smoothstep(
    profile.tonalnessStart,
    profile.tonalnessFull,
    tonalness,
  );
  const timeDomainOnlyGate =
    spectralSupport <= 0 && localNoiseFloor <= 0 ? periodicityGate : 0;
  const sparseGate =
    1 -
    smoothstep(
      profile.distributionStart,
      profile.distributionFull,
      distributedExcitation,
    );
  const tonalEvidence = Math.max(tonalGate, timeDomainOnlyGate * 0.85);
  const sparseEvidence = Math.max(
    sparseGate,
    timeDomainOnlyGate * 0.8,
    profile.sparseEvidenceFloor ?? 0,
  );
  const matchedTimeDomainDrive = responseGate * peakGate;
  const coherentBackgroundDriveGate =
    atlasEntry?.layer === "resonant" &&
    isHighQHarmonicDriverFrequency(
      dominantDriveFrequencyHz,
      dominantDriveSpectralSupport,
      allowBassHarmonicDriver,
    ) &&
    periodicity >= HIGH_Q_OBSERVER_COHERENT_BACKGROUND_MIN_PERIODICITY &&
    tonalness >= HIGH_Q_OBSERVER_COHERENT_BACKGROUND_MIN_TONALNESS &&
    distributedExcitation <=
      HIGH_Q_OBSERVER_COHERENT_BACKGROUND_MAX_DISTRIBUTION
      ? smoothstep(
          HIGH_Q_OBSERVER_COHERENT_BACKGROUND_DRIVE_START,
          HIGH_Q_OBSERVER_COHERENT_BACKGROUND_DRIVE_FULL,
          drivePeak,
        )
      : 0;
  const harmonicGate =
    atlasEntry?.layer === "resonant" &&
    isHighQHarmonicDriverFrequency(
      dominantDriveFrequencyHz,
      dominantDriveSpectralSupport,
      allowBassHarmonicDriver,
    )
      ? getResonantHarmonicCoupling(
          atlasEntry.naturalFrequencyHz,
          dominantDriveFrequencyHz,
        ) *
        Math.max(peakGate, coherentBackgroundDriveGate) *
        periodicityGate
      : 0;
  const observerCoherence = clamp01(
    periodicityGate * tonalEvidence * sparseEvidence,
  );
  const observedDrive = clamp01(
    Math.max(matchedTimeDomainDrive, spectralGate, harmonicGate * 0.46) *
      observerCoherence *
      (0.45 + (atlasEntry?.driveWeight ?? 0) * 0.55),
  );

  return {
    observedDrive,
    observedEnergy: clamp01(observedDrive * profile.energyGain),
    observedSnr,
    observerCoherence,
  };
}

export function getResonantHarmonicCoupling(
  naturalFrequencyHz,
  dominantFrequencyHz,
) {
  if (naturalFrequencyHz <= 0 || dominantFrequencyHz <= 0) {
    return 0;
  }

  const harmonic = naturalFrequencyHz / dominantFrequencyHz;
  const nearestHarmonic = Math.round(harmonic);
  if (
    nearestHarmonic < RESONANT_COUPLING_MIN_HARMONIC ||
    nearestHarmonic > RESONANT_COUPLING_MAX_HARMONIC
  ) {
    return 0;
  }

  const relativeError = Math.abs(harmonic - nearestHarmonic) / nearestHarmonic;
  return clamp01(1 - relativeError / RESONANT_COUPLING_MODE_HARMONIC_TOLERANCE);
}
