import GUI from "lil-gui";
const gui = new GUI();

export const setupGUI = (
  parameters,
  particlePoints,
  particlesGeometry,
  particlesMaterial,
  scene,
  init
) => {
  gui.close();
  // Add GUI control for rotation speed
  gui
    .add(parameters, "rotationSpeed")
    .min(0)
    .max(1)
    .step(0.001)
    .onChange((value) => {
      parameters.rotationSpeed = value;
    });

  // GUI controller for 'num' with onFinishChange
  gui
    .add(parameters, "num")
    .min(2000)
    .max(50000)
    .step(1000)
    .onFinishChange(() => {
      // Dispose of the old geometry and material to free up GPU memory
      if (particlePoints) {
        particlePoints.geometry.dispose();
        particlePoints.material.dispose();
        scene.remove(particlePoints);

        // Clear references
        particlePoints = null;
        particlesGeometry = null;
        particlesMaterial = null;
      }

      // Re-setup the particles with the new count
      init();
    });

  // Add GUI control for 'vel'
  gui
    .add(parameters, "vel")
    .min(0)
    .max(1)
    .step(0.01)
    .onChange((value) => {
      parameters.vel = value;
    });

  // Create a GUI folder for each wave component
  for (let i = 0; i < parameters.N; i++) {
    const waveFolder = gui.addFolder(`Wave Component ${i + 1}`);

    // Add sliders for each property of the wave component
    waveFolder
      .add(parameters.waveComponents[i], `A${i}`)
      .min(0)
      .max(20)
      .step(0.1)
      .name(`Amplitude A${i}`);
    waveFolder
      .add(parameters.waveComponents[i], `u${i}`)
      .min(0)
      .max(20)
      .step(1)
      .name(`Frequency u${i}`);
    waveFolder
      .add(parameters.waveComponents[i], `v${i}`)
      .min(0)
      .max(20)
      .step(1)
      .name(`Frequency v${i}`);
    waveFolder
      .add(parameters.waveComponents[i], `w${i}`)
      .min(0)
      .max(20)
      .step(1)
      .name(`Frequency w${i}`);
  }
};
