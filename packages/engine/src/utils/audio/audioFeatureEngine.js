import {
  buildAnalysisSessionKey,
  buildAnalysisSourceKey,
} from "./analysisSession.js";
import {
  createAudioFeaturePacketJoiner,
  createBoundedAudioInputTransport,
} from "./audioFeaturePackets.js";
import { normalizeAudioFeatureRuntimeSettings } from "./audioFeatureEngineShared.js";
import {
  AUDIO_SOURCE_KINDS,
  isPreparedFileAwaitingPlayback,
} from "../../core/audio/audioSourceSession.js";
import { hasPreparationAuthority } from "../../core/renderAuthorityContract.js";

export {
  DEFAULT_AUDIO_FEATURE_RUNTIME_SETTINGS,
  normalizeAudioFeatureRuntimeSettings,
} from "./audioFeatureEngineShared.js";

export const AUDIO_FEATURE_AUTHORITY_ROLES = Object.freeze({
  localProducer: "local-producer",
  externalConsumer: "external-consumer",
});

const VALID_AUTHORITY_ROLES = new Set(
  Object.values(AUDIO_FEATURE_AUTHORITY_ROLES),
);

function getRuntimeNow() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function stableSerialize(value) {
  if (!value || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`)
    .join(",")}}`;
}

function normalizeRuntimeConfiguration(config = {}) {
  return Object.freeze({
    radius: Number.isFinite(config.radius) ? config.radius : 1,
    cavityAcousticScale: config.cavityAcousticScale
      ? { ...config.cavityAcousticScale }
      : null,
    boundaryMode: config.boundaryMode ?? null,
    cavityGeometry: config.cavityGeometry ?? null,
    auditSettings: config.auditSettings ? { ...config.auditSettings } : null,
    beatSettings: config.beatSettings ? { ...config.beatSettings } : null,
    liveInputAnalysisSettings: config.liveInputAnalysisSettings
      ? { ...config.liveInputAnalysisSettings }
      : null,
  });
}

function isActiveSource(status, configuration) {
  const ownsPreparedFile =
    status?.sourceSession?.kind === AUDIO_SOURCE_KINDS.file &&
    status?.hasPreparedFileAnalysisSource === true;
  return Boolean(
    status?.isPlaying ||
    status?.isLiveInputActive ||
    ownsPreparedFile ||
    configuration?.auditSettings?.injectTestTone,
  );
}

function isExplicitPausedFile(status) {
  return status?.isPlaybackPaused === true;
}

function shouldRetainFileModel(status) {
  return (
    status?.sourceSession?.kind === AUDIO_SOURCE_KINDS.file &&
    status?.isLiveInputActive !== true
  );
}

function hasPreparedFeatureModel(model) {
  if (!model?.topology || !model?.drive) {
    return false;
  }
  return hasPreparationAuthority({
    ...model.drive.renderState,
    modalDescriptor: model.topology.modalDescriptor,
  });
}

function hasCurrentPlaybackEndReason(status, reason) {
  const playbackSessionId = status?.playbackSessionId;
  return (
    playbackSessionId != null &&
    status?.lastPlaybackEndReason === reason &&
    status?.lastPlaybackDiagnostics?.playbackSessionId === playbackSessionId
  );
}

function hasPlaybackEndSupersedingSource(status, configuration) {
  return Boolean(
    status?.isPlaying ||
    status?.isLiveInputActive ||
    configuration?.auditSettings?.injectTestTone,
  );
}

function captureFastPayloadShape(payload, fallbackFftSize) {
  const fftSize = Math.max(
    2,
    Math.floor(payload?.timeData?.length ?? fallbackFftSize ?? 2048),
  );
  const spectrumSize = Math.max(
    1,
    Math.floor(payload?.fftLinearAmplitudes?.length ?? fftSize / 2),
  );
  return {
    sourceMode: payload?.sourceMode ?? "file",
    fftSize,
    spectrumSize,
  };
}

function createZeroFastPayload(shape) {
  return {
    sourceMode: shape?.sourceMode ?? "file",
    avgAmplitude: 0,
    rms: 0,
    spectralCentroid: 0,
    spectralFlux: 0,
    fftLinearAmplitudes: new Float32Array(shape?.spectrumSize ?? 1024),
    timeData: new Float32Array(shape?.fftSize ?? 2048),
  };
}

function createInitialStatus() {
  return {
    state: "idle",
    reason: "not-started",
    authorityRole: AUDIO_FEATURE_AUTHORITY_ROLES.localProducer,
    sourceGeneration: 1,
    workerGeneration: 0,
    topologyRevision: 0,
    latestAcceptedFrameId: 0,
    latestDriveCaptureTimestampMs: null,
    latestDriveProcessingTimestampMs: null,
    latestDriveAgeMs: null,
    latestDriveStale: false,
    latestObservationTimeSeconds: null,
    latestCaptureRms: null,
    naturalRingdownActive: false,
    naturalRingdownSessionId: null,
    renderAuthorityRevoked: false,
    workerRestartCount: 0,
    sourceBootstrapCount: 0,
    configurationReplayCount: 0,
    queueDepth: 0,
    inputReplacementCount: 0,
    rejectedPacketCount: 0,
    staleAcknowledgementCount: 0,
    staleWorkerStatusCount: 0,
  };
}

/**
 * Single owner for audio-feature cadence, worker lifecycle, bounded input
 * transport, packet joining, source generations, and stale-drive authority.
 */
export function createAudioFeatureRuntime(settings = {}, dependencies = {}) {
  const normalizedSettings = normalizeAudioFeatureRuntimeSettings(settings);
  const audioSession = dependencies.audioSession ?? null;
  const now = dependencies.now ?? getRuntimeNow;
  const schedule =
    dependencies.schedule ??
    ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
  const cancel =
    dependencies.cancel ?? ((handle) => globalThis.clearTimeout(handle));
  const workerFactory =
    dependencies.createWorker ??
    (() =>
      new Worker(new URL("./audioFeatureEngine.worker.js", import.meta.url), {
        type: "module",
      }));

  let disposed = false;
  let started = false;
  let worker = null;
  let schedulerHandle = null;
  let sourceGeneration = 1;
  let workerGeneration = 0;
  let authorityRole = AUDIO_FEATURE_AUTHORITY_ROLES.localProducer;
  let configuration = normalizeRuntimeConfiguration();
  let configurationSignature = stableSerialize(configuration);
  let forceStructuralCapture = true;
  let capturePreparedPausedFile = false;
  let lastStructuralCaptureAtMs = Number.NEGATIVE_INFINITY;
  let lastSourceSessionKey = null;
  let lastAcceptedDriveAtMs = null;
  let workerAdvancementGraceStartedAtMs = null;
  let workerStartedAtMs = null;
  let workerCreationFailedAtMs = null;
  let restartedForSourceGeneration = false;
  let workerCreationAttemptedForSourceGeneration = false;
  let lastSourceStatus = null;
  let lastFastPayloadShape = null;
  let lastCaptureTimestampMs = null;
  let lastObservationTimeSeconds = null;
  let naturalRingdownState = null;
  let lastCompletedNaturalRingdownSessionId = null;
  // Worker generations are replaceable implementation state. Preserve the
  // immutable file model until the owning source generation actually changes.
  let retainedFileModel = null;
  let status = createInitialStatus();

  const joiner = createAudioFeaturePacketJoiner({
    sourceGeneration,
    workerGeneration,
  });
  let transport = null;

  const updateStatus = (patch) => {
    status = { ...status, ...patch };
  };

  const retainPublishedFileModel = (result) => {
    if (result.published && shouldRetainFileModel(lastSourceStatus)) {
      retainedFileModel = result.model;
    }
  };

  const isAcousticStateAdvancing = () =>
    naturalRingdownState != null ||
    isActiveSource(lastSourceStatus, configuration);

  const postWorkerMessage = (message) => {
    if (!worker) {
      return;
    }
    worker.postMessage(message);
  };

  const createTransport = () =>
    createBoundedAudioInputTransport({
      sourceGeneration,
      workerGeneration,
      send(frame) {
        // The analyser owns and reuses its capture buffers. Structured clone
        // preserves that ownership; transferring here would detach the audio
        // session's synchronized taps and force a fresh allocation next tick.
        postWorkerMessage({ type: "analysis-input", frame });
      },
    });

  const syncGenerationOwners = () => {
    joiner.setGenerations(sourceGeneration, workerGeneration);
    transport = createTransport();
    updateStatus({
      sourceGeneration,
      workerGeneration,
      topologyRevision: 0,
      latestAcceptedFrameId: 0,
      latestDriveAgeMs: null,
      latestDriveStale: false,
      renderAuthorityRevoked: false,
      queueDepth: 0,
    });
  };

  const sendInit = ({ replayConfiguration = false } = {}) => {
    postWorkerMessage({
      type: "init",
      settings: normalizedSettings,
      sourceGeneration,
      workerGeneration,
      configuration,
    });
    if (replayConfiguration) {
      updateStatus({
        configurationReplayCount: status.configurationReplayCount + 1,
      });
    }
  };

  const advanceSourceGeneration = (
    reason,
    {
      preserveCompletedNaturalRingdownSession = false,
      renderAuthorityRevoked = false,
    } = {},
  ) => {
    naturalRingdownState = null;
    if (!preserveCompletedNaturalRingdownSession) {
      lastCompletedNaturalRingdownSessionId = null;
    }
    sourceGeneration += 1;
    restartedForSourceGeneration = false;
    workerCreationAttemptedForSourceGeneration = false;
    forceStructuralCapture = true;
    lastStructuralCaptureAtMs = Number.NEGATIVE_INFINITY;
    lastAcceptedDriveAtMs = null;
    retainedFileModel = null;
    workerAdvancementGraceStartedAtMs = null;
    workerCreationFailedAtMs = null;
    syncGenerationOwners();
    sendInit();
    updateStatus({
      reason,
      naturalRingdownActive: false,
      naturalRingdownSessionId: null,
      renderAuthorityRevoked,
      sourceBootstrapCount: status.sourceBootstrapCount + 1,
    });
  };

  const completeNaturalPlayback = (
    reason,
    playbackSessionId = naturalRingdownState?.playbackSessionId,
  ) => {
    lastCompletedNaturalRingdownSessionId =
      playbackSessionId ?? lastCompletedNaturalRingdownSessionId;
    advanceSourceGeneration(reason, {
      preserveCompletedNaturalRingdownSession: true,
      renderAuthorityRevoked: true,
    });
  };

  const cancelNaturalRingdown = (reason) => {
    naturalRingdownState = null;
    updateStatus({
      naturalRingdownActive: false,
      naturalRingdownSessionId: null,
      reason,
    });
  };

  const handleWorkerMessage = (event) => {
    const payload = event?.data ?? {};
    if (payload.type === "analysis-input-ack") {
      transport?.acknowledge(payload);
      const transportStatus = transport?.getStatus();
      updateStatus({
        queueDepth: transportStatus?.queueDepth ?? 0,
        inputReplacementCount: transportStatus?.replacementCount ?? 0,
        staleAcknowledgementCount:
          transportStatus?.staleAcknowledgementCount ?? 0,
      });
      return;
    }
    if (payload.type === "status") {
      const workerStatus = payload.status ?? {};
      if (
        workerStatus.sourceGeneration !== sourceGeneration ||
        workerStatus.workerGeneration !== workerGeneration
      ) {
        updateStatus({
          staleWorkerStatusCount: status.staleWorkerStatusCount + 1,
        });
        return;
      }
      updateStatus(workerStatus);
      return;
    }
    if (payload.type === "topology-packet") {
      const result = joiner.acceptTopology(payload.packet);
      const joinStatus = joiner.getStatus();
      const publishedDrive = result.published ? result.model?.drive : null;
      retainPublishedFileModel(result);
      updateStatus({
        topologyRevision: joinStatus.topologyRevision,
        latestAcceptedFrameId: joinStatus.latestAcceptedFrameId,
        latestDriveCaptureTimestampMs:
          publishedDrive?.captureTimestampMs ??
          status.latestDriveCaptureTimestampMs,
        latestDriveProcessingTimestampMs:
          publishedDrive?.processingTimestampMs ??
          status.latestDriveProcessingTimestampMs,
        rejectedPacketCount: joinStatus.rejectedPacketCount,
        state: result.accepted ? "ready" : status.state,
        reason: result.reason,
        renderAuthorityRevoked: result.published
          ? false
          : status.renderAuthorityRevoked,
        latestDriveStale: result.published ? false : status.latestDriveStale,
      });
      if (result.published) {
        lastAcceptedDriveAtMs = now();
        workerAdvancementGraceStartedAtMs = null;
      }
      if (
        result.published &&
        naturalRingdownState &&
        publishedDrive?.renderState?.renderAuthority !== true
      ) {
        completeNaturalPlayback("natural-ringdown-complete");
      }
      return;
    }
    if (payload.type === "drive-packet") {
      const result = joiner.acceptDrive(payload.packet);
      const joinStatus = joiner.getStatus();
      retainPublishedFileModel(result);
      if (result.published) {
        lastAcceptedDriveAtMs = now();
        workerAdvancementGraceStartedAtMs = null;
      }
      updateStatus({
        state: result.accepted ? "ready" : status.state,
        reason: result.reason,
        topologyRevision: joinStatus.topologyRevision,
        latestAcceptedFrameId: joinStatus.latestAcceptedFrameId,
        latestDriveCaptureTimestampMs: result.published
          ? payload.packet.captureTimestampMs
          : status.latestDriveCaptureTimestampMs,
        latestDriveProcessingTimestampMs: result.published
          ? payload.packet.processingTimestampMs
          : status.latestDriveProcessingTimestampMs,
        rejectedPacketCount: joinStatus.rejectedPacketCount,
        renderAuthorityRevoked: result.published
          ? false
          : status.renderAuthorityRevoked,
        latestDriveStale: result.published ? false : status.latestDriveStale,
      });
      if (
        result.published &&
        naturalRingdownState &&
        payload.packet?.renderState?.renderAuthority !== true
      ) {
        completeNaturalPlayback("natural-ringdown-complete");
      }
    }
  };

  const stopWorker = () => {
    if (!worker) {
      return;
    }
    worker.removeEventListener?.("message", handleWorkerMessage);
    worker.removeEventListener?.("error", handleWorkerError);
    worker.terminate?.();
    worker = null;
    workerStartedAtMs = null;
  };

  const handleWorkerError = () => {
    if (authorityRole !== AUDIO_FEATURE_AUTHORITY_ROLES.localProducer) {
      stopWorker();
      updateStatus({ state: "suspended", reason: "worker-error-suspended" });
      return;
    }
    restartWorker("worker-error");
  };

  const restartWorker = (reason) => {
    if (
      restartedForSourceGeneration ||
      disposed ||
      !started ||
      authorityRole !== AUDIO_FEATURE_AUTHORITY_ROLES.localProducer
    ) {
      return false;
    }
    restartedForSourceGeneration = true;
    workerCreationAttemptedForSourceGeneration = true;
    stopWorker();
    workerGeneration += 1;
    syncGenerationOwners();
    try {
      worker = workerFactory();
    } catch (error) {
      workerCreationFailedAtMs = now();
      updateStatus({
        state: "failed",
        reason: "worker-create-failed",
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
    worker.addEventListener?.("message", handleWorkerMessage);
    worker.addEventListener?.("error", handleWorkerError);
    workerStartedAtMs = now();
    workerCreationFailedAtMs = null;
    forceStructuralCapture = true;
    sendInit({ replayConfiguration: true });
    updateStatus({
      state: "loading",
      reason,
      workerRestartCount: status.workerRestartCount + 1,
    });
    return true;
  };

  const ensureWorker = () => {
    if (worker || normalizedSettings.runtime !== "worker") {
      return Boolean(worker);
    }
    if (workerCreationAttemptedForSourceGeneration) {
      return false;
    }
    workerCreationAttemptedForSourceGeneration = true;
    workerGeneration += 1;
    syncGenerationOwners();
    try {
      worker = workerFactory();
    } catch (error) {
      workerCreationFailedAtMs = now();
      updateStatus({
        state: "failed",
        reason: "worker-create-failed",
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
    worker.addEventListener?.("message", handleWorkerMessage);
    worker.addEventListener?.("error", handleWorkerError);
    workerStartedAtMs = now();
    workerCreationFailedAtMs = null;
    sendInit();
    updateStatus({ state: "loading", reason: "worker-started" });
    return true;
  };

  const maybeRestartStalledWorker = (currentTimeMs) => {
    if (!isAcousticStateAdvancing() || isExplicitPausedFile(lastSourceStatus)) {
      return false;
    }
    const advancementAnchor =
      workerAdvancementGraceStartedAtMs ??
      lastAcceptedDriveAtMs ??
      workerStartedAtMs ??
      workerCreationFailedAtMs;
    if (
      Number.isFinite(advancementAnchor) &&
      currentTimeMs - advancementAnchor >=
        normalizedSettings.workerRestartTimeoutMs
    ) {
      return restartWorker("worker-advancement-timeout");
    }
    return false;
  };

  const captureOnce = () => {
    if (
      disposed ||
      !started ||
      authorityRole !== AUDIO_FEATURE_AUTHORITY_ROLES.localProducer
    ) {
      return;
    }

    const currentTimeMs = now();
    const audioStatus = audioSession?.getStatus?.() ?? {};
    const previousAudioStatus = lastSourceStatus;
    if (
      isPreparedFileAwaitingPlayback(previousAudioStatus) &&
      audioStatus?.isPlaying === true
    ) {
      // A static prepared file can legitimately hold longer than the worker
      // advancement timeout. Give the existing worker one live cadence window
      // before liveness checks. The prepared topology also satisfies the first
      // structural cadence; playback can begin on the fast lane alone.
      workerAdvancementGraceStartedAtMs = currentTimeMs;
      lastStructuralCaptureAtMs = currentTimeMs;
    }
    const playbackEndSuperseded = hasPlaybackEndSupersedingSource(
      audioStatus,
      configuration,
    );
    const naturalCompletion =
      !playbackEndSuperseded &&
      hasCurrentPlaybackEndReason(audioStatus, "natural");
    const explicitStop =
      !playbackEndSuperseded &&
      hasCurrentPlaybackEndReason(audioStatus, "stopped");
    lastSourceStatus = audioStatus;
    const sourceKey = buildAnalysisSourceKey(audioStatus);
    const sourceSessionKey = buildAnalysisSessionKey(audioStatus);
    const sourceActive = isActiveSource(audioStatus, configuration);
    const injectedTestToneActive =
      configuration?.auditSettings?.injectTestTone === true;

    if (
      naturalRingdownState &&
      (audioStatus?.isPlaying === true ||
        audioStatus?.isLiveInputActive === true ||
        isExplicitPausedFile(audioStatus) ||
        !naturalCompletion ||
        audioStatus?.playbackSessionId !==
          naturalRingdownState.playbackSessionId)
    ) {
      cancelNaturalRingdown("natural-ringdown-cancelled");
    }

    const latestModel = joiner.readLatestModel();
    if (
      !naturalRingdownState &&
      previousAudioStatus?.isPlaying === true &&
      naturalCompletion &&
      latestModel?.drive?.renderState?.renderAuthority === true &&
      lastFastPayloadShape
    ) {
      naturalRingdownState = {
        playbackSessionId: audioStatus.playbackSessionId,
        sourceKey: buildAnalysisSourceKey(previousAudioStatus),
        sessionKey:
          lastSourceSessionKey ?? buildAnalysisSessionKey(previousAudioStatus),
        captureTimestampMs: Number.isFinite(lastCaptureTimestampMs)
          ? lastCaptureTimestampMs
          : currentTimeMs - normalizedSettings.fastCadenceMs,
        observationTimeSeconds: Number.isFinite(lastObservationTimeSeconds)
          ? lastObservationTimeSeconds
          : Math.max(0, currentTimeMs / 1000),
        fastPayload: createZeroFastPayload(lastFastPayloadShape),
      };
      updateStatus({
        naturalRingdownActive: true,
        naturalRingdownSessionId: audioStatus.playbackSessionId,
        reason: "natural-ringdown-started",
      });
    }

    if (naturalRingdownState) {
      if (!ensureWorker() && !maybeRestartStalledWorker(currentTimeMs)) {
        return;
      }
      naturalRingdownState.captureTimestampMs +=
        normalizedSettings.fastCadenceMs;
      naturalRingdownState.observationTimeSeconds +=
        normalizedSettings.fastCadenceMs / 1000;
      const offerResult = transport.offer({
        captureTimestampMs: naturalRingdownState.captureTimestampMs,
        fastPayload: naturalRingdownState.fastPayload,
        structuralPayload: null,
        structuralRequested: false,
        status: {
          ...audioStatus,
          hasAnalysisSource: true,
          sourceKey: naturalRingdownState.sourceKey,
          sessionKey: naturalRingdownState.sessionKey,
          naturalRingdownActive: true,
          observationTimeSeconds: naturalRingdownState.observationTimeSeconds,
          observationAdvancing: true,
          observationPaused: false,
        },
      });
      const transportStatus = transport.getStatus();
      updateStatus({
        reason: offerResult.sent
          ? "natural-ringdown-input-sent"
          : offerResult.reason,
        latestObservationTimeSeconds:
          naturalRingdownState.observationTimeSeconds,
        latestCaptureRms: 0,
        queueDepth: transportStatus.queueDepth,
        inputReplacementCount: transportStatus.replacementCount,
      });
      maybeRestartStalledWorker(currentTimeMs);
      return;
    }

    if (naturalCompletion) {
      if (
        lastCompletedNaturalRingdownSessionId !== audioStatus.playbackSessionId
      ) {
        completeNaturalPlayback(
          "natural-ringdown-empty",
          audioStatus.playbackSessionId,
        );
      }
      return;
    }

    if (explicitStop) {
      if (!hasCurrentPlaybackEndReason(previousAudioStatus, "stopped")) {
        advanceSourceGeneration("explicit-stop-hold");
      } else {
        updateStatus({
          naturalRingdownActive: false,
          naturalRingdownSessionId: null,
          reason: "explicit-stop-hold",
        });
      }
      return;
    }

    if (
      lastSourceSessionKey !== null &&
      sourceSessionKey !== lastSourceSessionKey
    ) {
      lastSourceSessionKey = sourceSessionKey;
      capturePreparedPausedFile = Boolean(
        audioStatus?.isPlaybackPaused === true &&
        audioStatus?.hasPreparedFileAnalysisSource === true,
      );
      advanceSourceGeneration("source-session-changed");
      return;
    }
    lastSourceSessionKey = sourceSessionKey;

    if (
      isExplicitPausedFile(audioStatus) &&
      capturePreparedPausedFile !== true
    ) {
      updateStatus({ reason: "paused-file-hold" });
      return;
    }
    if (
      isPreparedFileAwaitingPlayback(audioStatus) &&
      hasPreparedFeatureModel(latestModel)
    ) {
      updateStatus({ reason: "prepared-file-hold" });
      return;
    }
    if (!ensureWorker() && !maybeRestartStalledWorker(currentTimeMs)) {
      return;
    }

    const includeStructural =
      (forceStructuralCapture && sourceActive) ||
      currentTimeMs - lastStructuralCaptureAtMs >=
        normalizedSettings.structuralCadenceMs;
    const capture = audioSession?.readFeatureAnalysisCapture?.({
      includeStructural,
    });
    const transportState = audioSession?.getTransportState?.() ?? null;
    const observationTimeSeconds = injectedTestToneActive
      ? currentTimeMs / 1000
      : Number.isFinite(capture?.observationTimeSeconds)
        ? Math.max(0, capture.observationTimeSeconds)
        : Number.isFinite(transportState?.currentTimeSeconds) &&
            audioStatus?.isAudioLoaded
          ? Math.max(0, transportState.currentTimeSeconds)
          : currentTimeMs / 1000;
    const structuralCaptureSatisfied = Boolean(
      includeStructural &&
      (capture?.structural != null || injectedTestToneActive),
    );
    // A null capture cannot satisfy bootstrap. Keep the force armed, but let an
    // inactive source retry at structural cadence until its analyser activates.
    if (structuralCaptureSatisfied) {
      forceStructuralCapture = false;
      lastStructuralCaptureAtMs = currentTimeMs;
    } else if (includeStructural && !sourceActive) {
      lastStructuralCaptureAtMs = currentTimeMs;
    }

    const offerResult = transport.offer({
      captureTimestampMs: capture?.captureTimestampMs ?? currentTimeMs,
      fastPayload: capture?.fast ?? null,
      structuralPayload: capture?.structural ?? null,
      structuralRequested: includeStructural,
      status: {
        ...audioStatus,
        sourceKey,
        sessionKey: sourceSessionKey,
        observationTimeSeconds,
        observationAdvancing:
          injectedTestToneActive ||
          audioStatus?.isPlaying === true ||
          audioStatus?.isLiveInputActive === true,
        observationPaused:
          !injectedTestToneActive && audioStatus?.isPlaybackPaused === true,
      },
    });
    if (capture?.fast) {
      lastFastPayloadShape = captureFastPayloadShape(
        capture.fast,
        audioStatus?.fastFftSize,
      );
    }
    lastCaptureTimestampMs = capture?.captureTimestampMs ?? currentTimeMs;
    lastObservationTimeSeconds = observationTimeSeconds;
    capturePreparedPausedFile = false;
    const transportStatus = transport.getStatus();
    updateStatus({
      reason: offerResult.sent ? "input-sent" : offerResult.reason,
      latestObservationTimeSeconds: observationTimeSeconds,
      latestCaptureRms: Number.isFinite(capture?.fast?.rms)
        ? Math.max(0, capture.fast.rms)
        : null,
      queueDepth: transportStatus.queueDepth,
      inputReplacementCount: transportStatus.replacementCount,
    });
    maybeRestartStalledWorker(currentTimeMs);
  };

  const scheduleNextCapture = () => {
    if (
      disposed ||
      !started ||
      authorityRole !== AUDIO_FEATURE_AUTHORITY_ROLES.localProducer
    ) {
      return;
    }
    schedulerHandle = schedule(() => {
      schedulerHandle = null;
      captureOnce();
      scheduleNextCapture();
    }, normalizedSettings.fastCadenceMs);
  };

  return {
    start() {
      if (disposed || started) {
        return false;
      }
      started = true;
      updateStatus({ state: "loading", reason: "started" });
      if (authorityRole === AUDIO_FEATURE_AUTHORITY_ROLES.localProducer) {
        ensureWorker();
        captureOnce();
        scheduleNextCapture();
      }
      return true;
    },

    configure(nextConfiguration = {}) {
      const normalized = normalizeRuntimeConfiguration(nextConfiguration);
      const nextSignature = stableSerialize(normalized);
      if (nextSignature === configurationSignature) {
        return false;
      }
      configuration = normalized;
      configurationSignature = nextSignature;
      forceStructuralCapture = true;
      postWorkerMessage({
        type: "configure",
        sourceGeneration,
        workerGeneration,
        configuration,
      });
      updateStatus({ reason: "configured" });
      return true;
    },

    setAuthorityRole(role) {
      if (!VALID_AUTHORITY_ROLES.has(role)) {
        throw new TypeError(`Invalid audio feature authority role: ${role}`);
      }
      if (role === authorityRole) {
        return false;
      }
      authorityRole = role;
      if (schedulerHandle != null) {
        cancel(schedulerHandle);
        schedulerHandle = null;
      }
      if (role === AUDIO_FEATURE_AUTHORITY_ROLES.localProducer) {
        const currentSourceStatus = audioSession?.getStatus?.() ?? {};
        lastSourceStatus = currentSourceStatus;
        lastSourceSessionKey = buildAnalysisSessionKey(currentSourceStatus);
      }
      advanceSourceGeneration("authority-role-changed");
      updateStatus({ authorityRole: role });
      if (started && role === AUDIO_FEATURE_AUTHORITY_ROLES.localProducer) {
        captureOnce();
        scheduleNextCapture();
      }
      return true;
    },

    readLatestFeatureModel() {
      const fileModelRetentionActive =
        shouldRetainFileModel(lastSourceStatus);
      const model =
        joiner.readLatestModel() ??
        (fileModelRetentionActive ? retainedFileModel : null);
      if (!model) {
        return null;
      }
      if (authorityRole !== AUDIO_FEATURE_AUTHORITY_ROLES.localProducer) {
        return null;
      }

      const currentTimeMs = now();
      const active = isAcousticStateAdvancing();
      const paused = isExplicitPausedFile(lastSourceStatus);
      const latestDriveAgeMs = Number.isFinite(lastAcceptedDriveAtMs)
        ? Math.max(0, currentTimeMs - lastAcceptedDriveAtMs)
        : null;
      const latestDriveStale =
        active &&
        !paused &&
        latestDriveAgeMs !== null &&
        latestDriveAgeMs > normalizedSettings.staleDriveTimeoutMs;
      const renderAuthorityRevoked =
        latestDriveStale && !fileModelRetentionActive;
      updateStatus({
        latestDriveAgeMs,
        latestDriveStale,
        renderAuthorityRevoked,
      });
      return renderAuthorityRevoked ? null : model;
    },

    getStatus() {
      const joinStatus = joiner.getStatus();
      const transportStatus = transport?.getStatus();
      return {
        ...status,
        authorityRole,
        sourceGeneration,
        workerGeneration,
        topologyRevision: joinStatus.topologyRevision,
        latestAcceptedFrameId: joinStatus.latestAcceptedFrameId,
        rejectedPacketCount: joinStatus.rejectedPacketCount,
        queueDepth: transportStatus?.queueDepth ?? 0,
        inputReplacementCount: transportStatus?.replacementCount ?? 0,
        staleAcknowledgementCount:
          transportStatus?.staleAcknowledgementCount ?? 0,
      };
    },

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      started = false;
      if (schedulerHandle != null) {
        cancel(schedulerHandle);
        schedulerHandle = null;
      }
      transport?.clear();
      joiner.clear();
      naturalRingdownState = null;
      stopWorker();
      updateStatus({ state: "terminated", reason: "disposed" });
    },
  };
}
