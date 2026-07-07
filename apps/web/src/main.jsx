import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import App from "./App.jsx";
// Hidden WebXR AR lab. Branches before AudioProvider/ControlsProvider so the
// lab owns its own provider composition.
import ArLabApp from "./ar-lab/ArLabAppLazy.jsx";
import { isArLabPath } from "./ar-lab/arLabRoute.js";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Baryon web root element #root is missing.");
}

ReactDOM.createRoot(rootElement).render(
  isArLabPath(window.location.pathname) ? (
    <Suspense fallback={null}>
      <ArLabApp />
    </Suspense>
  ) : (
    <>
      <App />
      <Analytics />
      <SpeedInsights />
    </>
  ),
);
