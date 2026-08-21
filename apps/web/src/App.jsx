import React, { useEffect, useState } from "react";
import {
  AppFrame,
  AudioProvider,
  ControlsProvider,
  DEFAULT_ACTIVE_CAMERA_POSE,
  ListenerControls,
  MOBILE_DEMO_CAMERA_DISTANCE_SCALE,
  MobileDemoControls,
  SceneSurface,
  createControlsStore,
  isMobileDevice,
  useFullscreenUiPreference,
} from "@baryon/app-shell";
import ArLabLaunchButton from "./ar-lab/ArLabLaunchButton.jsx";

// Sits clear of the demo note: safe area + the note's 0.85rem offset, its
// ~1.6rem box, and a gap.
const MOBILE_DEMO_CAMERA_CONTROLS_TOP_INSET =
  "calc(env(safe-area-inset-top) + 3.1rem)";

export default function App() {
  const [controlsStore] = useState(createControlsStore);
  const mobileDemoMode = isMobileDevice();
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
            controlsOverlay={
              mobileDemoMode ? (
                <MobileDemoControls />
              ) : (
                <ListenerControls showSourceLiveButton={false} />
              )
            }
            liveInputPanel={mobileDemoMode ? null : { showAction: true }}
            controlsBrandAccessory={
              mobileDemoMode ? null : <ArLabLaunchButton />
            }
            controlsDockVisible={!mobileDemoMode}
            cameraControlsVisible
            // Clears the demo's own top-centre "Full experience on desktop"
            // line, which occupies the strip the controls normally sit in.
            cameraControlsTopInset={
              mobileDemoMode ? MOBILE_DEMO_CAMERA_CONTROLS_TOP_INSET : null
            }
            activeCameraPose={DEFAULT_ACTIVE_CAMERA_POSE}
            cameraDistanceScale={
              mobileDemoMode ? MOBILE_DEMO_CAMERA_DISTANCE_SCALE : 1
            }
            showUiInFullscreen={showUiInFullscreen}
            onShowUiInFullscreenChange={setShowUiInFullscreen}
          />
        </AppFrame>
      </ControlsProvider>
    </AudioProvider>
  );
}
