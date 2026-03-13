import { useEffect, useRef, useState } from "react";
import { setupLoaders } from "@baryon/visualizer";
import { prepareBaryonGeometryFromScene } from "./defaultBaryonGeometry";

export function useDefaultBaryonGeometry() {
  const [baryonGeometry, setBaryonGeometry] = useState(null);
  const geometryRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const { gltfLoader } = setupLoaders();

    (async () => {
      try {
        const gltf = await gltfLoader.loadAsync("./glb/Baryon_v2.glb");
        const preparedGeometry = prepareBaryonGeometryFromScene(gltf.scene);

        if (cancelled) {
          preparedGeometry.dispose();
          return;
        }

        setBaryonGeometry((currentGeometry) => {
          currentGeometry?.dispose?.();
          geometryRef.current = preparedGeometry;
          return preparedGeometry;
        });
      } catch (error) {
        console.error("[BaryonScene] Default logo load failed:", error);
      }
    })();

    return () => {
      cancelled = true;
      geometryRef.current?.dispose?.();
      geometryRef.current = null;
    };
  }, []);

  return baryonGeometry;
}
