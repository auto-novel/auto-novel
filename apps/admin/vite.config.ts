import { htmlBootstrapPlugin } from '@novelia/web-kit/vite';
import ui from '@nuxt/ui/vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite-plus';
import { webKitNuxtUiOptions } from './node_modules/@novelia/web-kit/src/ui/nuxt-ui';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(
    mode,
    fileURLToPath(new URL('.', import.meta.url)),
    'VITE_',
  );
  const isLocalApi = mode === 'local-api';

  return {
    base: '/admin/',
    define: {
      __AUTH_URL__: JSON.stringify(
        command === 'serve' ? '/auth-proxy/' : 'https://auth.novelia.cc',
      ),
      __BUILD_TIME__: JSON.stringify(
        env.VITE_BUILD_TIME || new Date().toISOString(),
      ),
      __COMMIT_SHA__: JSON.stringify(env.VITE_COMMIT_SHA || 'unknown'),
    },
    plugins: [
      htmlBootstrapPlugin(),
      vue(),
      ui({
        ...webKitNuxtUiOptions,
        components: { dts: 'src/components.d.ts', dirs: [] },
      }),
    ],
    build: {
      target: 'safari16',
      cssCodeSplit: false,
    },
    optimizeDeps: {
      exclude: ['@novelia/web-kit'],
    },
    server: {
      proxy: {
        '/auth-proxy/': {
          target: 'https://auth.novelia.cc',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/auth-proxy/, ''),
        },
        '/api': {
          target: isLocalApi ? 'http://localhost:8100' : 'https://n.novelia.cc',
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    test: {
      // 各包独立缓存，避免并行测试共享工作区模块缓存文件。
      fsModuleCachePath: 'node_modules/.vitest-cache',
    },
  };
});
