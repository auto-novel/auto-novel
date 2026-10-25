import { onActivated, onMounted, type Ref } from 'vue';

/** 进入列表时聚焦键盘作用域；翻页和数据刷新不重新聚焦。 */
export function useListAutofocus(scope: Readonly<Ref<HTMLElement | null>>) {
  const focus = () => {
    const element = scope.value;
    if (!element) return;
    const document = element.ownerDocument;
    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      active !== document.documentElement
    )
      return;
    element.focus({ preventScroll: true });
  };

  onMounted(focus);
  // 列表路由使用 KeepAlive，返回缓存页面也需要恢复键盘作用域。
  onActivated(focus);
}
