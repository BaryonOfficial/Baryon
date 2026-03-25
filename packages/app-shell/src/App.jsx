import React from "react";

import "./App.css";
import ThreeScene from "./components/ThreeScene.jsx";
import { ListenerControls } from "./components/AudioControls.jsx";
import { AudioProvider } from "./context/AudioProvider";

const LEGAL_LINKS = [
  {
    href: "https://github.com/BaryonOfficial/Baryon",
    label: "Source",
  },
  {
    href: "https://github.com/BaryonOfficial/Baryon/blob/main/LICENSING.md",
    label: "License",
  },
];

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

function LegalLinks() {
  return LEGAL_LINKS.map((link) => (
    <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
      {link.label}
    </a>
  ));
}

export function AppFrame({ children }) {
  return (
    <div className="app-shell">
      {children}
      <div
        className="app-legal-links"
        role="contentinfo"
        aria-label="Licensing and source"
      >
        <LegalLinks />
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
            <LegalLinks />
          </div>
        </details>
      </div>
    </div>
  );
}

function App() {
  return (
    <AudioProvider platform="web">
      <AppFrame>
        <ThreeScene
          controlsOverlay={<ListenerControls showSourceLiveButton={false} />}
          showLiveInputActionInPanel
        />
      </AppFrame>
    </AudioProvider>
  );
}

export default App;
