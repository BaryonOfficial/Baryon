import { useState, useCallback, useRef } from 'react';

/**
 * Hook to generate random wave components with smooth transitions
 * @param {Object} options - Configuration options
 * @param {number} options.numComponents - Number of wave components (default: 12)
 * @param {number} options.minAmplitude - Minimum amplitude (default: 1.0)
 * @param {number} options.maxAmplitude - Maximum amplitude (default: 4.0)
 * @param {number} options.minFrequency - Minimum frequency (default: 1)
 * @param {number} options.maxFrequency - Maximum frequency (default: 10)
 * @param {number} options.frameInterval - Frames between updates (default: 60, range: 1-120)
 * @param {boolean} options.enabled - Whether to generate new components (default: true)
 * @param {number} options.transitionDuration - Duration of transition in frames (default: 15)
 * @returns {Object} Object containing update function and manual generation function
 */
export const useWaveComponents = (options = {}) => {
  const {
    numComponents = 12,
    minAmplitude = 1.0,
    maxAmplitude = 4.0,
    minFrequency = 1,
    maxFrequency = 10,
    frameInterval = 60, // Default to changing every second at 60fps
    enabled = true, // Whether to automatically generate new components
    transitionDuration = 15, // Default transition duration in frames
  } = options;

  // Store current and previous components in state
  const [currentComponents, setCurrentComponents] = useState(() => generateRandomComponents());
  const [previousComponents, setPreviousComponents] = useState(() => currentComponents);

  // Track transition progress
  const transitionProgress = useRef(1.0); // Start at 1.0 (fully on current)

  // Frame counter
  const frameCounter = useRef(0);
  const transitioning = useRef(false);

  // Generate random wave components
  function generateRandomComponents() {
    const components = [];
    for (let i = 0; i < numComponents; i++) {
      // Generate in spherical coordinates for better distribution
      const r = Math.floor(Math.random() * (maxFrequency - minFrequency + 1)) + minFrequency;
      const theta = Math.random() * 2 * Math.PI; // Azimuthal angle
      const phi = Math.random() * Math.PI; // Polar angle

      // Convert to cartesian
      const u = Math.round(r * Math.sin(phi) * Math.cos(theta));
      const v = Math.round(r * Math.sin(phi) * Math.sin(theta));
      const w = Math.round(r * Math.cos(phi));

      components.push({
        amplitude: Math.random() * (maxAmplitude - minAmplitude) + minAmplitude,
        u,
        v,
        w,
      });
    }
    return components;
  }

  // Function to start transition to new components
  const startTransition = useCallback(() => {
    // Save current components as previous
    setPreviousComponents(currentComponents);

    // Generate new components
    setCurrentComponents(generateRandomComponents());

    // Reset transition progress
    transitionProgress.current = 0.0;
    transitioning.current = true;

    // Reset frame counter
    frameCounter.current = 0;
  }, [currentComponents, numComponents, minAmplitude, maxAmplitude, minFrequency, maxFrequency]);

  // Function to manually generate new components
  const generateNew = useCallback(() => {
    startTransition();
  }, [startTransition]);

  // Update function to call in animation loop
  const update = useCallback(() => {
    // Update transition if in progress
    if (transitioning.current) {
      transitionProgress.current += 1.0 / transitionDuration;

      if (transitionProgress.current >= 1.0) {
        transitionProgress.current = 1.0;
        transitioning.current = false;
      }
    }

    // Only increment counter and generate new components if enabled and not already transitioning
    if (enabled && !transitioning.current) {
      frameCounter.current += 1;

      // Generate new components when frame interval is reached
      if (frameCounter.current >= frameInterval) {
        startTransition();
      }
    }

    // Return flat arrays for both previous and current components for shader uniform
    // and the transition progress
    const prevArray = [];
    const currArray = [];

    // Ensure we have components to fill the arrays
    const prevLen = Math.min(previousComponents.length, numComponents);
    const currLen = Math.min(currentComponents.length, numComponents);

    // Fill previous components array
    for (let i = 0; i < numComponents; i++) {
      if (i < prevLen) {
        prevArray.push(previousComponents[i].amplitude);
        prevArray.push(previousComponents[i].u);
        prevArray.push(previousComponents[i].v);
        prevArray.push(previousComponents[i].w);
      } else {
        // Pad with zeros if needed
        prevArray.push(0, 0, 0, 0);
      }
    }

    // Fill current components array
    for (let i = 0; i < numComponents; i++) {
      if (i < currLen) {
        currArray.push(currentComponents[i].amplitude);
        currArray.push(currentComponents[i].u);
        currArray.push(currentComponents[i].v);
        currArray.push(currentComponents[i].w);
      } else {
        // Pad with zeros if needed
        currArray.push(0, 0, 0, 0);
      }
    }

    return {
      previous: new Float32Array(prevArray),
      current: new Float32Array(currArray),
      progress: transitionProgress.current,
    };
  }, [
    previousComponents,
    currentComponents,
    frameInterval,
    numComponents,
    enabled,
    transitionDuration,
    startTransition,
  ]);

  return {
    update,
    generateNew,
  };
};
