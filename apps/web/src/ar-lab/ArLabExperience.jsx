import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Canvas } from "@react-three/fiber";
import { XR, createXRStore } from "@react-three/xr";
import {
  AmbientLight,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from "three";
import {
  AdvancedControlsDock,
  AUDIO_FEATURE_AUTHORITY_ROLES,
  AudioProvider,
  BaryonScene,
  CAMERA_CONTROL_MODES,
  ControlsProvider,
  ListenerControls,
  LiveInputStatusPanel,
  createBaryonRenderer,
  createPlaybackAudioCaptureStream,
  readPlaybackAudioCaptureStatus,
  useAudio,
  useAudioScene,
  useControlsActions,
  useControlsSnapshot,
  useControlsStore,
} from "@baryon/app-shell";
import { AR_SUPPORT_STATUS } from "./arSupportProbe.js";
import { createArLabControlsStore } from "./arLabControlsStore.js";
import { createArLabXrStoreOptions } from "./arLabXrStoreOptions.js";
import {
  AR_LAB_PREVIEW_CAMERA,
  AR_LAB_PREVIEW_CAMERA_TARGET,
} from "./arLabPreviewCamera.js";
import { AR_LAB_MODES } from "./arLabRoute.js";
import { createIdleHandAnchorState } from "./handAnchor.js";
import { CAMERA_HAND_TRACKING_STATUS } from "./cameraHandTrackingStatus.js";
import { createRecordingController } from "./recordingController.js";
import { createLiveInputRecordingCaptureStream } from "./liveInputRecordingCapture.js";
import ArLabChrome, { ArLabBrand } from "./ArLabChrome.jsx";
import ArOrbRig from "./ArOrbRig.jsx";
import ArRecordingDock from "./ArRecordingDock.jsx";
import BaryonCameraHandBridge from "./BaryonCameraHandBridge.jsx";
import BaryonXrHandBridge from "./BaryonXrHandBridge.jsx";

// Warm cinematic backdrop for the pre-camera landing; the webcam feed covers it
// once camera mode is live.
const STAGE_BACKDROP =
  "radial-gradient(125% 95% at 50% 24%, #1b1209 0%, #0d0a07 56%, #060402 100%)";
const CAMERA_PRESET_BACKGROUND_SRC =
  "/assets/ar-lab/baryon-founder-background.jpg";
const CAMERA_BACKGROUND_MODES = Object.freeze({
  none: "none",
  preset: "preset",
  custom: "custom",
});
/** @typedef {(typeof CAMERA_BACKGROUND_MODES)[keyof typeof CAMERA_BACKGROUND_MODES]} CameraBackgroundMode */
const ADVANCED_CONTROLS_DOCK_WIDTH = "min(17.5rem, calc(100vw - 2.4rem))";

const AR_CAMERA_PRESENTATION_CSS = `
.arl-camera-feed {
  transition: none !important;
}

.arl-camera-feed[data-camera-visible="true"] {
  opacity: 1 !important;
}

.arl-camera-feed[data-camera-visible="false"] {
  opacity: 0 !important;
}
`;

const AR_AUDIO_CONTROLS_CSS = `
.arl-live-input-panel {
  position: fixed;
  top: calc(max(0.9rem, env(safe-area-inset-top)) + 3.35rem);
  right: max(0.9rem, env(safe-area-inset-right));
  z-index: 24;
  pointer-events: auto;
}

.arl-live-input-panel [data-testid="live-input-status-panel"] {
  box-shadow: 0 0.7rem 2.2rem rgba(0, 0, 0, 0.42) !important;
}

@media (max-width: 52rem) {
  .arl-live-input-panel {
    left: max(0.7rem, env(safe-area-inset-left));
    right: max(0.7rem, env(safe-area-inset-right));
    top: calc(max(0.7rem, env(safe-area-inset-top)) + 3.2rem);
  }

  .arl-live-input-panel [data-testid="live-input-status-panel"] {
    width: 100% !important;
    box-sizing: border-box;
  }
}
`;

function aimCameraAtDefaultTarget({ camera }) {
  camera.lookAt(...AR_LAB_PREVIEW_CAMERA_TARGET);
}

function createXrCanvasGl(glDefaults) {
  return createBaryonRenderer(glDefaults, false, { xrMode: true });
}

function resolveCanvasDevicePixelRatio() {
  if (typeof window === "undefined") {
    return 1;
  }
  return Math.max(1, window.devicePixelRatio || 1);
}

function cameraApiAvailable() {
  return typeof globalThis.navigator?.mediaDevices?.getUserMedia === "function";
}

/**
 * Reads the live WebXR session from the store outside the R3F tree so the DOM
 * overlay can switch between the landing console and in-session chrome.
 *
 * @param {import("@react-three/xr").XRStore} xrStore
 */
function useXrSession(xrStore) {
  return useSyncExternalStore(
    xrStore.subscribe,
    () => xrStore.getState().session ?? null,
    () => null,
  );
}

/**
 * Milestone 0 hardware proof: WebGPU renderer + XR host + one inert sphere.
 * No Baryon pipeline, providers, audio, controls, hands, or recording.
 */
function HostProofScene() {
  const proofGroup = useMemo(() => {
    const group = new Group();

    const sphere = new Mesh(
      new SphereGeometry(0.12, 48, 32),
      new MeshStandardMaterial({
        color: "#8fd3ff",
        roughness: 0.35,
        metalness: 0.1,
      }),
    );
    sphere.position.set(0, 1.2, -0.6);
    group.add(sphere);

    group.add(new AmbientLight("#ffffff", 0.6));
    const keyLight = new DirectionalLight("#ffffff", 1.4);
    keyLight.position.set(1, 2, 1);
    group.add(keyLight);

    return group;
  }, []);

  useEffect(
    () => () => {
      proofGroup.traverse((object) => {
        const disposable = /** @type {any} */ (object);
        disposable.geometry?.dispose?.();
        disposable.material?.dispose?.();
      });
    },
    [proofGroup],
  );

  // eslint-disable-next-line react/no-unknown-property
  return <primitive object={proofGroup} />;
}

function HostProofExperience({ xrStore, canEnterAr }) {
  const xrSession = useXrSession(xrStore);

  return (
    <div style={{ position: "absolute", inset: 0, background: STAGE_BACKDROP }}>
      <ArLabChrome
        mode={xrSession ? "xr" : "none"}
        canUseCamera={false}
        canEnterAr={canEnterAr}
        cameraApiAvailable={false}
        cameraStatus={{ phase: CAMERA_HAND_TRACKING_STATUS.idle, error: null }}
        onStartCamera={() => {}}
        onEnterAr={() => xrStore.enterAR()}
        onExit={() => void xrSession?.end?.()}
      />
      <Canvas
        style={{ position: "absolute", inset: 0, zIndex: 1 }}
        dpr={resolveCanvasDevicePixelRatio()}
        camera={AR_LAB_PREVIEW_CAMERA}
        onCreated={aimCameraAtDefaultTarget}
        // @ts-ignore — WebGPURenderer is runtime-compatible; R3F types predate WebGPU
        gl={createXrCanvasGl}
      >
        <XR store={xrStore}>
          <HostProofScene />
        </XR>
      </Canvas>
    </div>
  );
}

function ArLabAudioControls({
  showLiveInputPanel,
  controlsState,
  onMicControlChange,
}) {
  return (
    <>
      <style>{AR_AUDIO_CONTROLS_CSS}</style>
      <ListenerControls showSourceLiveButton={false} />
      {showLiveInputPanel ? (
        <div className="arl-live-input-panel">
          <LiveInputStatusPanel
            stacked
            visible
            showLiveAction
            deviceSelectTestId="ar-lab-live-input-device-select"
            echoCancellation={Boolean(controlsState.echoCancellation)}
            noiseSuppression={Boolean(controlsState.noiseSuppression)}
            autoGainControl={Boolean(controlsState.autoGainControl)}
            onMicControlChange={onMicControlChange}
          />
        </div>
      ) : null}
    </>
  );
}

function ArOrbExperience({ xrStore, canEnterAr }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const backgroundImageRef = useRef(null);
  const personCanvasRef = useRef(null);
  const backgroundFileInputRef = useRef(null);
  const controlsRef = useControlsStore().controlsRef;
  const { updateControl } = useControlsActions();
  const controlsState = useControlsSnapshot(
    (snapshot) => snapshot.controlsState,
  );
  const {
    setIsEngineReady,
    setLiveInputRuntimeStatus,
    liveInputUiState,
    liveInputErrorCode,
  } = useAudioScene();
  const { isLiveInputActive, selectedLiveDeviceId, selectedSource } =
    useAudio();
  const anchorStateRef = useRef(createIdleHandAnchorState());
  const selectedLiveDeviceIdRef = useRef(selectedLiveDeviceId);
  selectedLiveDeviceIdRef.current = selectedLiveDeviceId;

  const xrSession = useXrSession(xrStore);
  const [cameraRequested, setCameraRequested] = useState(false);
  const [cameraStatus, setCameraStatus] = useState({
    phase: CAMERA_HAND_TRACKING_STATUS.idle,
    error: null,
  });
  const [cameraBackgroundMode, setCameraBackgroundMode] = useState(
    /** @type {CameraBackgroundMode} */ (CAMERA_BACKGROUND_MODES.none),
  );
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState(null);
  const cameraBackgroundModeRef = useRef(cameraBackgroundMode);
  const customBackgroundUrlRef = useRef(customBackgroundUrl);
  cameraBackgroundModeRef.current = cameraBackgroundMode;
  customBackgroundUrlRef.current = customBackgroundUrl;

  // Immersive AR and the webcam are mutually exclusive hand-tracking inputs.
  const cameraActive = cameraRequested && !xrSession;
  const mode = xrSession ? "xr" : cameraActive ? "camera" : "none";
  const activeBackgroundSrc =
    cameraBackgroundMode === CAMERA_BACKGROUND_MODES.custom
      ? customBackgroundUrl
      : CAMERA_PRESET_BACKGROUND_SRC;
  const cameraBackgroundUsesImage =
    cameraBackgroundMode === CAMERA_BACKGROUND_MODES.preset ||
    (cameraBackgroundMode === CAMERA_BACKGROUND_MODES.custom &&
      Boolean(customBackgroundUrl));
  const imageBackgroundActive = cameraActive && cameraBackgroundUsesImage;
  const showCameraAudioControls = mode === "camera";
  const showLiveInputPanel =
    showCameraAudioControls &&
    (selectedSource === "system" || isLiveInputActive);

  useEffect(() => {
    if (xrSession && cameraRequested) {
      setCameraRequested(false);
      setCameraBackgroundMode(CAMERA_BACKGROUND_MODES.none);
    }
  }, [xrSession, cameraRequested]);

  const handleCameraStatus = useCallback((status) => {
    setCameraStatus(status);
  }, []);

  const requestCustomBackgroundUpload = useCallback(() => {
    backgroundFileInputRef.current?.click();
  }, []);

  const handleCameraBackgroundModeChange = useCallback(
    (nextMode) => {
      if (
        nextMode === CAMERA_BACKGROUND_MODES.custom &&
        !customBackgroundUrlRef.current
      ) {
        requestCustomBackgroundUpload();
        return;
      }
      setCameraBackgroundMode(nextMode);
    },
    [requestCustomBackgroundUpload],
  );

  const handleCustomBackgroundFileChange = useCallback((event) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = "";

    if (!file || !file.type.startsWith("image/")) {
      return;
    }

    const previousUrl = customBackgroundUrlRef.current;
    const nextUrl = URL.createObjectURL(file);
    customBackgroundUrlRef.current = nextUrl;
    setCustomBackgroundUrl(nextUrl);
    setCameraBackgroundMode(CAMERA_BACKGROUND_MODES.custom);

    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
  }, []);

  useEffect(
    () => () => {
      if (customBackgroundUrlRef.current) {
        URL.revokeObjectURL(customBackgroundUrlRef.current);
        customBackgroundUrlRef.current = null;
      }
    },
    [],
  );

  const recordingControllerRef = useRef(null);
  if (!recordingControllerRef.current) {
    recordingControllerRef.current = createRecordingController({
      // The person-cutout canvas renders before the R3F canvas in the DOM, so a
      // bare `querySelector("canvas")` grabs the cutout. Select the Baryon
      // render canvas explicitly by excluding the cutout.
      resolveSourceCanvas: () =>
        containerRef.current?.querySelector(
          'canvas:not([data-testid="ar-lab-camera-person-cutout"])',
        ) ?? null,
      resolveSourceVideo: () =>
        videoRef.current?.srcObject ? videoRef.current : null,
      resolveSourcePersonCanvas: () => {
        const currentMode = cameraBackgroundModeRef.current;
        const hasImageBackground =
          currentMode === CAMERA_BACKGROUND_MODES.preset ||
          (currentMode === CAMERA_BACKGROUND_MODES.custom &&
            Boolean(customBackgroundUrlRef.current));
        if (!hasImageBackground) {
          return null;
        }
        return personCanvasRef.current?.width > 0
          ? personCanvasRef.current
          : null;
      },
      resolveSourceBackgroundImage: () => {
        const currentMode = cameraBackgroundModeRef.current;
        const hasImageBackground =
          currentMode === CAMERA_BACKGROUND_MODES.preset ||
          (currentMode === CAMERA_BACKGROUND_MODES.custom &&
            Boolean(customBackgroundUrlRef.current));
        if (!hasImageBackground) {
          return null;
        }
        return backgroundImageRef.current?.complete
          ? backgroundImageRef.current
          : null;
      },
      readAudioStatus: readPlaybackAudioCaptureStatus,
      createAudioCapture: (audioStatus) =>
        audioStatus?.isLiveInputActive
          ? createLiveInputRecordingCaptureStream(
              selectedLiveDeviceIdRef.current,
            )
          : createPlaybackAudioCaptureStream(),
    });
  }

  useEffect(
    () => () => {
      recordingControllerRef.current?.dispose();
    },
    [],
  );

  useEffect(() => {
    if (mode !== "camera") {
      recordingControllerRef.current?.cancelRecording();
    }
  }, [mode]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        background: STAGE_BACKDROP,
        isolation: "isolate",
      }}
    >
      <style>{AR_CAMERA_PRESENTATION_CSS}</style>
      <video
        ref={videoRef}
        className="arl-camera-feed"
        data-testid="ar-lab-camera-feed"
        data-camera-visible={
          cameraActive && !imageBackgroundActive ? "true" : "false"
        }
        playsInline
        muted
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scaleX(-1)",
          background: "#000",
          zIndex: 0,
          opacity: cameraActive && !imageBackgroundActive ? 1 : 0,
          pointerEvents: "none",
        }}
      />

      <input
        ref={backgroundFileInputRef}
        data-testid="ar-lab-background-file"
        type="file"
        accept="image/*"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleCustomBackgroundFileChange}
        style={{ display: "none" }}
      />

      <img
        ref={backgroundImageRef}
        aria-hidden="true"
        data-testid="ar-lab-camera-background"
        src={activeBackgroundSrc ?? CAMERA_PRESET_BACKGROUND_SRC}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
          objectFit: "cover",
          opacity: imageBackgroundActive ? 1 : 0,
          transition: "opacity 420ms ease",
          pointerEvents: "none",
        }}
      />

      <canvas
        ref={personCanvasRef}
        aria-hidden="true"
        data-testid="ar-lab-camera-person-cutout"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 2,
          opacity: imageBackgroundActive ? 1 : 0,
          transition: "opacity 420ms ease",
          pointerEvents: "none",
        }}
      />

      <Canvas
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 3,
          background: "transparent",
          mixBlendMode: mode === "camera" ? "screen" : "normal",
        }}
        dpr={resolveCanvasDevicePixelRatio()}
        camera={AR_LAB_PREVIEW_CAMERA}
        onCreated={aimCameraAtDefaultTarget}
        // @ts-ignore — WebGPURenderer is runtime-compatible; R3F types predate WebGPU
        gl={createXrCanvasGl}
      >
        <XR store={xrStore}>
          <BaryonXrHandBridge
            anchorStateRef={anchorStateRef}
            enabled={Boolean(xrSession)}
          />
          <ArOrbRig anchorStateRef={anchorStateRef}>
            <Suspense fallback={null}>
              <BaryonScene
                setIsEngineReady={setIsEngineReady}
                setLiveInputRuntimeStatus={setLiveInputRuntimeStatus}
                liveInputUiState={liveInputUiState}
                liveInputErrorCode={liveInputErrorCode}
                controlsRef={controlsRef}
                visualizationMethod={controlsState.visualizationMethod}
                performanceProfile={controlsState.renderQualityPreset}
                customTargetFps={controlsState.customTargetFps}
                traaEnabled={controlsState.traaEnabled !== false}
                onPerformanceHudSnapshotChange={null}
                audioFeatureAuthorityRole={
                  AUDIO_FEATURE_AUTHORITY_ROLES.localProducer
                }
                cameraControlMode={CAMERA_CONTROL_MODES.spatialSession}
              />
            </Suspense>
          </ArOrbRig>
        </XR>
      </Canvas>

      <BaryonCameraHandBridge
        active={cameraActive}
        videoRef={videoRef}
        personCanvasRef={personCanvasRef}
        personSegmentationEnabled={imageBackgroundActive}
        anchorStateRef={anchorStateRef}
        onStatusChange={handleCameraStatus}
      />

      <ArLabChrome
        mode={mode}
        canUseCamera={cameraApiAvailable()}
        canEnterAr={canEnterAr}
        cameraApiAvailable={cameraApiAvailable()}
        cameraStatus={cameraStatus}
        showBrand={!showCameraAudioControls}
        cameraBackgroundMode={cameraBackgroundMode}
        hasCustomCameraBackground={Boolean(customBackgroundUrl)}
        onCameraBackgroundModeChange={handleCameraBackgroundModeChange}
        onUploadCameraBackground={requestCustomBackgroundUpload}
        onStartCamera={() => {
          setCameraBackgroundMode(CAMERA_BACKGROUND_MODES.none);
          setCameraRequested(true);
        }}
        onEnterAr={() => xrStore.enterAR()}
        onExit={() => {
          if (xrSession) {
            void xrSession.end?.();
          } else {
            setCameraBackgroundMode(CAMERA_BACKGROUND_MODES.none);
            setCameraRequested(false);
          }
        }}
      />

      {showCameraAudioControls ? (
        <>
          <AdvancedControlsDock
            visible
            dockWidth={ADVANCED_CONTROLS_DOCK_WIDTH}
            brandAccessory={<ArLabBrand />}
          />
          <ArLabAudioControls
            showLiveInputPanel={showLiveInputPanel}
            controlsState={controlsState}
            onMicControlChange={(key, value) => updateControl(key, value)}
          />
        </>
      ) : null}

      {mode === "camera" ? (
        <ArRecordingDock
          controller={recordingControllerRef.current}
          audio={null}
        />
      ) : null}
    </div>
  );
}

/**
 * @param {{
 *   mode: "host-proof" | "full",
 *   arSupport?: {
 *     status: "checking" | "supported" | "preview" | "unsupported",
 *     diagnostics?: string[],
 *   },
 * }} props
 */
export default function ArLabExperience({ mode, arSupport }) {
  const isHostProof = mode === AR_LAB_MODES.hostProof;
  const canEnterAr = arSupport?.status === AR_SUPPORT_STATUS.supported;

  const xrStoreRef = useRef(null);
  if (!xrStoreRef.current) {
    xrStoreRef.current = createXRStore(createArLabXrStoreOptions());
  }

  const controlsStoreRef = useRef(null);
  if (!isHostProof && !controlsStoreRef.current) {
    controlsStoreRef.current = createArLabControlsStore();
  }

  useEffect(
    () => () => {
      controlsStoreRef.current?.dispose();
    },
    [],
  );

  if (isHostProof) {
    return (
      <HostProofExperience
        xrStore={xrStoreRef.current}
        canEnterAr={canEnterAr}
      />
    );
  }

  return (
    <AudioProvider platform="web">
      <ControlsProvider store={controlsStoreRef.current}>
        <ArOrbExperience xrStore={xrStoreRef.current} canEnterAr={canEnterAr} />
      </ControlsProvider>
    </AudioProvider>
  );
}
