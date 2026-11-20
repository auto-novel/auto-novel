import { htmlBootstrapPlugin } from '@novelia/web-kit/vite';
import ui from '@nuxt/ui/vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import Sonda from 'sonda/vite';
import AutoImport from 'unplugin-auto-import/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vite-plus';
import { webKitNuxtUiOptions } from './node_modules/@novelia/web-kit/src/ui/nuxt-ui';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(
    mode,
    fileURLToPath(new URL('.', import.meta.url)),
    'VITE_',
  );
  const isLocalApi = mode === 'local-api';
  const enableSonda = env.VITE_ENABLE_SONDA === 'true';

  return {
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
      htmlBootstrapPlugin({ analytics: 'G-QD8MZ90XFJ' }),
      vue(),
      ui({
        ...webKitNuxtUiOptions,
        components: {
          dts: 'src/components.d.ts',
          dirs: ['src/**/components/**'],
        },
      }),
      AutoImport({
        dts: 'src/auto-imports.d.ts',
        ignore: ['h'],
        imports: ['vue', 'vue-router', 'pinia'],
      }),
      enableSonda && Sonda({ gzip: true, brotli: true }),
    ],
    build: {
      sourcemap: enableSonda,
      target: 'safari16',
      cssCodeSplit: false,
      rolldownOptions: {
        preserveEntrySignatures: false,
        output: {
          strictExecutionOrder: true,
          codeSplitting: {
            includeDependenciesRecursively: false,
            groups: [
              {
                name: 'web-kit',
                test: /\/node_modules\/@novelia\/web-kit\//,
              },
              {
                name: 'dep-pi',
                test: /\/node_modules\/(?:@earendil-works\/pi-ai|@anthropic-ai\/sdk|openai)\//,
              },
              {
                name: 'dep-zip',
                test: /\/node_modules\/@zip\.js\//,
              },
              {
                name: 'dep-opencc',
                test: /\/node_modules\/opencc-js\//,
              },
              {
                name: 'vendor',
                test: /node_modules/,
              },
            ],
          },
        },
      },
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
          bypass: (req) => {
            if (!isLocalApi && req.url && req.url.includes('/translate-v2/')) {
              console.log('检测到小说章节翻译请求，已拦截');
              return false;
            }
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    test: {
      restoreMocks: true,
      // 各包独立缓存，避免并行测试共享工作区模块缓存文件。
      fsModuleCachePath: 'node_modules/.vitest-cache',
    },
  };
});
