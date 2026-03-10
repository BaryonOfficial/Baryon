import { useEffect, useRef } from "react";
import {
  CONTROL_STATUSES,
  DEFAULT_VISUALIZATION_METHOD,
  createControlState,
  getControlFolders,
  getControlsForFolder,
} from "@baryon/visualizer";
import { DEVTOOLS_ENABLED } from "../../devtools/config.js";

function isVisibleControl(definition) {
  return DEVTOOLS_ENABLED || definition.status !== CONTROL_STATUSES.debugOnly;
}

function getVisibleControls(folderTitle) {
  return getControlsForFolder(folderTitle, DEFAULT_VISUALIZATION_METHOD).filter(
    isVisibleControl
  );
}

export function useBaryonControls() {
  const controlsRef = useRef(createControlState());

  useEffect(() => {
    const p = controlsRef.current;
    let disposed = false;
    let pane = null;

    const initPane = async () => {
      const { Pane } = await import("tweakpane");
      if (disposed) {
        return;
      }

      pane = new Pane({ title: "Baryon", expanded: true });
      pane.element.style.position = "fixed";
      pane.element.style.top = "1rem";
      pane.element.style.right = "1rem";
      pane.element.style.zIndex = "10000";

      const visibleFolders = getControlFolders(DEFAULT_VISUALIZATION_METHOD).filter(
        (folderTitle) => getVisibleControls(folderTitle).length > 0
      );

      for (const folderTitle of visibleFolders) {
        const folder = pane.addFolder({
          title: folderTitle,
          expanded: folderTitle === "Particles",
        });

        for (const definition of getVisibleControls(folderTitle)) {
          folder.addBinding(p, definition.key, {
            label: definition.label,
            ...(definition.binding ?? {}),
          });
        }
      }

      if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
        window.__baryonControls = {
          getState() {
            return { ...p };
          },
          setControl(key, value) {
            if (!(key in p)) {
              throw new Error(`[Baryon controls] Unknown control key: ${key}`);
            }
            p[key] = value;
            pane.refresh();
            return { ...p };
          },
        };
      }
    };

    void initPane();

    return () => {
      disposed = true;
      if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
        delete window.__baryonControls;
      }
      pane?.dispose();
    };
  }, [controlsRef]);

  return controlsRef;
}
