import { useEffect, useState } from "react";
import { AR_SUPPORT_STATUS, probeArLabSupport } from "./arSupportProbe.js";
import { resolveArLabMode } from "./arLabRoute.js";
import ArLabExperience from "./ArLabExperience.jsx";

/** @type {import("react").CSSProperties} */
const rootStyle = {
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(125% 95% at 50% 24%, #1b1209 0%, #0d0a07 56%, #060402 100%)",
  color: "var(--nd-text-display, #e8dfd0)",
  fontFamily: "var(--baryon-type-interface-family, system-ui, sans-serif)",
  overflow: "hidden",
};

const SCREEN_CSS = `
.arl-screen {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1.5rem;
  text-align: center;
}

.arl-screen__mark {
  display: inline-flex;
  width: 3rem;
  height: 3rem;
  color: var(--nd-accent, #f2a05c);
}

.arl-screen__mark svg { width: 100%; height: 100%; }

.arl-screen__mark--pulse svg { animation: arl-screen-pulse 2.4s ease-in-out infinite; }

@keyframes arl-screen-pulse {
  0%, 100% { opacity: 0.55; transform: scale(0.97); }
  50% { opacity: 1; transform: scale(1.03); }
}

.arl-screen__kicker {
  font-family: var(--baryon-type-mono-family, ui-monospace, monospace);
  font-size: 0.6rem;
  font-weight: 500;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--nd-text-secondary, #9a8e7e);
}

.arl-screen__panel {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  width: min(30rem, calc(100vw - 2rem));
  padding: 1.3rem 1.4rem;
  border-radius: 1.15rem;
  border: 1px solid color-mix(in srgb, var(--nd-text-display, #e8dfd0) 12%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--nd-surface-raised, #1c1510) 97%, #000),
    color-mix(in srgb, var(--nd-surface, #15100a) 99%, #000)
  );
  box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.45);
  text-align: left;
}

.arl-screen__title {
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.arl-screen__body {
  font-size: 0.86rem;
  line-height: 1.45;
  color: var(--nd-text-secondary, #9a8e7e);
}

.arl-screen__body code {
  font-family: var(--baryon-type-mono-family, ui-monospace, monospace);
  font-size: 0.78em;
  color: var(--nd-text-display, #e8dfd0);
}

.arl-screen__diags {
  margin: 0;
  padding: 0.7rem 0.85rem;
  list-style: none;
  border-radius: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--nd-text-display, #e8dfd0) 8%, transparent);
  background: color-mix(in srgb, var(--nd-surface, #15100a) 60%, #000);
  font-family: var(--baryon-type-mono-family, ui-monospace, monospace);
  font-size: 0.68rem;
  line-height: 1.5;
  color: var(--nd-text-secondary, #9a8e7e);
}

.arl-screen__link {
  align-self: flex-start;
  margin-top: 0.2rem;
  color: var(--nd-accent, #f2a05c);
  font-size: 0.84rem;
  font-weight: 600;
  text-decoration: none;
}

.arl-screen__link:hover { text-decoration: underline; }
`;

function OrbMark({ pulse = false }) {
  return (
    <span className={`arl-screen__mark${pulse ? " arl-screen__mark--pulse" : ""}`}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" opacity="0.45" />
        <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.4" opacity="0.75" />
        <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      </svg>
    </span>
  );
}

/**
 * Hidden `/ar-lab` route shell. Owns lab eligibility through the AR-specific
 * support probe (secure context, WebGPU adapter, WebXR, `immersive-ar`) and
 * intentionally applies none of the main app's mobile blocking: headsets
 * identify as mobile browsers.
 */
export default function ArLabApp() {
  const [probe, setProbe] = useState(null);

  useEffect(() => {
    let cancelled = false;
    void probeArLabSupport().then((result) => {
      if (!cancelled) {
        setProbe(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!probe) {
    return (
      <div className="app-shell" data-testid="ar-lab-root" style={rootStyle}>
        <style>{SCREEN_CSS}</style>
        <div className="arl-screen" data-testid="ar-lab-checking">
          <OrbMark pulse />
          <span className="arl-screen__kicker">Baryon AR Lab</span>
          <span className="arl-screen__body">Checking this device…</span>
        </div>
      </div>
    );
  }

  if (probe.status === AR_SUPPORT_STATUS.unsupported) {
    return (
      <div className="app-shell" data-testid="ar-lab-root" style={rootStyle}>
        <style>{SCREEN_CSS}</style>
        <div className="arl-screen">
          <OrbMark />
          <span className="arl-screen__kicker">Baryon AR Lab</span>
          <div
            className="arl-screen__panel"
            data-testid="ar-lab-unsupported"
            data-failure-code={probe.failureCode ?? ""}
          >
            <div className="arl-screen__title">
              This device can&apos;t run the AR Lab
            </div>
            <div className="arl-screen__body">
              The lab renders Baryon in WebGPU, which needs a secure context and a
              GPU adapter. Camera mode works on any recent desktop browser;
              immersive AR also needs a WebXR headset with{" "}
              <code>immersive-ar</code>, such as the Meta Quest Browser.
            </div>
            <ul className="arl-screen__diags">
              {probe.diagnostics.map((diagnostic) => (
                <li key={diagnostic}>{diagnostic}</li>
              ))}
            </ul>
            <a className="arl-screen__link" href="/">
              ← Back to Baryon
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell" data-testid="ar-lab-root" style={rootStyle}>
      <ArLabExperience
        mode={resolveArLabMode(globalThis.location?.search ?? "")}
        arSupport={probe}
      />
    </div>
  );
}
