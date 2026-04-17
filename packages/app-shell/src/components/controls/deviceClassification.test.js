import { beforeEach, expect, test } from "vitest";
import {
  classifyLiveInputDeviceKind,
  clearDeviceOverride,
  getDeviceKindOverride,
  getLiveInputDeviceKind,
  getLiveInputDeviceKindById,
  saveLiveInputDeviceKindOverride,
} from "./deviceClassification.js";
import { installLocalStorageMock } from "../../test/installLocalStorageMock.js";

/** @returns {MediaDeviceInfo} */
function createDevice(overrides = {}) {
  return {
    deviceId: "device-1",
    label: "Built-in Microphone",
    kind: /** @type {MediaDeviceKind} */ ("audioinput"),
    groupId: "group-1",
    toJSON() {
      return this;
    },
    ...overrides,
  };
}

beforeEach(() => {
  installLocalStorageMock();
  localStorage.clear();
});

test("classifies loopback labels and applies manual override lookups", () => {
  const builtInMic = createDevice();
  const loopback = createDevice({
    deviceId: "device-2",
    label: "BlackHole 2ch",
  });

  expect(classifyLiveInputDeviceKind(builtInMic)).toBe("live");
  expect(classifyLiveInputDeviceKind(loopback)).toBe("system");
  expect(getLiveInputDeviceKind(loopback)).toBe("system");

  saveLiveInputDeviceKindOverride(loopback.deviceId, "live");

  expect(getDeviceKindOverride(loopback.deviceId)).toBe("live");
  expect(getLiveInputDeviceKind(loopback)).toBe("live");
  expect(
    getLiveInputDeviceKindById([builtInMic, loopback], loopback.deviceId),
  ).toBe("live");

  clearDeviceOverride(loopback.deviceId);

  expect(getDeviceKindOverride(loopback.deviceId)).toBeNull();
  expect(getLiveInputDeviceKind(loopback)).toBe("system");
});
