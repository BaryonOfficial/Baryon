import React from "react";

function App() {
  return (
    <main className="desktop-shell">
      <section className="desktop-shell__hero">
        <p className="desktop-shell__eyebrow">Desktop Shell</p>
        <h1>Baryon for Tauri</h1>
        <p className="desktop-shell__lede">
          The legacy desktop visualizer surface has been removed. This app is now a clean starting
          point for building the native desktop experience.
        </p>
      </section>

      <section className="desktop-shell__panel">
        <h2>Ready Now</h2>
        <ul className="desktop-shell__list">
          <li>Vite + React frontend wired for Tauri dev on port `1420`.</li>
          <li>Minimal Rust backend scaffold kept intact under `src-tauri`.</li>
          <li>No legacy Three.js, audio, or desktop-only visualizer code remaining.</li>
        </ul>
      </section>

      <section className="desktop-shell__panel">
        <h2>Next Steps</h2>
        <ul className="desktop-shell__list">
          <li>Add Tauri commands in Rust and call them from the React shell.</li>
          <li>Introduce native window controls, filesystem access, or updater flows as needed.</li>
          <li>Layer the actual desktop product UI on top of this shell instead of reviving old web code.</li>
        </ul>
      </section>

      <section className="desktop-shell__panel desktop-shell__panel--links">
        <h2>Source And License</h2>
        <p className="desktop-shell__copy">
          Distributed builds should make the repo and licensing terms easy to verify.
        </p>
        <div className="desktop-shell__links">
          <a href="https://github.com/BaryonOfficial/Baryon" target="_blank" rel="noreferrer">
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
      </section>
    </main>
  );
}

export default App;
