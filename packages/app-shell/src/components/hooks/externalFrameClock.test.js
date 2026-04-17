import { expect, test } from "vitest";
import { getSourceAuthoritativeClock } from "./externalFrameClock.js";

test("passes through source timing for a new external frame sequence", () => {
  const clock = getSourceAuthoritativeClock({
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

test("falls back to local audio timing when no external frame is present", () => {
  const clock = getSourceAuthoritativeClock({
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
