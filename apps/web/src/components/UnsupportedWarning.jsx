import React from "react";

const listStyle = {
  margin: "8px 0 0",
  padding: 0,
  listStyle: "none",
  fontFamily: "monospace",
  fontSize: "12px",
  lineHeight: 1.5,
  opacity: 0.95,
};

const itemStyle = {
  margin: 0,
};

const UnsupportedWarning = ({ reason = "browser", details = [] }) => (
  <div
    style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: "rgba(255, 0, 0, 0.8)",
      color: "white",
      padding: "10px",
      textAlign: "center",
      zIndex: 1000,
    }}
  >
    <div>
      {reason === "mobile"
        ? "Baryon runs best on desktop. Mobile support is currently degraded, so please open the web app on a desktop browser."
        : "The music visualizer requires a working WebGPU stack. The startup diagnostics below show the exact failure."}
    </div>
    {details.length > 0 && (
      <ul style={listStyle} aria-label="WebGPU diagnostics">
        {details.map((detail) => (
          <li key={detail} style={itemStyle}>
            {detail}
          </li>
        ))}
      </ul>
    )}
  </div>
);

export default UnsupportedWarning;
