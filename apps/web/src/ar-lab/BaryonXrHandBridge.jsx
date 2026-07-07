import { useFrame } from "@react-three/fiber";
import { useXRInputSourceState } from "@react-three/xr";
import {
  HAND_ANCHOR_SOURCES,
  deriveHandAnchorState,
} from "./handAnchor.js";
import { readHandJointSnapshot } from "./xrHandJoints.js";

/**
 * Owns frame-local WebXR hand snapshots. Every XR frame it derives a fresh
 * hand anchor state into `anchorStateRef`. It writes nothing else: no React
 * state, no control store, no session or audio side effects.
 *
 * @param {{
 *   anchorStateRef: { current: import("./handAnchor.js").HandAnchorState },
 *   enabled?: boolean,
 * }} props
 */
export default function BaryonXrHandBridge({ anchorStateRef, enabled = true }) {
  const leftHand = useXRInputSourceState("hand", "left");
  const rightHand = useXRInputSourceState("hand", "right");

  useFrame((rootState, delta, frame) => {
    if (!enabled) {
      return;
    }

    const referenceSpace = rootState.gl.xr?.getReferenceSpace?.() ?? null;
    const hands = [leftHand, rightHand]
      .map((hand) =>
        readHandJointSnapshot(frame, referenceSpace, hand?.inputSource),
      )
      .filter(Boolean);

    anchorStateRef.current = deriveHandAnchorState({
      previous: anchorStateRef.current,
      hands,
      nowMs:
        typeof performance !== "undefined" ? performance.now() : Date.now(),
      dtMs: delta * 1000,
      handSourceAvailable: Boolean(
        leftHand?.inputSource || rightHand?.inputSource,
      ),
      source: HAND_ANCHOR_SOURCES.webxrHand,
    });
  });

  return null;
}
