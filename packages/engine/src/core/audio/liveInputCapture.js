import { AUDIO_DEFAULTS } from "../../defaults.js";
import { isLoopbackLiveInputDeviceKind } from "./inputDeviceSemantics.js";

export function normalizeLiveInputCaptureSettings(settings = {}) {
  return {
    echoCancellation: Boolean(
      settings.echoCancellation ?? AUDIO_DEFAULTS.echoCancellation,
    ),
    noiseSuppression: Boolean(
      settings.noiseSuppression ?? AUDIO_DEFAULTS.noiseSuppression,
    ),
    autoGainControl: Boolean(
      settings.autoGainControl ?? AUDIO_DEFAULTS.autoGainControl,
    ),
  };
}

export function cloneLiveInputCaptureSettings(settings) {
  return {
    echoCancellation: Boolean(settings?.echoCancellation),
    noiseSuppression: Boolean(settings?.noiseSuppression),
    autoGainControl: Boolean(settings?.autoGainControl),
  };
}

export function areLiveInputCaptureSettingsEqual(left, right) {
  return (
    Boolean(left?.echoCancellation) === Boolean(right?.echoCancellation) &&
    Boolean(left?.noiseSuppression) === Boolean(right?.noiseSuppression) &&
    Boolean(left?.autoGainControl) === Boolean(right?.autoGainControl)
  );
}

function normalizeGetUserMediaDeviceId(deviceId) {
  return typeof deviceId === "string" && deviceId !== "default"
    ? deviceId
    : null;
}

export function isDefaultAudioInputDeviceId(deviceId) {
  return deviceId == null || deviceId === "default";
}

export function buildAcousticLiveInputConstraints(deviceId, captureSettings) {
  const exactDeviceId = normalizeGetUserMediaDeviceId(deviceId);
  return {
    ...(exactDeviceId ? { deviceId: { exact: exactDeviceId } } : {}),
    ...cloneLiveInputCaptureSettings(captureSettings),
  };
}

function buildLoopbackInputConstraints(deviceId) {
  const exactDeviceId = normalizeGetUserMediaDeviceId(deviceId);
  return {
    ...(exactDeviceId ? { deviceId: { exact: exactDeviceId } } : {}),
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
}

export function buildLiveInputConstraints(
  liveInputDeviceKind,
  deviceId,
  captureSettings,
) {
  return isLoopbackLiveInputDeviceKind(liveInputDeviceKind)
    ? buildLoopbackInputConstraints(deviceId)
    : buildAcousticLiveInputConstraints(deviceId, captureSettings);
}

function normalizeAudioDeviceLabel(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeAudioDeviceLabelKey(value) {
  return normalizeAudioDeviceLabel(value).toLowerCase();
}
