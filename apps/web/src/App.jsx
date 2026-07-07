import React, { useEffect, useRef } from "react";
import {
  AppFrame,
  AudioProvider,
  ControlsProvider,
  ListenerControls,
  SceneSurface,
  createControlsStore,
} from "@baryon/app-shell";
import ArLabLaunchButton from "./ar-lab/ArLabLaunchButton.jsx";

export default function App() {
  const controlsStoreRef = useRef(null);

  if (!controlsStoreRef.current) {
    controlsStoreRef.current = createControlsStore();
  }

  useEffect(
    () => () => {
      controlsStoreRef.current?.dispose();
    },
    [],
  );

  return (
    <AudioProvider platform="web">
      <ControlsProvider store={controlsStoreRef.current}>
        <AppFrame>
          <SceneSurface
            controlsOverlay={<ListenerControls showSourceLiveButton={false} />}
            liveInputPanel={{ showAction: true }}
            controlsBrandAccessory={<ArLabLaunchButton />}
          />
        </AppFrame>
      </ControlsProvider>
    </AudioProvider>
  );
}
