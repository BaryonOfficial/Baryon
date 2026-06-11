import {
  BROWSER_FAILURE_CODES,
  BROWSER_FAMILY,
  BROWSER_PLATFORM,
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
  background: "var(--nd-surface)",
  boxShadow: "var(--nd-shell-shadow)",
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

const DESKTOP_BROWSER_RECOMMENDATION =
  "Use a Chromium-based desktop browser, such as Brave, Chrome, or Edge.";

const DEFAULT_WARNING_COPY = {
  eyebrow: "Compatibility",
  title: "Open Baryon on desktop",
  message:
    "This device or browser does not provide the graphics support the visualizer needs.",
  recommendation: DESKTOP_BROWSER_RECOMMENDATION,
};

function getWarningCopy(reason, probe) {
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
    platform === BROWSER_PLATFORM.macos &&
    browserFamily === BROWSER_FAMILY.safari
  ) {
    return DEFAULT_WARNING_COPY;
  }

  if (
    platform === BROWSER_PLATFORM.linux &&
    browserFamily === BROWSER_FAMILY.chromium
  ) {
    return DEFAULT_WARNING_COPY;
  }

  if (
    platform === BROWSER_PLATFORM.linux &&
    browserFamily === BROWSER_FAMILY.firefox
  ) {
    return DEFAULT_WARNING_COPY;
  }

  return DEFAULT_WARNING_COPY;
}

const UnsupportedWarning = ({ reason = "browser", probe = null }) => {
  const warningCopy = getWarningCopy(reason, probe);

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
          <p style={eyebrowStyle}>{warningCopy.eyebrow}</p>
        </div>

        <h1 id="unsupported-warning-title" style={headingStyle}>
          {warningCopy.title}
        </h1>

        <p id="unsupported-warning-message" style={messageStyle}>
          {warningCopy.message}
        </p>

        <p style={recommendationStyle}>{warningCopy.recommendation}</p>
      </div>
    </section>
  );
};

export default UnsupportedWarning;
