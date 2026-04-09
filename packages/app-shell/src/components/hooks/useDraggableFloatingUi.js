import { useCallback, useEffect, useRef, useState } from "react";

const INTERACTIVE_SELECTOR =
  'button,input,select,textarea,a,label,summary,[role="button"],[role="link"]';
const DRAG_THRESHOLD_PX = 4;
const DOUBLE_TAP_RESET_MS = 280;
const DOUBLE_TAP_RESET_DISTANCE_PX = 24;

function isDragEligible(target, currentTarget) {
  if (!(target instanceof Element)) {
    return target === currentTarget;
  }

  return !target.closest(INTERACTIVE_SELECTOR);
}

export function useDraggableFloatingUi() {
  const dragStateRef = useRef(null);
  const tapStateRef = useRef({ time: 0, x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const resetDragOffset = useCallback(() => {
    dragStateRef.current = null;
    tapStateRef.current = { time: 0, x: 0, y: 0 };
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handlePointerMove = (event) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      const movedEnough =
        Math.abs(deltaX) >= DRAG_THRESHOLD_PX ||
        Math.abs(deltaY) >= DRAG_THRESHOLD_PX;

      if (!dragState.moved && !movedEnough) {
        return;
      }

      if (!dragState.moved) {
        dragState.moved = true;
        setIsDragging(true);
      }

      setDragOffset({
        x: dragState.originX + deltaX,
        y: dragState.originY + deltaY,
      });
    };

    const handlePointerEnd = () => {
      if (!dragStateRef.current) {
        return;
      }

      dragStateRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, []);

  const handlePointerDown = useCallback(
    (event) => {
      if (event.button !== 0) {
        return;
      }

      if (!isDragEligible(event.target, event.currentTarget)) {
        return;
      }

      dragStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originX: dragOffset.x,
        originY: dragOffset.y,
        moved: false,
      };
    },
    [dragOffset.x, dragOffset.y],
  );

  const handleDoubleClick = useCallback(
    (event) => {
      if (!isDragEligible(event.target, event.currentTarget)) {
        return;
      }

      resetDragOffset();
    },
    [resetDragOffset],
  );

  const handlePointerUp = useCallback(
    (event) => {
      if (event.pointerType === "mouse") {
        return;
      }

      if (!isDragEligible(event.target, event.currentTarget)) {
        return;
      }

      const dragState = dragStateRef.current;
      if (dragState?.moved) {
        return;
      }

      const now = Date.now();
      const previousTap = tapStateRef.current;
      const distance = Math.hypot(
        event.clientX - previousTap.x,
        event.clientY - previousTap.y,
      );

      if (
        now - previousTap.time <= DOUBLE_TAP_RESET_MS &&
        distance <= DOUBLE_TAP_RESET_DISTANCE_PX
      ) {
        resetDragOffset();
        return;
      }

      tapStateRef.current = {
        time: now,
        x: event.clientX,
        y: event.clientY,
      };
    },
    [resetDragOffset],
  );

  return {
    dragOffset,
    isDragging,
    handlePointerDown,
    handlePointerUp,
    handleDoubleClick,
    resetDragOffset,
  };
}
