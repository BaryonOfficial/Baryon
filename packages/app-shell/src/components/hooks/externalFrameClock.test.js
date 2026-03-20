import assert from "node:assert/strict";
import test from "node:test";
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

  assert.equal(clock.shouldAdvance, true);
  assert.equal(clock.frameSequence, 42);
  assert.equal(clock.deltaTime, 1 / 60);
  assert.deepEqual(clock.status, { isPlaying: true });
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

  assert.equal(clock.shouldAdvance, false);
  assert.equal(clock.frameSequence, 42);
  assert.equal(clock.time, 12);
  assert.equal(clock.deltaTime, 0);
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

  assert.equal(clock.shouldAdvance, true);
  assert.equal(clock.frameSequence, null);
  assert.equal(clock.time, 3);
  assert.equal(clock.deltaTime, 0.5);
  assert.deepEqual(clock.status, { isPlaying: false });
});
