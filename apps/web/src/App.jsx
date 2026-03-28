import React from "react";
import {
  AppFrame,
  AudioProvider,
  ListenerControls,
  SceneSurface,
} from "@baryon/app-shell";

export default function App() {
  return (
    <AudioProvider platform="web">
      <AppFrame>
        <SceneSurface
          controlsOverlay={<ListenerControls showSourceLiveButton={false} />}
          liveInputPanel={{ showAction: true }}
        />
      </AppFrame>
    </AudioProvider>
  );
}
