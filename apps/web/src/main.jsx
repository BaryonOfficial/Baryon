import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { AppErrorBoundary } from "@baryon/app-shell";
import App from "./App.jsx";
// Hidden WebXR AR lab. Branches before AudioProvider/ControlsProvider so the
// lab owns its own provider composition.
import ArLabApp from "./ar-lab/ArLabAppLazy.jsx";
import { isArLabPath } from "./ar-lab/arLabRoute.js";
import "./index.css";

if (
  import.meta.env.DEV &&
  import.meta.env.VITE_BARYON_RAYMARCH_AUDIT_FIXTURE === "1"
) {
  const { installRaymarchAuditFixtureBridge } =
    await import("./devtools/raymarchAuditFixtureBridge.js");
  installRaymarchAuditFixtureBridge();
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Baryon web root element #root is missing.");
}

ReactDOM.createRoot(rootElement).render(
  <AppErrorBoundary surfaceName="Baryon Web">
    {isArLabPath(window.location.pathname) ? (
      <Suspense fallback={null}>
        <ArLabApp />
      </Suspense>
    ) : (
      <>
        <App />
        <Analytics />
        <SpeedInsights />
      </>
    )}
  </AppErrorBoundary>,
);
