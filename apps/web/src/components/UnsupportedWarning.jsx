import React from "react";

const UnsupportedWarning = ({ reason = "browser" }) => (
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
    {reason === "mobile"
      ? "Baryon runs best on desktop. Mobile support is currently degraded, so please open the web app on a desktop browser."
      : "The music visualizer requires a browser with WebGPU support. Please switch to a WebGPU-capable desktop browser and try again."}
  </div>
);

export default UnsupportedWarning;
