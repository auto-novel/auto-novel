import { useScroll } from '@vueuse/core';
import { clamp } from 'lodash-es';

export function useScrollDetector(
  onScroll: (payload: {
    percent: number;
    chapterId: string;
    y: number;
  }) => void,
) {
  useScroll(window, {
    throttle: 100,
    onScroll: () => {
      const chapters = Array.from(document.querySelectorAll('[data-chapter]'));
      if (chapters.length === 0) return;

      const vh = window.innerHeight;

      for (const chapter of chapters) {
        const rect = chapter.getBoundingClientRect();
        const indicator = vh * 0.3;
        if (rect.top <= indicator && rect.bottom >= indicator) {
          const chapterId = chapter.getAttribute('data-id') || '';
          const percent = clamp((indicator - rect.top) / rect.height, 0, 1);
          onScroll({ percent, chapterId, y: Math.max(-rect.top, 0) });
          break;
        }
      }
    },
  });
}
