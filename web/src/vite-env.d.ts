/// <reference types="vite/client" />

declare const __AUTH_URL__: string;

declare const __BUILD_INFO__: Readonly<{
  gitCommit: string;
  buildTime: string;
}>;

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
