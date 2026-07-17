import { expect, test } from "vitest";
import { AUDIO_FEATURE_AUTHORITY_ROLES } from "@baryon/engine/audio-features";
import { getSourceAuthoritativeClock } from "./externalFrameClock.js";

test("passes through source timing for a new external frame sequence", () => {
  const clock = getSourceAuthoritativeClock({
    audioFeatureAuthorityRole:
      AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
    externalFrameState: {
      status: { isPlaying: true },
      clockMode: "realtime",
      time: 12,
      deltaTime: 1 / 60,
      frameSequence: 42,
    },
    lastAppliedFrameSequence: 41,
    fallbackClockSnapshot: {
      status: { isPlaying: false },
      clockMode: "paused-playback",
      time: 0,
      deltaTime: 0,
    },
  });

  expect(clock.shouldAdvance).toBe(true);
  expect(clock.frameSequence).toBe(42);
  expect(clock.deltaTime).toBe(1 / 60);
  expect(clock.status).toStrictEqual({ isPlaying: true });
});

test("zeros duplicate external frame deltas while keeping the source clock", () => {
  const clock = getSourceAuthoritativeClock({
    audioFeatureAuthorityRole:
      AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
    externalFrameState: {
      status: { isPlaying: true },
      clockMode: "realtime",
      time: 12,
      deltaTime: 1 / 60,
      frameSequence: 42,
    },
    lastAppliedFrameSequence: 42,
    fallbackClockSnapshot: {
      status: { isPlaying: false },
      clockMode: "paused-playback",
      time: 0,
      deltaTime: 0,
    },
  });

  expect(clock.shouldAdvance).toBe(false);
  expect(clock.frameSequence).toBe(42);
  expect(clock.time).toBe(12);
  expect(clock.deltaTime).toBe(0);
});

test("uses frame creation time to dedupe external frames without a source sequence", () => {
  const firstClock = getSourceAuthoritativeClock({
    audioFeatureAuthorityRole:
      AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
    externalFrameState: {
      status: { isPlaying: true },
      clockMode: "external-preview",
      time: 12,
      deltaTime: 1 / 30,
      frameCreatedAtMs: 1234,
    },
    lastAppliedFrameSequence: null,
    fallbackClockSnapshot: {
      status: { isPlaying: false },
      clockMode: "paused-playback",
      time: 0,
      deltaTime: 0,
    },
  });
  const duplicateClock = getSourceAuthoritativeClock({
    audioFeatureAuthorityRole:
      AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
    externalFrameState: {
      status: { isPlaying: true },
      clockMode: "external-preview",
      time: 12,
      deltaTime: 1 / 30,
      frameCreatedAtMs: 1234,
    },
    lastAppliedFrameSequence: firstClock.frameIdentity,
    fallbackClockSnapshot: {
      status: { isPlaying: false },
      clockMode: "paused-playback",
      time: 0,
      deltaTime: 0,
    },
  });

  expect(firstClock.shouldAdvance).toBe(true);
  expect(firstClock.frameSequence).toBeNull();
  expect(firstClock.frameIdentity).toBe("created:1234");
  expect(firstClock.deltaTime).toBe(1 / 30);
  expect(duplicateClock.shouldAdvance).toBe(false);
  expect(duplicateClock.frameSequence).toBeNull();
  expect(duplicateClock.frameIdentity).toBe("created:1234");
  expect(duplicateClock.deltaTime).toBe(0);
});

test("falls back to local audio timing when no external frame is present", () => {
  const clock = getSourceAuthoritativeClock({
    audioFeatureAuthorityRole: AUDIO_FEATURE_AUTHORITY_ROLES.localProducer,
    externalFrameState: null,
    lastAppliedFrameSequence: 42,
    fallbackClockSnapshot: {
      status: { isPlaying: false },
      clockMode: "paused-playback",
      time: 3,
      deltaTime: 0.5,
    },
  });

  expect(clock.shouldAdvance).toBe(true);
  expect(clock.frameSequence).toBeNull();
  expect(clock.time).toBe(3);
  expect(clock.deltaTime).toBe(0.5);
  expect(clock.status).toStrictEqual({ isPlaying: false });
});

test("holds external authority without falling back when a frame is absent", () => {
  const clock = getSourceAuthoritativeClock({
    audioFeatureAuthorityRole:
      AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
    externalFrameState: null,
    lastAppliedFrameSequence: 42,
    fallbackClockSnapshot: {
      status: { isPlaying: true },
      clockMode: "realtime",
      time: 3,
      deltaTime: 0.5,
    },
  });

  expect(clock).toStrictEqual({
    status: null,
    clockMode: "external-hold",
    time: 0,
    deltaTime: 0,
    frameSequence: null,
    frameIdentity: null,
    shouldAdvance: false,
  });
});

test("local authority ignores stray external frame content", () => {
  const fallbackClockSnapshot = {
    status: { isPlaying: true },
    clockMode: "realtime",
    time: 7,
    deltaTime: 1 / 60,
  };
  const clock = getSourceAuthoritativeClock({
    audioFeatureAuthorityRole: AUDIO_FEATURE_AUTHORITY_ROLES.localProducer,
    externalFrameState: {
      status: { isPlaying: false },
      clockMode: "external-preview",
      time: 12,
      deltaTime: 1 / 30,
      frameSequence: 42,
    },
    lastAppliedFrameSequence: 41,
    fallbackClockSnapshot,
  });

  expect(clock).toStrictEqual({
    ...fallbackClockSnapshot,
    frameSequence: null,
    frameIdentity: null,
    shouldAdvance: true,
  });
});
