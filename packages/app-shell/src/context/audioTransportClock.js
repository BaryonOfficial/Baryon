import { useSyncExternalStore } from "react";

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
  for (const subscriber of subscribers) {
    subscriber();
  }
}

export function publishAudioTransportClock(nextSnapshot) {
  const normalizedSnapshot = {
    currentTimeSeconds: Number(nextSnapshot?.currentTimeSeconds) || 0,
    durationSeconds: Number(nextSnapshot?.durationSeconds) || 0,
    canSeek: nextSnapshot?.canSeek === true,
  };
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

function getAudioTransportClockSnapshot() {
  return snapshot;
}

export function useAudioTransportClock() {
  return useSyncExternalStore(
    (subscriber) => {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
    getAudioTransportClockSnapshot,
    getAudioTransportClockSnapshot,
  );
}
