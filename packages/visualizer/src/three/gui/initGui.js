import GUI from 'lil-gui';

export function initGUI(guiContainerRef) {
  const guiWidth = 300;
  const gui = new GUI({ width: guiWidth, container: guiContainerRef.current });

  document.documentElement.style.setProperty('--gui-width', `${guiWidth}px`);

  return gui;
}