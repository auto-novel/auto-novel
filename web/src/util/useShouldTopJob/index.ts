import { useKeyModifier } from '@vueuse/core';

export function useShouldTopJob() {
  // Windows/Linux 用 Ctrl，macOS 用 Cmd
  const pressControl = useKeyModifier('Control');
  const pressMeta = useKeyModifier('Meta');
  return computed(
    () => pressControl.value === true || pressMeta.value === true,
  );
}
