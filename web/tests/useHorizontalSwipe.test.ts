import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, shallowRef } from 'vue';

import { useHorizontalSwipe } from '../src/util/useHorizontalSwipe';

// Minimal DOM surface for testing native event listeners in the Node environment.
function element(
  options: {
    input?: boolean;
    editable?: boolean;
    overflowX?: string;
    parent?: HTMLElement;
  } = {},
): HTMLElement {
  return Object.assign(new EventTarget(), {
    closest: () => (options.input ? {} : null),
    isContentEditable: options.editable ?? false,
    scrollWidth: options.overflowX ? 200 : 100,
    clientWidth: 100,
    parentElement: options.parent ?? null,
    ownerDocument: {
      body: null,
      defaultView: {
        getComputedStyle: () => ({ overflowX: options.overflowX ?? 'visible' }),
      },
    },
  }) as unknown as HTMLElement;
}

function touch(
  root: HTMLElement,
  type: string,
  points: [number, number][],
  origin = root,
) {
  const event = new Event(type);
  Object.defineProperties(event, {
    target: { value: origin },
    touches: {
      value: points.map(([clientX, clientY]) => ({ clientX, clientY })),
    },
  });
  root.dispatchEvent(event);
}

describe('useHorizontalSwipe', () => {
  let root: HTMLElement;
  let scope: ReturnType<typeof effectScope>;
  let onSwipeLeft: ReturnType<typeof vi.fn>;
  let onSwipeRight: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = element();
    scope = effectScope();
    onSwipeLeft = vi.fn();
    onSwipeRight = vi.fn();
    scope.run(() => useHorizontalSwipe(root, { onSwipeLeft, onSwipeRight }));
  });

  afterEach(() => scope.stop());

  it.each([-60, 60])(
    'recognizes direction and fires once per gesture (%s)',
    (x) => {
      touch(root, 'touchstart', [[0, 0]]);
      touch(root, 'touchmove', [[x, 0]]);
      touch(root, 'touchmove', [[x * 2, 0]]);
      expect(onSwipeLeft).toHaveBeenCalledTimes(x < 0 ? 1 : 0);
      expect(onSwipeRight).toHaveBeenCalledTimes(x > 0 ? 1 : 0);

      touch(root, 'touchend', []);
      touch(root, 'touchstart', [[0, 0]]);
      touch(root, 'touchmove', [[x, 0]]);
      expect(x < 0 ? onSwipeLeft : onSwipeRight).toHaveBeenCalledTimes(2);
    },
  );

  it('requires the distance threshold and a clear horizontal direction', () => {
    touch(root, 'touchstart', [[0, 0]]);
    touch(root, 'touchmove', [[50, 0]]);
    touch(root, 'touchmove', [[60, 45]]);
    expect(onSwipeRight).not.toHaveBeenCalled();
    touch(root, 'touchmove', [[80, 45]]);
    expect(onSwipeRight).toHaveBeenCalledOnce();
  });

  it('does not reinterpret vertical scrolling as a swipe', () => {
    touch(root, 'touchstart', [[0, 0]]);
    touch(root, 'touchmove', [[0, 60]]);
    touch(root, 'touchmove', [[120, 60]]);
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('cancels when a second finger joins, even after it leaves', () => {
    touch(root, 'touchstart', [[0, 0]]);
    touch(root, 'touchstart', [
      [0, 0],
      [10, 0],
    ]);
    touch(root, 'touchend', [[0, 0]]);
    touch(root, 'touchmove', [[60, 0]]);
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it.each(['touchend', 'touchcancel'])(
    'clears pending recognition on %s',
    (type) => {
      touch(root, 'touchstart', [[0, 0]]);
      touch(root, type, []);
      touch(root, 'touchmove', [[60, 0]]);
      expect(onSwipeRight).not.toHaveBeenCalled();
    },
  );

  it.each([
    { input: true },
    { editable: true },
    { parent: element({ overflowX: 'auto' }) },
    { parent: element({ overflowX: 'scroll' }) },
  ])('ignores editing and horizontally scrollable targets (%j)', (options) => {
    touch(root, 'touchstart', [[0, 0]], element(options));
    touch(root, 'touchmove', [[60, 0]]);
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('binds when a template ref resolves and cleans up on disposal', async () => {
    scope.stop();
    scope = effectScope();
    const target = shallowRef<HTMLElement | null>(null);
    scope.run(() => useHorizontalSwipe(target, { onSwipeRight }));
    target.value = root;
    await nextTick();

    const outside = element();
    touch(outside, 'touchstart', [[0, 0]]);
    touch(outside, 'touchmove', [[60, 0]]);
    expect(onSwipeRight).not.toHaveBeenCalled();

    touch(root, 'touchstart', [[0, 0]]);
    touch(root, 'touchmove', [[60, 0]]);
    expect(onSwipeRight).toHaveBeenCalledOnce();

    scope.stop();
    touch(root, 'touchstart', [[0, 0]]);
    touch(root, 'touchmove', [[60, 0]]);
    expect(onSwipeRight).toHaveBeenCalledOnce();
  });
});
