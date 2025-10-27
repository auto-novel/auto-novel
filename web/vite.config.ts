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

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd());

  const userConfig: UserConfig = {
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

  if (command === 'serve') {
    const apiUrl = env.VITE_API_URL ?? 'https://n.novelia.cc';
    userConfig.server = {
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          bypass: (req, _res, _options) => {
            if (
              apiUrl === 'https://n.novelia.cc' &&
              req.url &&
              req.url.includes('/translate-v2/')
            ) {
              console.log('检测到小说章节翻译请求，已拦截');
              return false;
            }
          },
          rewrite: (path) => {
            if (apiUrl !== 'n.novelia.cc') {
              path = path.replace(/^\/api/, '');
            }
            return path;
          },
        },
        '/files-temp': {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    };
  }

  const enableSonda = env.VITE_ENABLE_SONDA === 'true';
  if (enableSonda) {
    userConfig.build!.sourcemap = true;
    userConfig.plugins!.push(
      Sonda({
        gzip: true,
        brotli: true,
      }),
    );
  }

  return userConfig;
});
