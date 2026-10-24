import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";

/** Canvas owns its renderer, including initialization that finishes after unmount.
 * R3F's WebGL unmount hooks do not release a WebGPURenderer backend/device. */
export function RendererCanvas({ gl: createRenderer, ...props }) {
  const factoryRef = useRef(createRenderer);
  factoryRef.current = createRenderer;
  const [lifetime] = useState(() => ({
    revision: 0,
    disposed: false,
    renderer: null,
    initialization: null,
  }));

  useEffect(() => {
    lifetime.revision++;
    return () => {
      const revision = ++lifetime.revision;
      // Development effect replay reacquires the same live Canvas synchronously.
      // Real teardown releases only after child resource cleanups have run.
      queueMicrotask(() => {
        if (lifetime.revision !== revision) return;
        lifetime.disposed = true;
        lifetime.renderer?.dispose();
        lifetime.renderer = null;
      });
    };
  }, [lifetime]);

  const initialize = useCallback(
    async (defaults) => {
      if (lifetime.disposed) {
        throw new DOMException("Canvas is unmounted", "AbortError");
      }
      if (!lifetime.initialization) {
        lifetime.initialization = (async () => {
          const renderer = await factoryRef.current(defaults);
          if (lifetime.disposed) {
            renderer.dispose();
            throw new DOMException(
              "Canvas was unmounted during renderer initialization",
              "AbortError",
            );
          }
          lifetime.renderer = renderer;
          return renderer;
        })();
      }
      return lifetime.initialization;
    },
    [lifetime],
  );

  return <Canvas {...props} gl={initialize} />;
}
