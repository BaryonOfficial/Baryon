import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AR_ORB_BASE_SCALE,
  DEFAULT_AR_ORB_POSE,
  resolveOrbPoseEaseHalfLifeSeconds,
  resolveOrbTargetPose,
  stepOrbPoseToward,
} from "./arOrbPose.js";

/** @returns {import("./arOrbPose.js").OrbPose} */
function cloneDefaultPose() {
  return {
    position: { ...DEFAULT_AR_ORB_POSE.position },
    quaternion: { ...DEFAULT_AR_ORB_POSE.quaternion },
    scale: DEFAULT_AR_ORB_POSE.scale,
  };
}

/**
 * Applies the eased hand-anchor pose to the orb group each frame.
 * Reads the anchor ref only; hand frames never trigger React updates here.
 *
 * @param {{
 *   anchorStateRef: { current: import("./handAnchor.js").HandAnchorState },
 *   resetSignal?: number,
 *   children: import("react").ReactNode,
 * }} props
 */
export default function ArOrbRig({
  anchorStateRef,
  resetSignal = 0,
  children,
}) {
  const groupRef = useRef(null);
  const poseRef = useRef(cloneDefaultPose());

  // A change in resetSignal snaps the orb back to its default resting pose.
  useEffect(() => {
    poseRef.current = cloneDefaultPose();
  }, [resetSignal]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    const anchorState = anchorStateRef.current;
    const target = resolveOrbTargetPose(anchorState);
    poseRef.current = stepOrbPoseToward(poseRef.current, target, delta, {
      halfLifeSeconds: resolveOrbPoseEaseHalfLifeSeconds(anchorState),
    });

    const pose = poseRef.current;
    group.position.set(pose.position.x, pose.position.y, pose.position.z);
    group.quaternion.set(
      pose.quaternion.x,
      pose.quaternion.y,
      pose.quaternion.z,
      pose.quaternion.w,
    );
    const scale = AR_ORB_BASE_SCALE * pose.scale;
    group.scale.set(scale, scale, scale);
  });

  return <group ref={groupRef}>{children}</group>;
}
