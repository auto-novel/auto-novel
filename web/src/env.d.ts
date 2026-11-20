// 为尚未完整支持 Vue 的 vp check 提供导入类型兜底，不能替代 vue-tsc；原生支持后可验证移除。
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, unknown>;
  export default component;
}
