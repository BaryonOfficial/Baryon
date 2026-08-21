import { expect, test } from "vitest";

import {
  buildAnalysisSessionKey,
  buildAnalysisSourceKey,
  resolveAnalysisFrameStaleness,
} from "./analysisSession.js";

function sourceSession(kind, sessionId, timelineRevision = 0) {
  return { kind, sessionId, timelineRevision };
}

test("an explicit upstream session key remains authoritative", () => {
  expect(
    buildAnalysisSessionKey({
      sessionKey: "file:source-override",
      sourceSession: sourceSession("system", 4),
    }),
  ).toBe("file:source-override");
});

test("file analysis identity comes from the canonical source session", () => {
  expect(
    buildAnalysisSessionKey({
      sourceSession: sourceSession("file", 42),
    }),
  ).toBe("file:42");
});

test("file analysis identity follows the loaded source across playback attempts", () => {
  const status = {
    sourceSession: sourceSession("file", 7),
    playbackSessionId: "attempt-1",
  };

  expect(buildAnalysisSessionKey(status)).toBe("file:7");
  expect(
    buildAnalysisSessionKey({
      ...status,
      playbackSessionId: "attempt-2",
    }),
  ).toBe("file:7");
});

test("a seek revision creates a new deterministic file timeline identity", () => {
  const status = {
    sourceSession: sourceSession("file", 7),
  };

  expect(buildAnalysisSessionKey(status)).toBe("file:7");
  expect(
    buildAnalysisSessionKey({
      ...status,
      sourceSession: sourceSession("file", 7, 3),
    }),
  ).toBe("file:7:timeline:3");
});

test("stable file source identity excludes seek timeline revisions", () => {
  const status = {
    sourceSession: sourceSession("file", 7, 4),
  };

  expect(buildAnalysisSourceKey(status)).toBe("file:7");
  expect(buildAnalysisSessionKey(status)).toBe("file:7:timeline:4");
});

test("a loaded file owns its analysis identity before playback starts", () => {
  expect(
    buildAnalysisSessionKey({
      sourceSession: sourceSession("file", 8),
    }),
  ).toBe("file:8");
});

test("a source session without an id uses an explicit none key", () => {
  expect(buildAnalysisSessionKey({ sourceSession: { kind: "file" } })).toBe(
    "file:none",
  );
});

test("microphone capture remains part of the system analysis session", () => {
  expect(
    buildAnalysisSessionKey({
      sourceSession: {
        ...sourceSession("system", 7),
        systemCapture: { kind: "live" },
      },
    }),
  ).toBe("system:7");
});

test("loopback capture uses the system analysis session", () => {
  expect(
    buildAnalysisSessionKey({
      sourceSession: {
        ...sourceSession("system", 8),
        systemCapture: { kind: "system" },
      },
    }),
  ).toBe("system:8");
});

test("system sessions without an owner id use an explicit none key", () => {
  expect(buildAnalysisSessionKey({ sourceSession: { kind: "system" } })).toBe(
    "system:none",
  );
});

test("a live-input reconnect changes the analysis session key", () => {
  expect(
    buildAnalysisSessionKey({ sourceSession: sourceSession("system", 11) }),
  ).not.toBe(
    buildAnalysisSessionKey({ sourceSession: sourceSession("system", 12) }),
  );
});

test("missing status uses the idle analysis session", () => {
  expect(buildAnalysisSessionKey(null)).toBe("idle");
});

test("analysis frame currency rejects a previous source session", () => {
  expect(
    resolveAnalysisFrameStaleness(
      { observationSessionKey: "file:1" },
      {
        sourceSession: sourceSession("system", 2),
        isLiveInputActive: true,
      },
    ),
  ).toBe("source-session");
});

test("analysis frame currency rejects stale System transport state", () => {
  expect(
    resolveAnalysisFrameStaleness(
      {
        observationSessionKey: "system:2",
        sourceEvidence: {
          transport: { liveInputActive: true },
        },
      },
      {
        sourceSession: sourceSession("system", 2),
        isLiveInputActive: false,
      },
    ),
  ).toBe("source-state");
});

test("analysis frame currency accepts matching File and System frames", () => {
  expect(
    resolveAnalysisFrameStaleness(
      { observationSessionKey: "file:3" },
      { sourceSession: sourceSession("file", 3) },
    ),
  ).toBeNull();
  expect(
    resolveAnalysisFrameStaleness(
      {
        observationSessionKey: "system:4",
        isLiveInputActive: true,
      },
      {
        sourceSession: sourceSession("system", 4),
        isLiveInputActive: true,
      },
    ),
  ).toBeNull();
});
