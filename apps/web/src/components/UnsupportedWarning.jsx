import React, { useState } from "react";
import {
  formatSupportProbeForClipboard,
  getSupportProbeTechnicalDetails,
} from "./browserSupport.js";

/** @type {import("react").CSSProperties} */
const containerStyle = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  backgroundColor: "rgba(120, 8, 8, 0.94)",
  color: "white",
  padding: "14px 16px",
  zIndex: 1000,
  boxShadow: "0 -10px 30px rgba(0, 0, 0, 0.35)",
};

/** @type {import("react").CSSProperties} */
const headingStyle = {
  margin: 0,
  fontSize: "15px",
  fontWeight: 600,
  lineHeight: 1.4,
};

/** @type {import("react").CSSProperties} */
const listStyle = {
  margin: "10px 0 0 18px",
  padding: 0,
  lineHeight: 1.5,
};

/** @type {import("react").CSSProperties} */
const metaListStyle = {
  margin: "10px 0 0",
  padding: 0,
  listStyle: "none",
  fontFamily: "monospace",
  fontSize: "12px",
  lineHeight: 1.5,
  opacity: 0.96,
};

/** @type {import("react").CSSProperties} */
const actionRowStyle = {
  display: "flex",
  gap: "10px",
  alignItems: "center",
  marginTop: "12px",
  flexWrap: "wrap",
};

/** @type {import("react").CSSProperties} */
const buttonStyle = {
  border: "1px solid rgba(255, 255, 255, 0.28)",
  background: "rgba(255, 255, 255, 0.12)",
  color: "white",
  borderRadius: "999px",
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: "12px",
};

function fallbackCopyText(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  fallbackCopyText(text);
}

const UnsupportedWarning = ({ reason = "browser", probe = null }) => {
  const [copyStatus, setCopyStatus] = useState("idle");
  const guidance = probe?.guidance;
  const technicalDetails = getSupportProbeTechnicalDetails(probe);

  const handleCopyDiagnostics = async () => {
    try {
      await copyText(formatSupportProbeForClipboard(probe));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  const headline =
    reason === "mobile"
      ? "Baryon runs best on desktop. Mobile browser support is currently degraded."
      : guidance?.summary ||
        "The music visualizer requires a working WebGPU stack before it can start.";

  return (
    <div style={containerStyle}>
      <p style={headingStyle}>{headline}</p>

      {guidance?.steps?.length > 0 && (
        <ul style={listStyle}>
          {guidance.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      )}

      {guidance?.caveat && (
        <p style={{ margin: "10px 0 0" }}>{guidance.caveat}</p>
      )}

      <div style={actionRowStyle}>
        <button
          type="button"
          style={buttonStyle}
          onClick={handleCopyDiagnostics}
        >
          Copy diagnostics
        </button>
        {copyStatus === "copied" && <span>Diagnostics copied.</span>}
        {copyStatus === "failed" && (
          <span>Diagnostics could not be copied automatically.</span>
        )}
      </div>

      {technicalDetails.length > 0 && (
        <details style={{ marginTop: "10px" }}>
          <summary style={{ cursor: "pointer" }}>Technical details</summary>
          <ul style={metaListStyle} aria-label="WebGPU diagnostics">
            {technicalDetails.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

export default UnsupportedWarning;
