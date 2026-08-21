import { afterEach, describe, expect, it, vi } from "vitest";
import {
  observeAudioTransportClock,
  publishAudioTransportClock,
  resetAudioTransportClock,
} from "./audioTransportClock.js";
import * as audioTransportClockModule from "./audioTransportClock.js";

describe("audioTransportClock observers", () => {
  afterEach(() => {
    resetAudioTransportClock();
  });

  it("delivers cached and live snapshots without echoing publications", () => {
    publishAudioTransportClock({
      currentTimeSeconds: 3,
      durationSeconds: 120,
      canSeek: true,
    });
    const observer = vi.fn();
    const unsubscribe = observeAudioTransportClock(observer);

    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer).toHaveBeenLastCalledWith({
      currentTimeSeconds: 3,
      durationSeconds: 120,
      canSeek: true,
    });

    for (
      let currentTimeSeconds = 4;
      currentTimeSeconds <= 103;
      currentTimeSeconds += 1
    ) {
      publishAudioTransportClock({
        currentTimeSeconds,
        durationSeconds: 120,
        canSeek: true,
      });
    }

    expect(observer).toHaveBeenCalledTimes(101);
    expect(observer).toHaveBeenLastCalledWith({
      currentTimeSeconds: 103,
      durationSeconds: 120,
      canSeek: true,
    });

    unsubscribe();
    unsubscribe();
    publishAudioTransportClock({
      currentTimeSeconds: 104,
      durationSeconds: 120,
      canSeek: true,
    });
    expect(observer).toHaveBeenCalledTimes(101);
  });

  it("publishes reset state to active observers", () => {
    const observer = vi.fn();
    const unsubscribe = observeAudioTransportClock(observer);
    publishAudioTransportClock({
      currentTimeSeconds: 12,
      durationSeconds: 90,
      canSeek: true,
    });

    resetAudioTransportClock();

    expect(observer).toHaveBeenLastCalledWith({
      currentTimeSeconds: 0,
      durationSeconds: 0,
      canSeek: false,
    });
    unsubscribe();
  });

  it("keeps every published cached snapshot immutable", () => {
    const observer = vi.fn();
    const unsubscribe = observeAudioTransportClock(observer);

    const publishedSnapshot = publishAudioTransportClock({
      currentTimeSeconds: 12,
      durationSeconds: 90,
      canSeek: true,
    });

    expect(Object.isFrozen(publishedSnapshot)).toBe(true);
    expect(Object.isFrozen(observer.mock.lastCall?.[0])).toBe(true);
    unsubscribe();
  });

  it("keeps snapshot reads and React subscriptions private", () => {
    expect("getAudioTransportClockSnapshot" in audioTransportClockModule).toBe(
      false,
    );
    expect("useAudioTransportClock" in audioTransportClockModule).toBe(false);
  });
});
