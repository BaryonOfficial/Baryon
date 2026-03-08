import { useEffect, useRef } from "react";
import { Pane } from "tweakpane";
import {
  createControlState,
  getControlFolders,
  getControlsForFolder,
} from "@baryon/visualizer";

export function useBaryonControls() {
  const controlsRef = useRef(createControlState());

  useEffect(() => {
    const p = controlsRef.current;
    const pane = new Pane({ title: "Baryon", expanded: true });
    pane.element.style.position = "fixed";
    pane.element.style.top = "1rem";
    pane.element.style.right = "1rem";
    pane.element.style.zIndex = "10000";

    for (const folderTitle of getControlFolders()) {
      const folder = pane.addFolder({
        title: folderTitle,
        expanded: folderTitle === "Particles",
      });

      for (const definition of getControlsForFolder(folderTitle)) {
        folder.addBinding(p, definition.key, {
          label: definition.label,
          ...(definition.binding ?? {}),
        });
      }
    }

    return () => pane.dispose();
  }, []);

  return controlsRef;
}
