export const RUNTIME_SESSION_PHASES = Object.freeze({
  starting: "starting",
  ready: "ready",
  disposing: "disposing",
  failed: "failed",
});

export const RUNTIME_RENDERER_BACKENDS = Object.freeze({
  webgpu: "webgpu",
  webgl2: "webgl2",
});

export const RUNTIME_SESSION_EVENTS = Object.freeze({
  requestBackend: "request-backend",
  disposalCompleted: "disposal-completed",
  rendererReady: "renderer-ready",
  rendererFailed: "renderer-failed",
});

export function resolveRuntimeRendererBackend(useWebGLRenderer) {
  return useWebGLRenderer
    ? RUNTIME_RENDERER_BACKENDS.webgl2
    : RUNTIME_RENDERER_BACKENDS.webgpu;
}

export function observeRuntimeRendererBackend(renderer) {
  return renderer?.isWebGLRenderer === true ||
    renderer?.backend?.isWebGLBackend === true
    ? RUNTIME_RENDERER_BACKENDS.webgl2
    : RUNTIME_RENDERER_BACKENDS.webgpu;
}

export function createRuntimeSessionState(initialBackend) {
  return {
    generation: 0,
    phase: RUNTIME_SESSION_PHASES.starting,
    requestedBackend: initialBackend,
    activeBackend: initialBackend,
    observedBackend: null,
  };
}

function beginDisposal(state) {
  if (state.phase === RUNTIME_SESSION_PHASES.disposing) {
    return state;
  }
  return {
    ...state,
    phase: RUNTIME_SESSION_PHASES.disposing,
    observedBackend: null,
  };
}

export function reduceRuntimeSession(state, event) {
  switch (event?.type) {
    case RUNTIME_SESSION_EVENTS.requestBackend: {
      const requestedBackend = event.backend;
      if (
        !Object.values(RUNTIME_RENDERER_BACKENDS).includes(requestedBackend)
      ) {
        return state;
      }
      if (requestedBackend === state.requestedBackend) {
        return state;
      }

      const nextState = { ...state, requestedBackend };
      if (state.phase === RUNTIME_SESSION_PHASES.disposing) {
        return nextState;
      }
      if (requestedBackend === state.activeBackend) {
        return nextState;
      }
      return beginDisposal(nextState);
    }

    case RUNTIME_SESSION_EVENTS.disposalCompleted:
      if (state.phase !== RUNTIME_SESSION_PHASES.disposing) {
        return state;
      }
      return {
        ...state,
        generation: state.generation + 1,
        phase: RUNTIME_SESSION_PHASES.starting,
        activeBackend: state.requestedBackend,
        observedBackend: null,
      };

    case RUNTIME_SESSION_EVENTS.rendererReady:
      if (
        state.phase !== RUNTIME_SESSION_PHASES.starting ||
        event.generation !== state.generation
      ) {
        return state;
      }
      return {
        ...state,
        phase: RUNTIME_SESSION_PHASES.ready,
        observedBackend: event.backend ?? state.activeBackend,
      };

    case RUNTIME_SESSION_EVENTS.rendererFailed:
      if (event.generation !== state.generation) {
        return state;
      }
      return {
        ...state,
        phase: RUNTIME_SESSION_PHASES.failed,
        observedBackend: event.backend ?? state.observedBackend,
      };

    default:
      return state;
  }
}
