/**
 * @typedef {Readonly<{
 *   currentTimeSeconds: number,
 *   durationSeconds: number,
 *   canSeek: boolean,
 * }>} AudioTransportClockSnapshot
 */

/** @type {AudioTransportClockSnapshot} */
const DEFAULT_AUDIO_TRANSPORT_CLOCK = Object.freeze({
  currentTimeSeconds: 0,
  durationSeconds: 0,
  canSeek: false,
});

/** @type {AudioTransportClockSnapshot} */
let snapshot = DEFAULT_AUDIO_TRANSPORT_CLOCK;
const subscribers = new Set();

function areClockSnapshotsEqual(current, nextSnapshot) {
  return (
    current.currentTimeSeconds === nextSnapshot.currentTimeSeconds &&
    current.durationSeconds === nextSnapshot.durationSeconds &&
    current.canSeek === nextSnapshot.canSeek
  );
}

function emitClockUpdate() {
  for (const observer of subscribers) {
    observer(snapshot);
  }
}

/**
 * Observe the latest transport clock without routing frame-rate presentation
 * state through React. The cached snapshot is delivered synchronously so a
 * newly mounted projection can initialize itself without a public getter.
 *
 * @param {(snapshot: AudioTransportClockSnapshot) => void} observer
 * @returns {() => void}
 */
export function observeAudioTransportClock(observer) {
  if (typeof observer !== "function") {
    throw new TypeError("Audio transport clock observer must be a function.");
  }

  let active = true;
  subscribers.add(observer);
  try {
    observer(snapshot);
  } catch (error) {
    active = false;
    subscribers.delete(observer);
    throw error;
  }

  return () => {
    if (!active) {
      return;
    }
    active = false;
    subscribers.delete(observer);
  };
}

export function publishAudioTransportClock(nextSnapshot) {
  const normalizedSnapshot = Object.freeze({
    currentTimeSeconds: Number(nextSnapshot?.currentTimeSeconds) || 0,
    durationSeconds: Number(nextSnapshot?.durationSeconds) || 0,
    canSeek: nextSnapshot?.canSeek === true,
  });
  if (areClockSnapshotsEqual(snapshot, normalizedSnapshot)) {
    return snapshot;
  }

  snapshot = normalizedSnapshot;
  emitClockUpdate();
  return snapshot;
}

export function resetAudioTransportClock() {
  snapshot = DEFAULT_AUDIO_TRANSPORT_CLOCK;
  emitClockUpdate();
}
