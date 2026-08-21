import { describe, expect, it } from "vitest";
import {
  AUDIO_SOURCE_EVENTS,
  AUDIO_SOURCE_KINDS,
  AUDIO_SOURCE_PHASES,
  createAudioSourceSession,
  isPreparedFileAwaitingPlayback,
  reduceAudioSourceSession,
} from "./audioSourceSession.js";

describe("audioSourceSession", () => {
  it("starts with File selected and no loaded source", () => {
    expect(createAudioSourceSession()).toEqual({
      kind: AUDIO_SOURCE_KINDS.file,
      phase: AUDIO_SOURCE_PHASES.empty,
      sessionId: 0,
      timelineRevision: 0,
      terminalReason: null,
      systemCapture: null,
    });
  });

  it("makes repeated selection of the current source idempotent", () => {
    const current = createAudioSourceSession();
    expect(
      reduceAudioSourceSession(current, {
        type: AUDIO_SOURCE_EVENTS.select,
        kind: AUDIO_SOURCE_KINDS.file,
      }),
    ).toBe(current);
  });

  it("creates a new session when ownership changes", () => {
    const system = reduceAudioSourceSession(createAudioSourceSession(), {
      type: AUDIO_SOURCE_EVENTS.select,
      kind: AUDIO_SOURCE_KINDS.system,
    });
    expect(system).toMatchObject({
      kind: AUDIO_SOURCE_KINDS.system,
      phase: AUDIO_SOURCE_PHASES.ready,
      sessionId: 1,
    });

    const file = reduceAudioSourceSession(system, {
      type: AUDIO_SOURCE_EVENTS.select,
      kind: AUDIO_SOURCE_KINDS.file,
      phase: AUDIO_SOURCE_PHASES.paused,
      timelineRevision: 3,
    });
    expect(file).toMatchObject({
      kind: AUDIO_SOURCE_KINDS.file,
      phase: AUDIO_SOURCE_PHASES.paused,
      sessionId: 2,
      timelineRevision: 3,
    });
  });

  it("ignores a stale File terminal event after System takes ownership", () => {
    const loading = reduceAudioSourceSession(createAudioSourceSession(), {
      type: AUDIO_SOURCE_EVENTS.fileLoadStarted,
    });
    const system = reduceAudioSourceSession(loading, {
      type: AUDIO_SOURCE_EVENTS.systemStarting,
    });
    const result = reduceAudioSourceSession(system, {
      type: AUDIO_SOURCE_EVENTS.fileEnded,
      sessionId: loading.sessionId,
    });
    expect(result).toBe(system);
  });

  it("ignores delayed System recovery after File takes ownership", () => {
    const starting = reduceAudioSourceSession(createAudioSourceSession(), {
      type: AUDIO_SOURCE_EVENTS.systemStarting,
    });
    const file = reduceAudioSourceSession(starting, {
      type: AUDIO_SOURCE_EVENTS.select,
      kind: AUDIO_SOURCE_KINDS.file,
    });
    const result = reduceAudioSourceSession(file, {
      type: AUDIO_SOURCE_EVENTS.systemActive,
      sessionId: starting.sessionId,
      capture: { deviceKind: "microphone" },
    });
    expect(result).toBe(file);
  });

  it("keeps microphone and loopback as System capture metadata", () => {
    const starting = reduceAudioSourceSession(createAudioSourceSession(), {
      type: AUDIO_SOURCE_EVENTS.systemStarting,
    });
    const active = reduceAudioSourceSession(starting, {
      type: AUDIO_SOURCE_EVENTS.systemActive,
      sessionId: starting.sessionId,
      capture: {
        deviceKind: "microphone",
        deviceId: "mic-1",
        deviceLabel: "Studio Mic",
      },
    });
    expect(active.kind).toBe(AUDIO_SOURCE_KINDS.system);
    expect(active.systemCapture).toEqual({
      deviceKind: "microphone",
      deviceId: "mic-1",
      deviceLabel: "Studio Mic",
    });
  });

  it("advances the timeline only for the current File session", () => {
    const loading = reduceAudioSourceSession(createAudioSourceSession(), {
      type: AUDIO_SOURCE_EVENTS.fileLoadStarted,
    });
    const changed = reduceAudioSourceSession(loading, {
      type: AUDIO_SOURCE_EVENTS.fileTimelineChanged,
      sessionId: loading.sessionId,
    });
    expect(changed.timelineRevision).toBe(1);

    const stale = reduceAudioSourceSession(changed, {
      type: AUDIO_SOURCE_EVENTS.fileTimelineChanged,
      sessionId: loading.sessionId - 1,
    });
    expect(stale).toBe(changed);
  });

  it("owns the decoded File state that is eligible for initial preparation", () => {
    const readyStatus = {
      sourceSession: {
        ...createAudioSourceSession(),
        phase: AUDIO_SOURCE_PHASES.ready,
      },
      isAudioLoaded: true,
      hasPreparedFileAnalysisSource: true,
      isPlaying: false,
      isPlaybackPaused: false,
      isLiveInputActive: false,
      naturalRingdownActive: false,
    };

    expect(isPreparedFileAwaitingPlayback(readyStatus)).toBe(true);
    for (const closedStatus of [
      { isAudioLoaded: false },
      { hasPreparedFileAnalysisSource: false },
      { isPlaying: true },
      { isPlaybackPaused: true },
      { naturalRingdownActive: true },
      {
        sourceSession: {
          ...readyStatus.sourceSession,
          phase: AUDIO_SOURCE_PHASES.active,
        },
      },
    ]) {
      expect(
        isPreparedFileAwaitingPlayback({
          ...readyStatus,
          ...closedStatus,
        }),
      ).toBe(false);
    }
  });
});
