import { useState, useCallback, useRef } from 'react';

/**
 * Custom hook for managing wave components for Chladni patterns with shader-based interpolation
 *
 * @param {Object} options - Configuration options
 * @param {number} options.numComponents - Number of wave components (default: 12)
 * @param {number} options.minAmplitude - Minimum amplitude for wave components (default: 1.0)
 * @param {number} options.maxAmplitude - Maximum amplitude for wave components (default: 4.0)
 * @param {number} options.minFrequency - Minimum frequency for u,v,w parameters (default: 1)
 * @param {number} options.maxFrequency - Maximum frequency for u,v,w parameters (default: 10)
 * @param {number} options.transitionDuration - Duration of transition in seconds (default: 1.0)
 * @returns {Object} Wave components state and control functions
 */
export const useWaveComponents = (options = {}) => {
  const {
    numComponents = 12,
    minAmplitude = 1.0,
    maxAmplitude = 4.0,
    minFrequency = 1,
    maxFrequency = 30,
    transitionDuration = 1.0,
  } = options;

  // State and refs for transition
  const [blendFactor, setBlendFactor] = useState(0.0);
  const isTransitioning = useRef(false);
  const transitionStartTime = useRef(0);
  const transitionDurationRef = useRef(transitionDuration);

  // Helper to update transition duration
  const setTransitionDuration = useCallback((duration) => {
    transitionDurationRef.current = duration;
  }, []);

  // Create random wave components
  const generateRandomComponents = useCallback(() => {
    const components = [];
    for (let i = 0; i < numComponents; i++) {
      // Generate in spherical coordinates
      const r = Math.floor(Math.random() * (maxFrequency - minFrequency + 1)) + minFrequency;
      const theta = Math.random() * 2 * Math.PI; // Azimuthal angle
      const phi = Math.random() * Math.PI; // Polar angle

      // Convert to cartesian
      const u = Math.round(r * Math.sin(phi) * Math.cos(theta));
      const v = Math.round(r * Math.sin(phi) * Math.sin(theta));
      const w = Math.round(r * Math.cos(phi));

      components.push({
        amplitude: Math.random() * (maxAmplitude - minAmplitude) + minAmplitude,
        u: u,
        v: v,
        w: w,
      });
    }
    return components;
  }, [numComponents, minAmplitude, maxAmplitude, minFrequency, maxFrequency]);

  // Generate initial components only once
  const initialComponentsRef = useRef(null);
  if (initialComponentsRef.current === null) {
    initialComponentsRef.current = generateRandomComponents();
  }

  // Use the same initial components for both states
  const [currentComponents, setCurrentComponents] = useState(() => initialComponentsRef.current);
  const [targetComponents, setTargetComponents] = useState(() => initialComponentsRef.current);

  // Start a new transition
  const generateNewComponents = useCallback(() => {
    // Generate new target components
    const newTargetComponents = generateRandomComponents();
    setTargetComponents(newTargetComponents);

    // Reset blend factor to start transition
    setBlendFactor(0.0);
    isTransitioning.current = true;
    transitionStartTime.current = performance.now() / 1000;
  }, [generateRandomComponents]);

  // Update transition (called in animation frame)
  const updateTransition = useCallback(
    (currentTime) => {
      if (isTransitioning.current) {
        // Calculate elapsed time since transition started
        const elapsed = currentTime - transitionStartTime.current;

        // Calculate new blend factor (0 to 1)
        const newBlendFactor = Math.min(1.0, elapsed / transitionDurationRef.current);

        // Update blend factor
        setBlendFactor(newBlendFactor);

        // Check if transition is complete
        if (newBlendFactor >= 1.0) {
          isTransitioning.current = false;
          setCurrentComponents(targetComponents);
        }

        return newBlendFactor;
      }

      return blendFactor;
    },
    [blendFactor, targetComponents]
  );

  // Convert components to flat array for shader
  const getCurrentComponentsArray = useCallback(() => {
    const array = [];
    for (let i = 0; i < currentComponents.length; i++) {
      array.push(currentComponents[i].amplitude);
      array.push(currentComponents[i].u);
      array.push(currentComponents[i].v);
      array.push(currentComponents[i].w);
    }
    return new Float32Array(array);
  }, [currentComponents]);

  // Convert target components to flat array for shader
  const getTargetComponentsArray = useCallback(() => {
    const array = [];
    for (let i = 0; i < targetComponents.length; i++) {
      array.push(targetComponents[i].amplitude);
      array.push(targetComponents[i].u);
      array.push(targetComponents[i].v);
      array.push(targetComponents[i].w);
    }
    return new Float32Array(array);
  }, [targetComponents]);

  return {
    numComponents,
    currentComponents,
    targetComponents,
    blendFactor,
    isTransitioning: isTransitioning.current,
    generateNewComponents,
    updateTransition,
    getCurrentComponentsArray,
    getTargetComponentsArray,
    setTransitionDuration,
  };
};
