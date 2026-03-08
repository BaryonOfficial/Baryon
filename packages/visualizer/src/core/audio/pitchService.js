/**
 * @typedef {object} PitchServiceOptions
 * @property {number} [sampleRate]
 * @property {number} [windowSize]
 * @property {number} [submitIntervalMs]
 * @property {number} [freshMs]
 * @property {number} [graceMs]
 */

function createSourceBuffer(windowSize) {
  return {
    data: new Float32Array(windowSize),
    writeIndex: 0,
    filled: 0,
    lastSubmittedAt: 0,
  };
}

function appendSamples(target, samples) {
  for (let i = 0; i < samples.length; i++) {
    target.data[target.writeIndex] = samples[i];
    target.writeIndex = (target.writeIndex + 1) % target.data.length;
  }
  target.filled = Math.min(target.data.length, target.filled + samples.length);
}

function extractLatestWindow(target) {
  if (target.filled < target.data.length) {
    return null;
  }

  const window = new Float32Array(target.data.length);
  const split = target.writeIndex;
  const tailLength = target.data.length - split;
  window.set(target.data.subarray(split), 0);
  window.set(target.data.subarray(0, split), tailLength);
  return window;
}

/**
 * @param {PitchServiceOptions} [options]
 */
export function createPitchService({
  sampleRate,
  windowSize = 8192,
  submitIntervalMs = 60,
  freshMs = 750,
  graceMs = 350,
} = {}) {
  const worker = typeof Worker !== 'undefined'
    ? new Worker(new URL('./pitchWorker.js', import.meta.url), { type: 'module' })
    : null;

  const buffers = {
    file: createSourceBuffer(windowSize),
    mic: createSourceBuffer(windowSize),
  };

  const state = {
    mode: 'idle',
    pending: false,
    latestBySource: {
      file: null,
      mic: null,
    },
    lastError: null,
    lastSubmittedAt: 0,
    lastResolvedAt: 0,
    sampleRate,
    workerSupported: Boolean(worker),
  };

  if (worker) {
    worker.onmessage = (event) => {
      const data = event.data ?? {};
      state.pending = false;
      if (data.type === 'pitch' && data.result) {
        state.latestBySource[data.source] = {
          ...data.result,
          source: data.source,
          timestamp: data.timestamp,
          receivedAt: performance.now(),
        };
        state.lastResolvedAt = performance.now();
        state.lastError = null;
      } else if (data.type === 'error') {
        state.lastError = data.message;
      }
    };

    worker.onerror = (event) => {
      state.pending = false;
      state.lastError = event.message || 'Pitch worker error';
    };
  }

  return {
    setMode(mode) {
      state.mode = mode === 'file' || mode === 'mic' ? mode : 'idle';
      state.pending = false;
    },

    pushFrame({ source, samples, sampleRate: frameSampleRate, timestamp }) {
      if (!worker || state.mode === 'idle' || source !== state.mode) {
        return;
      }
      if (!(samples instanceof Float32Array) || samples.length === 0) {
        return;
      }

      const sourceBuffer = buffers[source];
      appendSamples(sourceBuffer, samples);

      const now = performance.now();
      if (state.pending || now - sourceBuffer.lastSubmittedAt < submitIntervalMs) {
        return;
      }

      const window = extractLatestWindow(sourceBuffer);
      if (!window) {
        return;
      }

      sourceBuffer.lastSubmittedAt = now;
      state.lastSubmittedAt = now;
      state.pending = true;
      worker.postMessage(
        {
          type: 'analyze',
          source,
          sampleRate: frameSampleRate ?? state.sampleRate,
          timestamp: timestamp ?? now,
          samples: window,
        },
        [window.buffer]
      );
    },

    getPitchState(source = state.mode) {
      if (source !== 'file' && source !== 'mic') {
        return { state: 'none', ageMs: null };
      }

      const latest = state.latestBySource[source];
      if (!latest) {
        return { state: 'none', ageMs: null };
      }

      const ageMs = performance.now() - latest.receivedAt;
      if (ageMs <= freshMs) {
        return {
          ...latest,
          ageMs,
          state: 'fresh',
        };
      }

      if (ageMs <= freshMs + graceMs) {
        return {
          ...latest,
          ageMs,
          state: 'grace',
        };
      }

      return {
        ...latest,
        ageMs,
        state: 'stale',
      };
    },

    getLatestPitch(source = state.mode) {
      const pitchState = this.getPitchState(source);
      if (pitchState.state === 'fresh' || pitchState.state === 'grace') {
        return pitchState;
      }
      return null;
    },

    getStatus() {
      const current = this.getPitchState(state.mode);
      return {
        workerSupported: state.workerSupported,
        mode: state.mode,
        pending: state.pending,
        lastError: state.lastError,
        lastSubmittedAt: state.lastSubmittedAt,
        lastResolvedAt: state.lastResolvedAt,
        workerState: current.state,
        fresh: current.state === 'fresh',
      };
    },

    dispose() {
      if (worker) {
        worker.terminate();
      }
      state.pending = false;
      state.mode = 'idle';
    },
  };
}
