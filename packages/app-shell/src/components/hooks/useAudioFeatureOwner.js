import { useEffect, useLayoutEffect, useMemo } from "react";
import { getDefaultAudioSession } from "@baryon/engine/audio";
import {
  AUDIO_FEATURE_AUTHORITY_ROLES,
  createRendererFeatureView,
} from "@baryon/engine/audio-features";
import {
  CAVITY_ACOUSTIC_DEFAULTS,
  SIMULATION_DEFAULTS,
} from "@baryon/engine/defaults";
import { buildAuditControlSnapshot } from "@baryon/engine/controls/runtime";
import { subscribeControlsChanged } from "../../controls/controlsEvents.js";

function apparatusConfiguration(controls = {}) {
  return {
    radius: SIMULATION_DEFAULTS.radius,
    cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
    boundaryMode: controls.boundaryMode ?? SIMULATION_DEFAULTS.boundaryMode,
    cavityGeometry:
      controls.cavityGeometry ?? SIMULATION_DEFAULTS.cavityGeometry,
    auditSettings: buildAuditControlSnapshot(controls),
  };
}

/** Explicit host commands, outside Canvas. Unmount only removes the UI listener;
 * the audio session owns its processor until an explicit source/resource reset. */
export function useAudioFeatureOwner({
  controlsRef,
  authorityRole = /** @type {"local-producer" | "external-consumer"} */ (
    AUDIO_FEATURE_AUTHORITY_ROLES.localProducer
  ),
  configurationVersion = 0,
  registerStructureExportSampleReader = null,
  audioSession = getDefaultAudioSession(),
}) {
  const runtime = audioSession.featureRuntime;
  useLayoutEffect(() => {
    if (authorityRole === AUDIO_FEATURE_AUTHORITY_ROLES.localProducer) {
      // Apply the apparatus before a consumer -> producer transition can prepare
      // the active source. Mirror controls never configure a physical producer.
      runtime.configure(apparatusConfiguration(controlsRef?.current));
    }
    runtime.setAuthorityRole(authorityRole);
  }, [runtime, authorityRole, configurationVersion, controlsRef]);

  useEffect(() => {
    if (authorityRole !== AUDIO_FEATURE_AUTHORITY_ROLES.localProducer)
      return undefined;
    return subscribeControlsChanged((event) => {
      runtime.configure(
        apparatusConfiguration(event?.detail ?? controlsRef?.current),
      );
    });
  }, [runtime, authorityRole, controlsRef]);
  const reader = useMemo(
    () => () => {
      const model = runtime.readLatestFeatureModel();
      if (!model) return null;
      const controls = controlsRef?.current;
      return {
        featureFrame: createRendererFeatureView(model),
        materialControls: {
          colorMode: controls?.colorMode,
          volumeColorRgb: controls?.volumeColor,
          surfaceColorRgb: controls?.surfaceColor,
          spectralChroma: controls?.spectralChroma,
        },
      };
    },
    [runtime, controlsRef],
  );
  useEffect(() => {
    if (!registerStructureExportSampleReader) return undefined;
    registerStructureExportSampleReader(
      authorityRole === AUDIO_FEATURE_AUTHORITY_ROLES.localProducer
        ? reader
        : null,
    );
    return () => registerStructureExportSampleReader(null);
  }, [authorityRole, reader, registerStructureExportSampleReader]);
  return runtime;
}
