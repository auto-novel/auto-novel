import { useDragScroll } from '@novelia/web-kit';
import { effectScope, type Directive, type EffectScope } from 'vue';

const scopes = new WeakMap<HTMLElement, EffectScope>();

/** Bind web-kit's drag behavior to the Nuxt scroll area's actual root. */
export const vHorizontalDrag: Directive<HTMLElement> = {
  mounted(element) {
    const scope = effectScope();
    scope.run(() => {
      useDragScroll(element, { orientation: 'horizontal', inertia: true });
    });
    scopes.set(element, scope);
  },
  unmounted(element) {
    scopes.get(element)?.stop();
    scopes.delete(element);
  },
};
