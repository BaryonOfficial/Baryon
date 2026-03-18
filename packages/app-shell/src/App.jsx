import React from "react";

import "./App.css";
import ThreeScene from "./components/ThreeScene.jsx";
import { AudioProvider } from "./context/AudioProvider";

function LinkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 0 0 7.07 0l3.18-3.18a5 5 0 0 0-7.07-7.07L11 5" />
      <path d="M14 11a5 5 0 0 0-7.07 0L3.76 14.18a5 5 0 1 0 7.07 7.07L13 19" />
    </svg>
  );
}

function App() {
  return (
    <AudioProvider>
      <div className="app-shell">
        <ThreeScene />
        <div
          className="app-legal-links"
          role="contentinfo"
          aria-label="Licensing and source"
        >
          <a
            href="https://github.com/BaryonOfficial/Baryon"
            target="_blank"
            rel="noreferrer"
          >
            Source
          </a>
          <a
            href="https://github.com/BaryonOfficial/Baryon/blob/main/LICENSING.md"
            target="_blank"
            rel="noreferrer"
          >
            License
          </a>
        </div>
        <div className="app-legal-mobile">
          <details className="app-legal-mobile-details">
            <summary
              className="app-legal-mobile-summary"
              aria-label="Licensing and source"
              title="Licensing and source"
            >
              <LinkIcon />
            </summary>
            <div className="app-legal-mobile-menu">
              <a
                href="https://github.com/BaryonOfficial/Baryon"
                target="_blank"
                rel="noreferrer"
              >
                Source
              </a>
              <a
                href="https://github.com/BaryonOfficial/Baryon/blob/main/LICENSING.md"
                target="_blank"
                rel="noreferrer"
              >
                License
              </a>
            </div>
          </details>
        </div>
      </div>
    </AudioProvider>
  );
}

export default App;
