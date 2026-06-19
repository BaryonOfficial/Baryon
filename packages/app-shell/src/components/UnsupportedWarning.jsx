import { useState } from "react";

import {
  BROWSER_FAILURE_CODES,
  BROWSER_FAMILY,
  BROWSER_PLATFORM,
  formatSupportProbeForClipboard,
} from "./browserSupport.js";

/** @type {import("react").CSSProperties} */
const containerStyle = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  overflowY: "auto",
  height: "100vh",
  minHeight: "100dvh",
  padding: "24px",
  background:
    "linear-gradient(180deg, rgba(13, 10, 7, 0.98) 0%, rgba(21, 16, 10, 0.96) 100%)",
  color: "var(--nd-text-primary)",
  zIndex: 1000,
  fontFamily: "var(--baryon-type-interface-family)",
};

/** @type {import("react").CSSProperties} */
const panelStyle = {
  width: "min(100%, 520px)",
  boxSizing: "border-box",
  border: "1px solid var(--nd-border-visible)",
  borderRadius: "8px",
  background: "color-mix(in srgb, var(--nd-surface) 94%, #000 6%)",
  boxShadow: "inset 0 1px 0 rgba(232, 223, 208, 0.06)",
  padding: "clamp(22px, 4vw, 34px)",
};

/** @type {import("react").CSSProperties} */
const brandRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  marginBottom: "16px",
};

/** @type {import("react").CSSProperties} */
const logoStyle = {
  flex: "0 0 auto",
  width: "28px",
  height: "24px",
  opacity: 0.92,
};

/** @type {import("react").CSSProperties} */
const eyebrowStyle = {
  margin: 0,
  color: "var(--nd-text-secondary)",
  fontFamily: "var(--baryon-type-mono-family)",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "var(--baryon-type-action-letter-spacing)",
  lineHeight: 1.2,
  textTransform: "uppercase",
};

/** @type {import("react").CSSProperties} */
const headingStyle = {
  margin: 0,
  color: "var(--nd-text-display)",
  fontSize: "24px",
  fontWeight: 600,
  lineHeight: 1.12,
};

/** @type {import("react").CSSProperties} */
const messageStyle = {
  margin: "12px 0 0",
  color: "var(--nd-text-secondary)",
  fontSize: "14px",
  lineHeight: 1.55,
};

/** @type {import("react").CSSProperties} */
const recommendationStyle = {
  margin: "16px 0 0",
  borderLeft: "2px solid var(--nd-warning)",
  paddingLeft: "14px",
  color: "var(--nd-text-primary)",
  fontSize: "13px",
  lineHeight: 1.5,
};

/** @type {import("react").CSSProperties} */
const recoveryStepsStyle = {
  ...recommendationStyle,
  display: "grid",
  gap: "8px",
  listStylePosition: "outside",
  paddingLeft: "30px",
};

/** @type {import("react").CSSProperties} */
const diagnosticStyle = {
  margin: "14px 0 0",
  color: "var(--nd-text-secondary)",
  fontFamily: "var(--baryon-type-mono-family)",
  fontSize: "12px",
  lineHeight: 1.4,
};

/** @type {import("react").CSSProperties} */
const actionsStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "10px",
  marginTop: "18px",
};

/** @type {import("react").CSSProperties} */
const buttonStyle = {
  appearance: "none",
  border: "1px solid var(--nd-border-visible)",
  borderRadius: "6px",
  background: "var(--nd-surface-raised)",
  color: "var(--nd-text-primary)",
  cursor: "pointer",
  fontFamily: "var(--baryon-type-interface-family)",
  fontSize: "13px",
  fontWeight: 600,
  lineHeight: 1,
  padding: "10px 12px",
};

/** @type {import("react").CSSProperties} */
const secondaryButtonStyle = {
  ...buttonStyle,
  background: "transparent",
  color: "var(--nd-text-secondary)",
};

const DESKTOP_BROWSER_RECOMMENDATION =
  "Use a Chromium-based desktop browser, such as Brave, Chrome, or Edge.";

const CHROMIUM_RECOVERY_STEPS = [
  "Open your browser's Settings, then go to System or System and performance.",
  'Search for "graphics acceleration" or "hardware acceleration".',
  "Turn it on, relaunch the browser, then return to Baryon.",
];

const LINUX_CHROMIUM_RECOVERY_STEPS = [
  "Open your browser's Settings, then go to System or System and performance.",
  'Turn on "graphics acceleration" or "hardware acceleration".',
  'Open your browser\'s flags or experiments page and enable "Unsafe WebGPU Support" and "Vulkan".',
  "Relaunch the browser, then return to Baryon.",
];

const DEFAULT_WARNING_COPY = {
  eyebrow: "Compatibility",
  title: "Open Baryon on desktop",
  message:
    "This device or browser does not provide the graphics support the visualizer needs.",
  recommendation: DESKTOP_BROWSER_RECOMMENDATION,
};

function resolveWarningContent(reason, probe) {
  const failureCode = probe?.failureCode;
  const platform = probe?.platform;
  const browserFamily = probe?.browserFamily;
  const guidanceSummary = probe?.guidance?.summary ?? "";

  if (
    reason === "mobile" ||
    failureCode === BROWSER_FAILURE_CODES.mobileUnsupported
  ) {
    return DEFAULT_WARNING_COPY;
  }

  if (
    platform === BROWSER_PLATFORM.macos &&
    browserFamily === BROWSER_FAMILY.safari &&
    /Lockdown Mode/i.test(guidanceSummary)
  ) {
    return {
      eyebrow: "Compatibility",
      title: "Open Baryon on desktop",
      message:
        "Safari is hiding required browser features for this site, so Baryon cannot start here.",
      recommendation:
        "Turn off Lockdown Mode for this site, then reload, or use a Chromium-based desktop browser such as Brave, Chrome, or Edge.",
    };
  }

  if (
    platform === BROWSER_PLATFORM.linux &&
    browserFamily === BROWSER_FAMILY.chromium
  ) {
    return {
      eyebrow: "Compatibility",
      title: "Linux WebGPU setup required",
      message:
        "On Linux, Chromium-based browsers may need graphics acceleration plus WebGPU and Vulkan flags before Baryon can start.",
      recoverySteps: LINUX_CHROMIUM_RECOVERY_STEPS,
    };
  }

  if (browserFamily === BROWSER_FAMILY.chromium) {
    return {
      eyebrow: "Compatibility",
      title: "Graphics acceleration required",
      message:
        "Baryon needs browser graphics acceleration so this Chromium-based browser can expose the visualizer's WebGPU renderer.",
      recoverySteps: CHROMIUM_RECOVERY_STEPS,
    };
  }

  return DEFAULT_WARNING_COPY;
}

const UnsupportedWarning = ({ reason = "browser", probe = null }) => {
  const [copyState, setCopyState] = useState(null);
  const warningContent = resolveWarningContent(reason, probe);
  const failureCode = probe?.failureCode ?? null;

  const retrySupportCheck = () => {
    globalThis.location?.reload?.();
  };

  const copyDiagnostics = async () => {
    try {
      if (typeof globalThis.navigator?.clipboard?.writeText !== "function") {
        throw new Error("Clipboard API unavailable");
      }

      await globalThis.navigator.clipboard.writeText(
        formatSupportProbeForClipboard(probe),
      );
      setCopyState("diagnostics-copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section
      aria-describedby="unsupported-warning-message"
      aria-labelledby="unsupported-warning-title"
      role="alert"
      style={containerStyle}
    >
      <div style={panelStyle}>
        <div style={brandRowStyle}>
          <img
            alt="Baryon"
            src="/assets/BaryonLogoWhite.svg"
            style={logoStyle}
          />
          <p style={eyebrowStyle}>{warningContent.eyebrow}</p>
        </div>

        <h1 id="unsupported-warning-title" style={headingStyle}>
          {warningContent.title}
        </h1>

        <p id="unsupported-warning-message" style={messageStyle}>
          {warningContent.message}
        </p>

        {warningContent.recoverySteps?.length ? (
          <ol style={recoveryStepsStyle}>
            {warningContent.recoverySteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : (
          <p style={recommendationStyle}>{warningContent.recommendation}</p>
        )}

        {failureCode ? (
          <p aria-label="Diagnostic code" style={diagnosticStyle}>
            Diagnostic code: <code>{failureCode}</code>
          </p>
        ) : null}

        {probe ? (
          <div style={actionsStyle}>
            <button
              onClick={retrySupportCheck}
              style={buttonStyle}
              type="button"
            >
              Try again
            </button>
            <button
              onClick={copyDiagnostics}
              style={secondaryButtonStyle}
              type="button"
            >
              {copyState === "diagnostics-copied"
                ? "Diagnostics copied"
                : "Copy diagnostics"}
            </button>
            {copyState === "failed" ? (
              <span style={diagnosticStyle}>
                Copy unavailable. Use the diagnostic code above for support.
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default UnsupportedWarning;
