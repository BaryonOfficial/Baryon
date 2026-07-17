import { buildAnalysisSessionKey } from "./analysisSession.js";
import {
  createAudioFeaturePacketJoiner,
  createBoundedAudioInputTransport,
} from "./audioFeaturePackets.js";
import { normalizeAudioFeatureRuntimeSettings } from "./audioFeatureEngineShared.js";

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
    includeSpectralLight: config.includeSpectralLight !== false,
    auditSettings: config.auditSettings ? { ...config.auditSettings } : null,
    beatSettings: config.beatSettings ? { ...config.beatSettings } : null,
    liveInputAnalysisSettings: config.liveInputAnalysisSettings
      ? { ...config.liveInputAnalysisSettings }
      : null,
  });
}

function isActiveSource(status, configuration) {
  return Boolean(
    status?.isPlaying ||
    status?.isLiveInputActive ||
    configuration?.auditSettings?.injectTestTone,
  );
}

function isActivePlaybackAnalysis(status) {
  return Boolean(
    status?.isPlaying === true &&
    status?.isLiveInputActive !== true &&
    status?.hasPlaybackAnalysisSource === true &&
    status?.analysisSource === "file" &&
    status?.playbackSessionId != null,
  );
}

function isExplicitPausedFile(status) {
  return status?.isPlaybackPaused === true;
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
    renderAuthorityRevoked: false,
    playbackAnalysisPending: false,
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
  let lastStructuralCaptureAtMs = Number.NEGATIVE_INFINITY;
  let lastSourceSessionKey = null;
  let lastAcceptedDriveAtMs = null;
  let workerStartedAtMs = null;
  let workerCreationFailedAtMs = null;
  let restartedForSourceGeneration = false;
  let workerCreationAttemptedForSourceGeneration = false;
  let lastSourceStatus = null;
  // Loaded-source identity survives pause/restart. Analysis readiness does not:
  // each playback analyser activation must publish one structural drive before
  // presentation leaves the safe pre-playback frame.
  let pendingPlaybackAnalysis = null;
  let status = createInitialStatus();

  const joiner = createAudioFeaturePacketJoiner({
    sourceGeneration,
    workerGeneration,
  });
  let transport = null;

  const updateStatus = (patch) => {
    status = { ...status, ...patch };
  };

  const clearPendingPlaybackAnalysis = () => {
    if (!pendingPlaybackAnalysis && status.playbackAnalysisPending !== true) {
      return false;
    }
    pendingPlaybackAnalysis = null;
    updateStatus({ playbackAnalysisPending: false });
    return true;
  };

  const beginPendingPlaybackAnalysis = (audioStatus) => {
    pendingPlaybackAnalysis = {
      playbackSessionId: audioStatus.playbackSessionId,
      structuralCaptureTimestampMs: null,
    };
    forceStructuralCapture = true;
    updateStatus({ playbackAnalysisPending: true });
  };

  const resolvePendingPlaybackAnalysis = (publishedDrive) => {
    if (
      !pendingPlaybackAnalysis ||
      !Number.isFinite(pendingPlaybackAnalysis.structuralCaptureTimestampMs) ||
      !Number.isFinite(publishedDrive?.captureTimestampMs) ||
      publishedDrive.captureTimestampMs <
        pendingPlaybackAnalysis.structuralCaptureTimestampMs
    ) {
      return false;
    }
    clearPendingPlaybackAnalysis();
    return true;
  };

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
      resolvePendingPlaybackAnalysis(publishedDrive);
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
      });
      if (result.published) {
        lastAcceptedDriveAtMs = now();
      }
      return;
    }
    if (payload.type === "drive-packet") {
      const result = joiner.acceptDrive(payload.packet);
      const joinStatus = joiner.getStatus();
      if (result.published) {
        lastAcceptedDriveAtMs = now();
      }
      resolvePendingPlaybackAnalysis(result.published ? payload.packet : null);
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
      });
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

  const advanceSourceGeneration = (reason) => {
    clearPendingPlaybackAnalysis();
    sourceGeneration += 1;
    restartedForSourceGeneration = false;
    workerCreationAttemptedForSourceGeneration = false;
    forceStructuralCapture = true;
    lastStructuralCaptureAtMs = Number.NEGATIVE_INFINITY;
    lastAcceptedDriveAtMs = null;
    workerCreationFailedAtMs = null;
    syncGenerationOwners();
    sendInit();
    updateStatus({
      reason,
      sourceBootstrapCount: status.sourceBootstrapCount + 1,
    });
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
    if (
      !isActiveSource(lastSourceStatus, configuration) ||
      isExplicitPausedFile(lastSourceStatus)
    ) {
      return false;
    }
    const advancementAnchor =
      lastAcceptedDriveAtMs ?? workerStartedAtMs ?? workerCreationFailedAtMs;
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
    const previousSourceStatus = lastSourceStatus;
    lastSourceStatus = audioStatus;
    const sourceSessionKey = buildAnalysisSessionKey(audioStatus);
    const sourceActive = isActiveSource(audioStatus, configuration);
    const activePlaybackAnalysis = isActivePlaybackAnalysis(audioStatus);
    if (
      lastSourceSessionKey !== null &&
      sourceSessionKey !== lastSourceSessionKey
    ) {
      lastSourceSessionKey = sourceSessionKey;
      advanceSourceGeneration("source-session-changed");
      if (activePlaybackAnalysis) {
        beginPendingPlaybackAnalysis(audioStatus);
      }
      return;
    }
    lastSourceSessionKey = sourceSessionKey;

    if (
      pendingPlaybackAnalysis &&
      (!activePlaybackAnalysis ||
        pendingPlaybackAnalysis.playbackSessionId !==
          audioStatus.playbackSessionId)
    ) {
      clearPendingPlaybackAnalysis();
    }

    const playbackAnalysisActivated =
      activePlaybackAnalysis &&
      (!isActivePlaybackAnalysis(previousSourceStatus) ||
        previousSourceStatus?.playbackSessionId !==
          audioStatus.playbackSessionId);
    if (playbackAnalysisActivated) {
      beginPendingPlaybackAnalysis(audioStatus);
    }

    if (isExplicitPausedFile(audioStatus)) {
      updateStatus({ reason: "paused-file-hold" });
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
    const structuralCaptureSatisfied = Boolean(
      includeStructural &&
      (capture?.structural != null ||
        configuration?.auditSettings?.injectTestTone === true),
    );
    // A null capture cannot satisfy bootstrap. Keep the force armed, but let an
    // inactive source retry at structural cadence until its analyser activates.
    if (structuralCaptureSatisfied) {
      forceStructuralCapture = false;
      lastStructuralCaptureAtMs = currentTimeMs;
      if (
        pendingPlaybackAnalysis &&
        !Number.isFinite(pendingPlaybackAnalysis.structuralCaptureTimestampMs)
      ) {
        pendingPlaybackAnalysis.structuralCaptureTimestampMs =
          capture?.captureTimestampMs ?? currentTimeMs;
      }
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
        sessionKey: sourceSessionKey,
      },
    });
    const transportStatus = transport.getStatus();
    updateStatus({
      reason: offerResult.sent ? "input-sent" : offerResult.reason,
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
      const model = joiner.readLatestModel();
      if (!model) {
        return null;
      }
      if (authorityRole !== AUDIO_FEATURE_AUTHORITY_ROLES.localProducer) {
        return null;
      }

      const currentTimeMs = now();
      const active = isActiveSource(lastSourceStatus, configuration);
      const paused = isExplicitPausedFile(lastSourceStatus);
      const latestDriveAgeMs = Number.isFinite(lastAcceptedDriveAtMs)
        ? Math.max(0, currentTimeMs - lastAcceptedDriveAtMs)
        : null;
      const stale =
        active &&
        !paused &&
        latestDriveAgeMs !== null &&
        latestDriveAgeMs > normalizedSettings.staleDriveTimeoutMs;
      updateStatus({
        latestDriveAgeMs,
        renderAuthorityRevoked: stale,
      });
      return stale ? null : model;
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
      stopWorker();
      updateStatus({ state: "terminated", reason: "disposed" });
    },
  };
}
