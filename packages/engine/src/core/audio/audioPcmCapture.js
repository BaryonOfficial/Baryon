const installedModules = new WeakMap();

async function install(context) {
  let pending = installedModules.get(context);
  if (!pending) {
    // Shared desktop imports also load in Electron's CommonJS main process.
    // Resolve the browser asset only when its AudioContext installs capture.
    const moduleUrl = new URL("./audioPcmCapture.worklet.js", import.meta.url);
    pending = context.audioWorklet.addModule(moduleUrl.href).catch((error) => {
      installedModules.delete(context);
      throw error;
    });
    installedModules.set(context, pending);
  }
  await pending;
}

/**
 * A session-owned silent analysis branch. `onBlock` borrows packet.channels
 * until release in standalone qualification. Production transfers `pcmPort`
 * directly to the worklet: neither PCM nor returns traverse the display host.
 * Exactly one consumer is required. Missing audio is never reconstructed.
 */
export async function createAudioPcmCapture({
  context,
  source,
  configuration,
  onBlock = undefined,
  pcmPort = undefined,
  onEvent = undefined,
  signal = undefined,
  initialInterval = undefined,
}) {
  if ((typeof onBlock === "function") === Boolean(pcmPort))
    throw new TypeError(
      "PCM capture requires exactly one block consumer or port",
    );
  if (
    pcmPort &&
    (!Number.isSafeInteger(configuration.workerGeneration) ||
      configuration.workerGeneration < 1 ||
      !Number.isSafeInteger(configuration.protocolVersion))
  )
    throw new TypeError("Direct PCM capture requires a worker epoch");
  signal?.throwIfAborted();
  await install(context);
  signal?.throwIfAborted();
  const node = new AudioWorkletNode(context, "baryon-pcm-capture", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    // Preserve the input layout; unsupported layouts are a diagnosed fault.
    channelCountMode: "max",
    channelInterpretation: "discrete",
    processorOptions: { ...configuration, initialInterval },
  });
  let disposed = false;
  let phase = "idle";
  let failure = null;
  let deliveredFrames = 0;
  let inFlight = 0;
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (phase !== "faulted") phase = "closed";
    signal?.removeEventListener("abort", dispose);
    node.port.onmessage = null;
    node.onprocessorerror = null;
    node.port.postMessage({ type: "close" });
    node.port.close();
    // Remove only this analysis edge, never the source's audible connections.
    try {
      source.disconnect(node);
    } catch {
      // The source/session may already have disconnected its graph.
    }
    node.disconnect();
  }
  function fault(reason) {
    if (disposed) return;
    phase = "faulted";
    failure = reason;
    dispose();
    notify({ ...configuration, type: "fault", reason });
  }
  function notify(event) {
    try {
      onEvent?.(event);
    } catch (error) {
      phase = "faulted";
      failure = `event-consumer-error: ${error instanceof Error ? error.message : error}`;
      dispose();
    }
  }
  node.onprocessorerror = () => fault("processor-error");
  node.port.onmessage = ({ data }) => {
    if (disposed) return;
    if (data.type !== "pcm") {
      phase =
        data.type === "started" || data.type === "resumed"
          ? data.postSourceSilence
            ? "draining"
            : "running"
          : data.type === "fault"
            ? "faulted"
            : data.type === "ended"
              ? data.phase === "paused"
                ? "paused"
                : "draining"
              : data.type;
      if (data.type === "fault") failure = data.reason;
      if (data.type === "fault") dispose();
      notify(data);
      return;
    }
    if (pcmPort) {
      fault("unexpected-main-thread-pcm");
      return;
    }
    inFlight++;
    let released = false;
    const release = (buffers = data.buffers) => {
      if (released) return;
      released = true;
      inFlight--;
      if (!disposed && buffers !== null) {
        try {
          node.port.postMessage(
            {
              type: "recycle",
              slot: data.slot,
              sequence: data.sequence,
              buffers,
            },
            buffers,
          );
        } catch {
          fault("buffer-return-failed");
        }
      }
    };
    try {
      const channels = data.buffers.map(
        (buffer) => new Float32Array(buffer, 0, data.frameCount),
      );
      deliveredFrames += data.frameCount;
      const result = onBlock({ ...data, channels }, release);
      if (result && typeof result.then === "function") {
        // Relays return synchronously and release from their worker callback.
        // An unobserved async function must not leave a loan silently stranded.
        Promise.resolve(result).catch(() => {});
        throw new TypeError("PCM block dispatch must return synchronously");
      }
    } catch (error) {
      release();
      fault(
        `consumer-error: ${error instanceof Error ? error.message : error}`,
      );
    }
  };
  try {
    if (pcmPort)
      node.port.postMessage({ type: "connect-pcm", port: pcmPort }, [pcmPort]);
    source.connect(node);
    node.connect(context.destination);
    signal?.addEventListener("abort", dispose, { once: true });
  } catch (error) {
    dispose();
    throw error;
  }
  function command(type, options = {}) {
    if (disposed) throw new Error("PCM capture is disposed");
    node.port.postMessage({ ...options, type });
  }
  return {
    start: (options = {}) => command("start", options),
    pause: (options = {}) => command("pause", options),
    resume: (options = {}) => command("resume", options),
    end: (options = {}) => command("end", options),
    dispose,
    read: () => ({ phase, failure, disposed, deliveredFrames, inFlight }),
  };
}
