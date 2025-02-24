import { useState, useRef, useCallback, useEffect } from 'react';
import { useThree } from '@react-three/fiber';

/**
 * Custom hook for raymarching controls
 * Handles rotation and zoom for raymarched volumetric shapes
 *
 * @param {Object} options - Configuration options
 * @param {number} options.minZoom - Minimum zoom level (default: 0.1)
 * @param {number} options.maxZoom - Maximum zoom level (default: 5.0)
 * @param {number} options.initialZoom - Initial zoom level (default: 1.0)
 * @param {number} options.zoomSpeed - Zoom speed multiplier (default: 0.001)
 * @param {number} options.rotationDamping - Damping factor for rotation (default: 0.95)
 * @param {number} options.velocityThreshold - Threshold for velocity to stop rotation (default: 0.0001)
 * @returns {Object} Controls object with rotation, zoom, handlers and update function
 */
export const useRaymarchControls = (options = {}) => {
  const {
    minZoom = 0.1,
    maxZoom = 5.0,
    initialZoom = 1.0,
    zoomSpeed = 0.001,
    rotationDamping = 0.95,
    velocityThreshold = 0.0001,
  } = options;

  const [isPointerDown, setIsPointerDown] = useState(false);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(initialZoom);

  const velocity = useRef({ x: 0, y: 0 });
  const lastPointer = useRef({ x: 0, y: 0 });
  const { size } = useThree();

  // Handle pointer movement for rotation
  const handlePointerMove = useCallback(
    (event) => {
      if (isPointerDown) {
        const newPointer = {
          x: (event.point.x / size.width) * 2,
          y: (event.point.y / size.height) * 2,
        };

        // Calculate rotation delta
        const deltaX = newPointer.x - lastPointer.current.x;
        const deltaY = newPointer.y - lastPointer.current.y;

        // Update velocity based on movement
        velocity.current = { x: deltaX, y: deltaY };

        // Update accumulated rotation
        setRotation((prev) => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY,
        }));

        // Update last pointer position
        lastPointer.current = newPointer;
      }
    },
    [isPointerDown, size]
  );

  // Handle pointer down
  const handlePointerDown = useCallback(
    (event) => {
      setIsPointerDown(true);
      // Reset velocity when starting new interaction
      velocity.current = { x: 0, y: 0 };
      lastPointer.current = {
        x: (event.point.x / size.width) * 2,
        y: (event.point.y / size.height) * 2,
      };
    },
    [size]
  );

  // Handle pointer up and leave
  const handlePointerUp = useCallback(() => {
    setIsPointerDown(false);
  }, []);

  // Handle wheel for zooming
  const handleWheel = useCallback(
    (event) => {
      event.stopPropagation();
      event.preventDefault();

      // Calculate zoom delta based on wheel direction
      const zoomDelta = event.deltaY * -zoomSpeed;

      // Update zoom state with constraints
      setZoom((prevZoom) => {
        const newZoom = Math.max(minZoom, Math.min(maxZoom, prevZoom + zoomDelta));
        return newZoom;
      });
    },
    [minZoom, maxZoom, zoomSpeed]
  );

  // Add wheel event listener
  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // Update rotation with damping in animation frame
  const updateControls = useCallback(() => {
    // Apply damping when not clicked
    if (!isPointerDown) {
      velocity.current.x *= rotationDamping;
      velocity.current.y *= rotationDamping;

      // Only update rotation if velocity is significant
      if (
        Math.abs(velocity.current.x) > velocityThreshold ||
        Math.abs(velocity.current.y) > velocityThreshold
      ) {
        setRotation((prev) => ({
          x: prev.x + velocity.current.x,
          y: prev.y + velocity.current.y,
        }));
      } else {
        // Reset velocity when it gets very small
        velocity.current.x = 0;
        velocity.current.y = 0;
      }
    }
  }, [isPointerDown, rotationDamping, velocityThreshold]);

  return {
    rotation,
    zoom,
    isPointerDown,
    handlePointerDown,
    handlePointerUp,
    handlePointerMove,
    updateControls,
  };
};
