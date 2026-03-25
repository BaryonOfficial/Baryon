import {
  LIVE_INPUT_DEVICE_KINDS,
  isLoopbackLiveInputDeviceKind,
  normalizeLiveInputDeviceKind,
} from "./inputDeviceSemantics.js";

export {
  LIVE_INPUT_DEVICE_KINDS,
  isAcousticLiveInputDeviceKind,
  isLoopbackLiveInputDeviceKind,
  getLiveInputDeviceKindLabel,
  normalizeLiveInputDeviceKind,
} from "./inputDeviceSemantics.js";

/**
 * @typedef {"auto" | "line-feed" | "acoustic-mic"} LiveInputAnalysisClass
 */

/**
 * @typedef {"line-feed" | "acoustic-mic"} ResolvedLiveInputAnalysisClass
 */

/**
 * @typedef {import("./inputDeviceSemantics.js").LiveInputDeviceKind} LiveInputDeviceKind
 */

export const LIVE_INPUT_ANALYSIS_CLASSES = Object.freeze({
  auto: "auto",
  lineFeed: "line-feed",
  acousticMic: "acoustic-mic",
});

export const DEFAULT_LIVE_INPUT_ANALYSIS_CLASS =
  LIVE_INPUT_ANALYSIS_CLASSES.auto;

export const DEFAULT_RESOLVED_LIVE_INPUT_ANALYSIS_CLASS =
  LIVE_INPUT_ANALYSIS_CLASSES.acousticMic;

const LINE_FEED_KEYWORDS = Object.freeze([
  "blackhole",
  "loopback",
  "vb-cable",
  "soundflower",
  "virtual",
  "cable",
  "aggregate",
  "syphon",
  "ndi",
  "zoomaudio",
  "obs",
  "loopback audio",
  "stereo mix",
  "what u hear",
]);

/**
 * @param {unknown} value
 * @returns {LiveInputAnalysisClass}
 */
export function normalizeLiveInputAnalysisClass(value) {
  if (value === LIVE_INPUT_ANALYSIS_CLASSES.lineFeed) {
    return LIVE_INPUT_ANALYSIS_CLASSES.lineFeed;
  }
  if (value === LIVE_INPUT_ANALYSIS_CLASSES.acousticMic) {
    return LIVE_INPUT_ANALYSIS_CLASSES.acousticMic;
  }
  if (value === LIVE_INPUT_ANALYSIS_CLASSES.auto) {
    return LIVE_INPUT_ANALYSIS_CLASSES.auto;
  }
  if (value === "voice-tone" || value === "ambient") {
    return LIVE_INPUT_ANALYSIS_CLASSES.acousticMic;
  }
  return DEFAULT_LIVE_INPUT_ANALYSIS_CLASS;
}

/**
 * @param {unknown} value
 * @returns {ResolvedLiveInputAnalysisClass}
 */
export function normalizeResolvedLiveInputAnalysisClass(value) {
  return normalizeLiveInputAnalysisClass(value) ===
    LIVE_INPUT_ANALYSIS_CLASSES.lineFeed
    ? LIVE_INPUT_ANALYSIS_CLASSES.lineFeed
    : DEFAULT_RESOLVED_LIVE_INPUT_ANALYSIS_CLASS;
}

/**
 * @param {Record<string, unknown> | undefined | null} overrides
 * @returns {Record<string, ResolvedLiveInputAnalysisClass>}
 */
export function normalizeLiveInputAnalysisOverrides(overrides) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(overrides)
      .map(([deviceId, analysisClass]) => [
        deviceId,
        normalizeLiveInputAnalysisClass(analysisClass),
      ])
      .filter(
        ([deviceId, analysisClass]) =>
          typeof deviceId === "string" &&
          deviceId.length > 0 &&
          analysisClass !== LIVE_INPUT_ANALYSIS_CLASSES.auto,
      ),
  );
}

export function isLikelyLineFeedDeviceLabel(label = "") {
  const normalizedLabel = String(label).trim().toLowerCase();
  if (!normalizedLabel) {
    return false;
  }

  return LINE_FEED_KEYWORDS.some((keyword) =>
    normalizedLabel.includes(keyword),
  );
}

/**
 * @param {{
 *   liveInputKind?: import("./inputDeviceSemantics.js").LiveInputDeviceKind | null,
 *   liveInputDeviceKind?: import("./inputDeviceSemantics.js").LiveInputDeviceKind | null,
 *   selectedDeviceId?: string | null,
 *   selectedDeviceLabel?: string,
 *   analysisClass?: LiveInputAnalysisClass,
 *   overrides?: Record<string, unknown>,
 * }=} param0
 * @returns {ResolvedLiveInputAnalysisClass}
 */
export function resolveLiveInputAnalysisClass({
  liveInputKind = null,
  liveInputDeviceKind = liveInputKind,
  selectedDeviceId = null,
  selectedDeviceLabel = "",
  analysisClass = DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
  overrides = undefined,
} = {}) {
  const resolvedLiveInputDeviceKind =
    liveInputDeviceKind == null
      ? null
      : normalizeLiveInputDeviceKind(liveInputDeviceKind);

  if (
    resolvedLiveInputDeviceKind === LIVE_INPUT_DEVICE_KINDS.loopback ||
    isLoopbackLiveInputDeviceKind(liveInputKind)
  ) {
    return LIVE_INPUT_ANALYSIS_CLASSES.lineFeed;
  }

  const normalizedOverrides = normalizeLiveInputAnalysisOverrides(overrides);
  const normalizedAnalysisClass =
    normalizeLiveInputAnalysisClass(analysisClass);
  const overrideClass =
    selectedDeviceId != null
      ? normalizeLiveInputAnalysisClass(normalizedOverrides[selectedDeviceId])
      : DEFAULT_LIVE_INPUT_ANALYSIS_CLASS;

  if (
    overrideClass === LIVE_INPUT_ANALYSIS_CLASSES.lineFeed ||
    overrideClass === LIVE_INPUT_ANALYSIS_CLASSES.acousticMic
  ) {
    return overrideClass;
  }

  if (
    normalizedAnalysisClass === LIVE_INPUT_ANALYSIS_CLASSES.lineFeed ||
    normalizedAnalysisClass === LIVE_INPUT_ANALYSIS_CLASSES.acousticMic
  ) {
    return normalizedAnalysisClass;
  }

  return isLikelyLineFeedDeviceLabel(selectedDeviceLabel)
    ? LIVE_INPUT_ANALYSIS_CLASSES.lineFeed
    : LIVE_INPUT_ANALYSIS_CLASSES.acousticMic;
}
