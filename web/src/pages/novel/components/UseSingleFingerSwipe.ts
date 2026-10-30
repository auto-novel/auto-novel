import { useEventListener } from '@vueuse/core';

export interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  targetWindow?: Window;
}

export const isInputOrScrollTarget = (el: EventTarget | null): boolean => {
  const target = el as HTMLElement | null;
  if (!target) return false;

  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable ||
    (typeof target.closest === 'function' &&
      target.closest('input, textarea, select, [contenteditable="true"]'))
  ) {
    return true;
  }

  let current: HTMLElement | null = target;
  const body = typeof document !== 'undefined' ? document.body : null;
  while (current && body && current !== body) {
    if (
      current.scrollWidth &&
      current.clientWidth &&
      current.scrollWidth > current.clientWidth + 5
    ) {
      if (typeof window !== 'undefined' && window.getComputedStyle) {
        const style = window.getComputedStyle(current);
        if (
          (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
          current.clientWidth > 0
        ) {
          return true;
        }
      }
    }
    current = current.parentElement;
  }

  return false;
};

export function SingleFingerSwipe(options: SwipeOptions) {
  const {
    onSwipeLeft,
    onSwipeRight,
    threshold = 50,
    targetWindow = typeof window !== 'undefined' ? window : undefined,
  } = options;

  let touchStartX = 0,
    touchStartY = 0;
  let isSingleTouch = false;
  let hasSwitched = false;

  const initSingleFingerTouch = (e: TouchEvent) => {
    if (isInputOrScrollTarget(e.target)) {
      isSingleTouch = false;
      return;
    }
    const touch = e.touches[0];
    if (!touch) return;

    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    isSingleTouch = true;
    hasSwitched = false;
  };

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      initSingleFingerTouch(e);
    } else {
      isSingleTouch = false;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 1) {
      isSingleTouch = false;
      return;
    }

    if (!isSingleTouch || hasSwitched) return;

    const touch = e.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    if (
      Math.abs(deltaX) > threshold &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.5
    ) {
      hasSwitched = true;
      isSingleTouch = false;
      if (deltaX < 0) {
        onSwipeLeft?.();
      } else {
        onSwipeRight?.();
      }
    }
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length === 0) {
      isSingleTouch = false;
    }
  };

  if (targetWindow) {
    useEventListener(targetWindow, 'touchstart', handleTouchStart, {
      passive: true,
    });
    useEventListener(targetWindow, 'touchmove', handleTouchMove, {
      passive: true,
    });
    useEventListener(targetWindow, 'touchend', handleTouchEnd, {
      passive: true,
    });
    useEventListener(targetWindow, 'touchcancel', handleTouchEnd, {
      passive: true,
    });
  }

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
