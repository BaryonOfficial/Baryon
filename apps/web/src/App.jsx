import React from "react";

import "./App.css";
import ThreeScene from "./components/ThreeScene.jsx";
import { AudioProvider } from "./context/AudioProvider";

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
      </div>
    </AudioProvider>
  );
}

export default App;
