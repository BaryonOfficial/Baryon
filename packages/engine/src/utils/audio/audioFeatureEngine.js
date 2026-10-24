import { AUDIO_FEATURE_PROTOCOL_VERSION } from "../../contracts/audioFeatureProtocol.js";
import { CAVITY_ACOUSTIC_DEFAULTS } from "../../defaults.js";
import { createAudioPcmCapture } from "../../core/audio/audioPcmCapture.js";
import { createAudioFeaturePacketJoiner } from "./audioFeaturePackets.js";
import { normalizeAudioFeatureRuntimeSettings } from "./audioFeatureEngineShared.js";

export {
  DEFAULT_AUDIO_FEATURE_RUNTIME_SETTINGS,
  normalizeAudioFeatureRuntimeSettings,
} from "./audioFeatureEngineShared.js";
export const AUDIO_FEATURE_AUTHORITY_ROLES = Object.freeze({
  localProducer: "local-producer",
  externalConsumer: "external-consumer",
});
function configurationOf(input = {}) {
  const exposureSeconds = input.exposureSeconds ?? 0.05;
  const boundaryMode = input.boundaryMode ?? "neumann";
  if (
    !["neumann", "dirichlet"].includes(boundaryMode) ||
    !Number.isFinite(exposureSeconds) ||
    exposureSeconds <= 0
  )
    throw new RangeError("Invalid broadband apparatus configuration");
  return {
    boundaryMode,
    exposureSeconds,
    cavityAcousticScale: {
      ...CAVITY_ACOUSTIC_DEFAULTS,
      ...input.cavityAcousticScale,
    },
  };
}
function signature(value) {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${signature(value[key])}`)
    .join(",")}}`;
}

/**
 * Source commands alone own capture/worker lifetime. Consecutive worklet loans
 * advance acoustic time; completed observations only refresh the model cache and
 * notify consumers. Reads, acknowledgements, telemetry and mirrors cannot start,
 * replay or recover a source. Faults revoke the epoch until an explicit command.
 */
export function createAudioFeatureRuntime(settings = {}, dependencies = {}) {
  const normalized = normalizeAudioFeatureRuntimeSettings(settings);
  const audioSession = dependencies.audioSession;
  const now = dependencies.now ?? (() => performance.now());
  const createCapture = dependencies.createCapture ?? createAudioPcmCapture;
  const createPcmChannel =
    dependencies.createPcmChannel ?? (() => new MessageChannel());
  const createWorker =
    dependencies.createWorker ??
    (() =>
      new Worker(new URL("./audioFeatureEngine.worker.js", import.meta.url), {
        type: "module",
      }));
  let configuration = configurationOf(),
    configurationSignature = signature(configuration);
  let authorityRole = AUDIO_FEATURE_AUTHORITY_ROLES.localProducer;
  let sourceGeneration = 1,
    workerGeneration = 0,
    processingRevision = 0;
  let requestRevision = 0,
    started = false,
    disposed = false,
    unbind = null;
  let worker = null,
    capture = null,
    pcmChannel = null,
    abort = null;
  let source = null,
    sourceIdentity = null,
    pendingPreparation = null;
  let phase = "idle",
    state = "idle",
    reason = "not-started";
  let pauseSettled = null,
    settlePause = null,
    startSettled = null,
    settleStart = null;
  let lastProgressAtAudioTime = null;
  let lastObservationAtMs = null,
    sourceBootstrapCount = 0,
    workerProcessingMs = null;
  let joiner = createAudioFeaturePacketJoiner();
  const listeners = new Map();
  let observerNotificationFailure = null;
  let settleWorkerReady = null,
    workerStartupTimer = null;

  function releaseResources() {
    if (workerStartupTimer !== null) clearTimeout(workerStartupTimer);
    workerStartupTimer = null;
    settleWorkerReady?.(false);
    settleWorkerReady = null;
    abort?.abort();
    abort = null;
    capture?.dispose();
    capture = null;
    pcmChannel?.port1.close();
    pcmChannel?.port2.close();
    pcmChannel = null;
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
      worker = null;
    }
    settlePause?.();
    settleStart?.();
    settlePause = settleStart = pauseSettled = startSettled = null;
  }
  function invalidate(nextReason) {
    requestRevision++;
    sourceGeneration++;
    releaseResources();
    pendingPreparation = null;
    joiner.clear();
    lastObservationAtMs = null;
    lastProgressAtAudioTime = null;
    workerProcessingMs = null;
    sourceIdentity = null;
    source = null;
    phase = "idle";
    state = "idle";
    reason = nextReason;
    notifyObservers(
      "revoke",
      Object.freeze({ reason: nextReason, sourceGeneration }),
    );
  }
  function fail(nextReason) {
    invalidate(nextReason);
    phase = "faulted";
    state = "failed";
  }
  function published(result) {
    if (!result.published) return;
    lastObservationAtMs = now();
    lastProgressAtAudioTime = source.context.currentTime;
    const model = result.model;
    state = "ready";
    reason = "observation-accepted";
    // Subscribers own their bounded presentation histories. Notifications do
    // not feed back into capture or send another worker input.
    notifyObservers("model", model);
  }
  function notifyObservers(kind, value) {
    for (const [listener, { onError, onRevoke }] of listeners) {
      try {
        if (kind === "model") listener(value);
        else onRevoke?.(value);
      } catch (error) {
        listeners.delete(listener);
        observerNotificationFailure =
          error instanceof Error ? error.message : String(error);
        try {
          onError?.(error);
        } catch {
          /* A presentation callback cannot reset audio. */
        }
      }
    }
  }

  async function prepare(snapshot) {
    if (
      disposed ||
      !started ||
      authorityRole !== AUDIO_FEATURE_AUTHORITY_ROLES.localProducer ||
      !snapshot
    )
      return false;
    const identity = `${snapshot.sourceSession.kind}:${snapshot.sourceSession.sessionId}:${snapshot.sourceSession.timelineRevision}`;
    if (
      sourceIdentity === identity &&
      snapshot.sourceSession.phase !== "ended" &&
      (capture || pendingPreparation)
    ) {
      if (pendingPreparation) await pendingPreparation;
      if (pauseSettled) await pauseSettled;
      return Boolean(capture);
    }
    invalidate("source-prepared");
    source = snapshot;
    sourceIdentity = identity;
    const revision = requestRevision;
    const configurationForSource = {
      ...configuration,
      sourceGeneration,
      timelineRevision: snapshot.sourceSession.timelineRevision,
      processingRevision,
      sampleRate: snapshot.context.sampleRate,
      // Mono is duplicated at capture admission. The independent-channel
      // mean is identical for two equal channels and preserves true stereo.
      channelCount: 2,
      startSample: 0,
    };
    const epoch = {
      ...configurationForSource,
      workerGeneration: ++workerGeneration,
    };
    joiner = createAudioFeaturePacketJoiner(epoch);
    const isCurrent = () => !disposed && revision === requestRevision;
    const preparation = (async () => {
      try {
        const activeWorker = createWorker();
        worker = activeWorker;
        activeWorker.onerror = () => {
          if (isCurrent()) fail("worker-error");
        };
        activeWorker.onmessageerror = () => {
          if (isCurrent()) fail("worker-message-error");
        };
        const workerReady = new Promise((resolve) => {
          settleWorkerReady = resolve;
        });
        state = "starting";
        reason = "worker-initializing";
        workerStartupTimer = setTimeout(() => {
          if (isCurrent()) fail("worker-startup-timeout");
        }, 5000);
        activeWorker.onmessage = ({ data }) => {
          if (!isCurrent() || worker !== activeWorker) return;
          try {
            if (data.type === "topology-packet") {
              const result = joiner.acceptTopology(data.packet);
              if (settleWorkerReady) {
                if (!result.accepted) {
                  fail("invalid-initial-topology");
                  return;
                }
                clearTimeout(workerStartupTimer);
                workerStartupTimer = null;
                settleWorkerReady(true);
                settleWorkerReady = null;
              }
              published(result);
            } else if (data.type === "observation-packet") {
              workerProcessingMs =
                Number.isFinite(data.processingMs) && data.processingMs >= 0
                  ? data.processingMs
                  : null;
              published(joiner.acceptObservation(data.packet));
            } else if (
              data.type === "status" &&
              data.status?.sourceGeneration === epoch.sourceGeneration &&
              data.status?.workerGeneration === epoch.workerGeneration &&
              data.status.state === "failed"
            )
              fail(data.status.reason ?? "worker-processing-failed");
          } catch (error) {
            fail(error instanceof Error ? error.message : String(error));
          }
        };
        worker.postMessage({
          type: "init",
          protocolVersion: AUDIO_FEATURE_PROTOCOL_VERSION,
          sourceGeneration: epoch.sourceGeneration,
          workerGeneration: epoch.workerGeneration,
          configuration: configurationForSource,
        });
        sourceBootstrapCount++;
        // Cold module loading and basis initialization must finish before
        // capture can consume its bounded pool. Readiness completes this
        // explicit prepare command; it cannot issue start or new init itself.
        if (!(await workerReady) || !isCurrent()) return false;
        pcmChannel = createPcmChannel();
        activeWorker.postMessage(
          { type: "connect-pcm", ...epoch, port: pcmChannel.port2 },
          [pcmChannel.port2],
        );
        abort = new AbortController();
        state = "starting";
        reason = "capture-installing";
        const candidate = await createCapture({
          context: snapshot.context,
          source: snapshot.source,
          configuration: {
            ...epoch,
            protocolVersion: AUDIO_FEATURE_PROTOCOL_VERSION,
          },
          pcmPort: pcmChannel.port1,
          signal: abort.signal,
          onEvent: (event) => {
            if (!isCurrent()) return;
            if (event.type === "fault") {
              fail(event.reason ?? "capture-fault");
              return;
            }
            if (event.type === "started" || event.type === "resumed") {
              lastProgressAtAudioTime = source.context.currentTime;
              phase = event.postSourceSilence ? "draining" : "running";
              settleStart?.();
              settleStart = startSettled = null;
            }
            if (["paused", "resumed", "ended"].includes(event.type)) {
              if (event.type === "paused") {
                phase = "paused";
                settlePause?.();
                settlePause = pauseSettled = null;
              } else if (event.type === "ended")
                phase = event.phase === "paused" ? "paused" : "draining";
            }
          },
        });
        if (!isCurrent()) {
          candidate.dispose();
          return false;
        }
        capture = candidate;
        phase = "idle";
        state = "ready";
        reason = "capture-prepared";
        return true;
      } catch (error) {
        if (isCurrent())
          fail(error instanceof Error ? error.message : String(error));
        return false;
      }
    })();
    pendingPreparation = preparation;
    const result = await preparation;
    if (isCurrent()) pendingPreparation = null;
    return result;
  }
  function begin({ startFrame, endFrame = undefined }) {
    if (!capture || !["idle", "paused"].includes(phase)) return false;
    const resume = phase === "paused";
    startSettled = new Promise((resolve) => {
      settleStart = resolve;
    });
    phase = "armed";
    try {
      if (resume) capture.resume({ contextFrame: startFrame });
      else capture.start({ contextFrame: startFrame });
      if (endFrame !== undefined)
        capture.end({ contextFrame: Math.max(startFrame, endFrame) });
      return true;
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  function reconnectActiveSource() {
    const snapshot = audioSession?.readPcmSource?.();
    if (!snapshot?.active) return;
    void prepare(snapshot).then((ready) => {
      if (!ready || source !== snapshot) return;
      const startFrame =
        Math.ceil(
          (snapshot.context.currentTime * snapshot.context.sampleRate) / 128,
        ) *
          128 +
        512;
      begin({
        startFrame,
        endFrame:
          snapshot.endTime === undefined
            ? undefined
            : Math.max(
                startFrame,
                Math.ceil(snapshot.endTime * snapshot.context.sampleRate),
              ),
      });
    });
  }
  const consumer = {
    prepare,
    begin,
    invalidate,
    waitUntilStarted: () => startSettled ?? Promise.resolve(),
    scheduleEnd: (endFrame) => {
      if (capture) capture.end({ contextFrame: endFrame });
    },
    end: () => {
      if (capture && ["armed", "running"].includes(phase)) capture.end();
    },
    pause: (options = {}) => {
      if (!capture || !["armed", "running", "draining"].includes(phase)) return;
      pauseSettled = new Promise((resolve) => {
        settlePause = resolve;
      });
      phase = "pausing";
      capture.pause(options);
    },
  };
  function status() {
    const observation = joiner.readLatestModel()?.observation;
    const latestObservationAgeMs =
      lastObservationAtMs === null
        ? null
        : Math.max(0, now() - lastObservationAtMs);
    // Arrival age is diagnostic wall time. Liveness uses the actual audio
    // clock, which stops during context suspension. A start/resume event arms
    // the deadline without manufacturing a new observation or elapsed samples.
    const progressAgeMs =
      lastProgressAtAudioTime === null
        ? null
        : Math.max(0, source.context.currentTime - lastProgressAtAudioTime) *
          1000;
    const stale =
      ["running", "draining"].includes(phase) &&
      progressAgeMs !== null &&
      progressAgeMs > normalized.staleObservationTimeoutMs;
    return {
      ...joiner.getStatus(),
      state,
      reason,
      phase,
      authorityRole,
      sourceGeneration,
      workerGeneration,
      processingRevision,
      sourceBootstrapCount,
      workerProcessingMs,
      observerNotificationFailure,
      latestObservationAgeMs,
      latestObservationStale: stale,
      latestObservationTimeSeconds: observation
        ? observation.endSample / source.context.sampleRate
        : null,
      naturalRingdownActive: phase === "draining",
      renderAuthorityRevoked: state === "failed" || stale,
    };
  }
  return {
    start() {
      if (disposed) throw new Error("Audio feature runtime is disposed");
      if (started) return false;
      started = true;
      unbind = audioSession?.bindPcmConsumer(consumer) ?? null;
      state = "idle";
      reason = "awaiting-source";
      reconnectActiveSource();
      return true;
    },
    configure(input = {}) {
      if (disposed) return false;
      const next = configurationOf(input),
        key = signature(next);
      if (key === configurationSignature) return false;
      configuration = next;
      configurationSignature = key;
      processingRevision++;
      invalidate("apparatus-changed");
      if (started) reconnectActiveSource();
      return true;
    },
    setAuthorityRole(role) {
      if (!Object.values(AUDIO_FEATURE_AUTHORITY_ROLES).includes(role))
        throw new TypeError("Invalid audio feature authority role");
      if (disposed || role === authorityRole) return false;
      authorityRole = role;
      invalidate("authority-role-changed");
      if (started && role === AUDIO_FEATURE_AUTHORITY_ROLES.localProducer)
        reconnectActiveSource();
      return true;
    },
    subscribeObservations(listener, onError = undefined, onRevoke = undefined) {
      if (typeof listener !== "function")
        throw new TypeError("Observation subscriber must be a function");
      listeners.set(listener, { onError, onRevoke });
      return () => listeners.delete(listener);
    },
    readLatestFeatureModel() {
      if (
        authorityRole !== AUDIO_FEATURE_AUTHORITY_ROLES.localProducer ||
        status().renderAuthorityRevoked
      )
        return null;
      return joiner.readLatestModel();
    },
    getStatus: status,
    dispose() {
      if (disposed) return;
      invalidate("disposed");
      disposed = true;
      started = false;
      unbind?.();
      unbind = null;
      listeners.clear();
      state = "terminated";
      reason = "disposed";
    },
  };
}
