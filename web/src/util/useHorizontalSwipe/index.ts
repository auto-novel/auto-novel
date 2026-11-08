import { useEventListener } from '@vueuse/core';
import type { MaybeRefOrGetter } from 'vue';

interface HorizontalSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** 水平位移阈值，单位 px，默认 50。 */
  threshold?: number;
}

const shouldIgnoreSwipeTarget = (el: EventTarget | null): boolean => {
  const target = el as HTMLElement | null;
  if (!target || typeof target.closest !== 'function') return false;

  if (target.isContentEditable || target.closest('input, textarea, select')) {
    return true;
  }

  for (
    let current: HTMLElement | null = target;
    current && current !== current.ownerDocument.body;
    current = current.parentElement
  ) {
    if (current.scrollWidth > current.clientWidth + 5) {
      const style =
        current.ownerDocument.defaultView?.getComputedStyle(current);
      if (style?.overflowX === 'auto' || style?.overflowX === 'scroll') {
        return true;
      }
    }
  }

  return false;
};

/** 识别单指横向滑动；忽略编辑和横向滚动区域，纵向滚动或多指介入后取消识别。 */
export function useHorizontalSwipe(
  target: MaybeRefOrGetter<HTMLElement | null>,
  { onSwipeLeft, onSwipeRight, threshold = 50 }: HorizontalSwipeOptions,
): void {
  let start: { x: number; y: number } | undefined;
  const cancel = () => {
    start = undefined;
  };

  useEventListener(
    target,
    'touchstart',
    (e: TouchEvent) => {
      cancel();
      if (e.touches.length !== 1 || shouldIgnoreSwipeTarget(e.target)) return;

      const touch = e.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
    },
    { passive: true },
  );

  useEventListener(
    target,
    'touchmove',
    (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        cancel();
        return;
      }
      if (!start) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Once a vertical scroll starts, don't reinterpret it as a tab swipe.
      if (absY > 10 && absY >= absX) {
        cancel();
        return;
      }

      if (absX > threshold && absX > absY * 1.5) {
        cancel();
        if (deltaX < 0) onSwipeLeft?.();
        else onSwipeRight?.();
      }
    },
    { passive: true },
  );

  useEventListener(target, ['touchend', 'touchcancel'], cancel, {
    passive: true,
  });
}
