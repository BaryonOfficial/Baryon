import {
  LIVE_INPUT_DEVICE_KINDS,
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
 * @typedef {"ambient" | "vocal"} LiveInputAcousticIntent
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

export const LIVE_INPUT_ACOUSTIC_INTENTS = Object.freeze({
  ambient: "ambient",
  vocal: "vocal",
});

export const DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT =
  LIVE_INPUT_ACOUSTIC_INTENTS.ambient;

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
  return DEFAULT_LIVE_INPUT_ANALYSIS_CLASS;
}

/**
 * @param {unknown} value
 * @returns {LiveInputAcousticIntent}
 */
export function normalizeLiveInputAcousticIntent(value) {
  if (value === LIVE_INPUT_ACOUSTIC_INTENTS.vocal || value === "voice-tone") {
    return LIVE_INPUT_ACOUSTIC_INTENTS.vocal;
  }
  if (value === LIVE_INPUT_ACOUSTIC_INTENTS.ambient) {
    return LIVE_INPUT_ACOUSTIC_INTENTS.ambient;
  }
  return DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT;
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
    return /** @type {Record<string, ResolvedLiveInputAnalysisClass>} */ ({});
  }

  /** @type {Record<string, ResolvedLiveInputAnalysisClass>} */
  const normalizedOverrides = {};
  for (const [deviceId, analysisClass] of Object.entries(overrides)) {
    const normalizedAnalysisClass =
      normalizeLiveInputAnalysisClass(analysisClass);
    if (
      typeof deviceId === "string" &&
      deviceId.length > 0 &&
      normalizedAnalysisClass !== LIVE_INPUT_ANALYSIS_CLASSES.auto
    ) {
      normalizedOverrides[deviceId] = normalizedAnalysisClass;
    }
  }

  return normalizedOverrides;
}

/**
 * Canonical runtime representation of live-input analysis settings.
 *
 * @param {{
 *   analysisClass?: unknown,
 *   acousticIntent?: unknown,
 *   overrides?: Record<string, unknown> | null,
 * } | null} [settings]
 * @param {{
 *   analysisClass?: unknown,
 *   acousticIntent?: unknown,
 *   overrides?: Record<string, unknown> | null,
 * } | null} [previous]
 */
export function normalizeLiveInputAnalysisSettings(
  settings = undefined,
  previous = undefined,
) {
  return {
    analysisClass: normalizeLiveInputAnalysisClass(
      settings?.analysisClass ?? previous?.analysisClass,
    ),
    acousticIntent: normalizeLiveInputAcousticIntent(
      settings?.acousticIntent ?? previous?.acousticIntent,
    ),
    overrides: normalizeLiveInputAnalysisOverrides(
      settings?.overrides ?? previous?.overrides,
    ),
  };
}

export function areLiveInputAnalysisSettingsEqual(left, right) {
  const normalizedLeft = normalizeLiveInputAnalysisSettings(left);
  const normalizedRight = normalizeLiveInputAnalysisSettings(right);
  if (
    normalizedLeft.analysisClass !== normalizedRight.analysisClass ||
    normalizedLeft.acousticIntent !== normalizedRight.acousticIntent
  ) {
    return false;
  }

  const leftKeys = Object.keys(normalizedLeft.overrides);
  const rightKeys = Object.keys(normalizedRight.overrides);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) => normalizedLeft.overrides[key] === normalizedRight.overrides[key],
    )
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
 *   liveInputDeviceKind?: import("./inputDeviceSemantics.js").LiveInputDeviceKind | null,
 *   selectedDeviceId?: string | null,
 *   selectedDeviceLabel?: string,
 *   analysisClass?: LiveInputAnalysisClass,
 *   overrides?: Record<string, unknown>,
 * }=} param0
 * @returns {ResolvedLiveInputAnalysisClass}
 */
export function resolveLiveInputAnalysisClass({
  liveInputDeviceKind = null,
  selectedDeviceId = null,
  selectedDeviceLabel = "",
  analysisClass = DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
  overrides = undefined,
} = {}) {
  const resolvedLiveInputDeviceKind =
    liveInputDeviceKind == null
      ? null
      : normalizeLiveInputDeviceKind(liveInputDeviceKind);

  if (resolvedLiveInputDeviceKind === LIVE_INPUT_DEVICE_KINDS.loopback) {
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
