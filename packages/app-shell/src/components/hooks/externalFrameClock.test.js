import { expect, test } from "vitest";
import { AUDIO_FEATURE_AUTHORITY_ROLES } from "@baryon/engine/audio-features";
import { getSourceAuthoritativeClock } from "./externalFrameClock.js";

test("a revocation draw holds the last displayed audio time with zero new elapsed samples", () => {
  expect(
    getSourceAuthoritativeClock({
      audioFeatureAuthorityRole: AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
      externalFrameState: null,
      lastAppliedFrameSequence: "stream:2",
      lastAppliedFrameTime: 4,
      fallbackClockSnapshot: { time: 100, deltaTime: 1 },
    }),
  ).toMatchObject({
    time: 4,
    deltaTime: 0,
    shouldAdvance: false,
    clockMode: "external-hold",
  });
});

test("passes through source timing for a new external frame sequence", () => {
  const clock = getSourceAuthoritativeClock({
    audioFeatureAuthorityRole: AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
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
    audioFeatureAuthorityRole: AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
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
    audioFeatureAuthorityRole: AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
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
    audioFeatureAuthorityRole: AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
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
    audioFeatureAuthorityRole: AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
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

test("external display delta spans accepted audio endpoints rather than one skipped packet", () => {
  const clock = getSourceAuthoritativeClock({
    audioFeatureAuthorityRole: "external-consumer",
    externalFrameState: {
      frameSequence: 10,
      frameIdentity: "source-2:10",
      time: 1.05,
      deltaTime: 512 / 48000,
    },
    lastAppliedFrameSequence: "source-2:7",
    lastAppliedFrameTime: 1,
  });
  expect(clock.deltaTime).toBeCloseTo(0.05);
  const held = getSourceAuthoritativeClock({
    audioFeatureAuthorityRole: "external-consumer",
    externalFrameState: {
      frameSequence: 10,
      frameIdentity: "source-2:10",
      time: 1.05,
      deltaTime: 512 / 48000,
    },
    lastAppliedFrameSequence: "source-2:10",
    lastAppliedFrameTime: 1.05,
  });
  expect(held.deltaTime).toBe(0);
  expect(held.shouldAdvance).toBe(false);
  const replaced = getSourceAuthoritativeClock({
    audioFeatureAuthorityRole: "external-consumer",
    externalFrameState: {
      frameSequence: 1,
      frameIdentity: "source-3:1",
      time: 512 / 48000,
      deltaTime: 512 / 48000,
    },
    lastAppliedFrameSequence: "source-2:10",
    lastAppliedFrameTime: 1.05,
  });
  expect(replaced.deltaTime).toBe(512 / 48000);
  expect(replaced.shouldAdvance).toBe(true);
});
