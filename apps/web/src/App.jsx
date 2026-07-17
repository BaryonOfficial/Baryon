import React, { useEffect, useState } from "react";
import {
  AppFrame,
  AudioProvider,
  ControlsProvider,
  ListenerControls,
  SceneSurface,
  createControlsStore,
  useFullscreenUiPreference,
} from "@baryon/app-shell";
import ArLabLaunchButton from "./ar-lab/ArLabLaunchButton.jsx";

export default function App() {
  const [controlsStore] = useState(createControlsStore);
  const { showUiInFullscreen, setShowUiInFullscreen } =
    useFullscreenUiPreference();

  useEffect(
    () => () => {
      controlsStore.dispose();
    },
    [controlsStore],
  );

  return (
    <AudioProvider platform="web">
      <ControlsProvider store={controlsStore}>
        <AppFrame>
          <SceneSurface
            controlsOverlay={<ListenerControls showSourceLiveButton={false} />}
            liveInputPanel={{ showAction: true }}
            controlsBrandAccessory={<ArLabLaunchButton />}
            showUiInFullscreen={showUiInFullscreen}
            onShowUiInFullscreenChange={setShowUiInFullscreen}
          />
        </AppFrame>
      </ControlsProvider>
    </AudioProvider>
  );
}
