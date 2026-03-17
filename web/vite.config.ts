import vue from '@vitejs/plugin-vue';
import Sonda from 'sonda/vite';
import AutoImport from 'unplugin-auto-import/vite';
import imagemin from 'unplugin-imagemin/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';
import Components from 'unplugin-vue-components/vite';
import type { UserConfig } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const apiMode = env.VITE_API_MODE;
  const apiUrl = (() => {
    if (apiMode === 'remote') {
      return 'https://n.novelia.cc';
    } else if (apiMode === 'local') {
      return 'http://localhost:80';
    } else if (apiMode === 'native') {
      return 'http://localhost:8081';
    }
    return 'https://n.novelia.cc';
  })();
  const enableSonda = env.VITE_ENABLE_SONDA === 'true';

  const config: UserConfig = {
    build: {
      target: ['es2015'],
      cssCodeSplit: false,
      rollupOptions: {
        treeshake: true,
        output: {
          manualChunks(id) {
            if (id.includes('web/src')) {
              return 'chunk';
            } else if (id.includes('@zip.js')) {
              return 'dep-zip';
            } else if (id.includes('opencc')) {
              return 'dep-opencc';
            } else if (id.includes('naive')) {
              return 'dep-naive';
            } else if (id.includes('node_module')) {
              return 'dep';
            }
          },
        },
      },
    },
    server: {
      allowedHosts: true,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          rewrite:
            apiMode === 'native'
              ? (path: string) => path.replace(/^\/api/, '')
              : undefined,
          bypass: (req, _res, _options) => {
            if (
              apiMode === 'remote' &&
              req.url &&
              req.url.includes('/translate-v2/')
            ) {
              console.log('检测到小说章节翻译请求，已拦截');
              return false;
            }
          },
        },
        '/files-temp': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/files-extra': {
          target: 'https://n.novelia.cc',
          changeOrigin: true,
        },
      },
    },
    plugins: [
      vue(),
      imagemin({}),
      createHtmlPlugin({
        minify: { minifyJS: true },
      }),
      tsconfigPaths({ loose: true }),
      AutoImport({
        dts: 'src/auto-imports.d.ts',
        imports: [
          'vue',
          'vue-router',
          'pinia',
          {
            'naive-ui': [
              'useDialog',
              'useMessage',
              'useNotification',
              'useLoadingBar',
              'useThemeVars',
            ],
          },
        ],
      }),
      Components({
        dts: 'src/components.d.ts',
        dirs: ['src/**/components/**'],
        resolvers: [NaiveUiResolver()],
      }),
    ],
  };

  if (enableSonda) {
    config.build!.sourcemap = true;
    config.plugins!.push(
      Sonda({
        gzip: true,
        brotli: true,
      }),
    );
  }

  return config;
});
