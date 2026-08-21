export function clonePlaybackDiagnostics(diagnostics) {
  if (!diagnostics) {
    return null;
  }

  return {
    ...diagnostics,
    contextStateTransitions: Array.isArray(diagnostics.contextStateTransitions)
      ? diagnostics.contextStateTransitions.map((transition) => ({
          ...transition,
        }))
      : [],
    lastContextStateChange: diagnostics.lastContextStateChange
      ? { ...diagnostics.lastContextStateChange }
      : null,
    lastResumeAttempt: diagnostics.lastResumeAttempt
      ? { ...diagnostics.lastResumeAttempt }
      : null,
  };
}

export function cloneLiveInputInterruptionDiagnostics(diagnostics) {
  return diagnostics ? { ...diagnostics } : null;
}

function cloneTrackRecord(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (Array.isArray(entry)) {
        return [key, [...entry]];
      }
      if (entry && typeof entry === "object") {
        return [key, { ...entry }];
      }
      return [key, entry];
    }),
  );
}

function readTrackMethodRecord(track, methodName) {
  try {
    const method = track?.[methodName];
    return typeof method === "function"
      ? cloneTrackRecord(method.call(track))
      : {};
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildLiveInputTrackDiagnostics(track, stream) {
  if (!track) {
    return {
      present: false,
      streamActive: Boolean(stream?.active),
      id: null,
      label: "",
      kind: null,
      enabled: null,
      muted: null,
      readyState: null,
      settings: {},
      constraints: {},
      capabilities: {},
    };
  }

  return {
    present: true,
    streamActive: Boolean(stream?.active),
    id: typeof track.id === "string" ? track.id : null,
    label: typeof track.label === "string" ? track.label : "",
    kind: typeof track.kind === "string" ? track.kind : null,
    enabled: typeof track.enabled === "boolean" ? track.enabled : null,
    muted: typeof track.muted === "boolean" ? track.muted : null,
    readyState: typeof track.readyState === "string" ? track.readyState : null,
    settings: readTrackMethodRecord(track, "getSettings"),
    constraints: readTrackMethodRecord(track, "getConstraints"),
    capabilities: readTrackMethodRecord(track, "getCapabilities"),
  };
}
