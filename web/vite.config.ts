import ui from '@nuxt/ui/vite';
// web-kit 导出 TS 源码；相对路径让 Vite 配置加载器一并转译，避免 Node 外部加载 node_modules 中的 TS。
import { webKitNuxtUiOptions } from './node_modules/@novelia/web-kit/nuxt-ui/index.ts';
import { htmlBootstrapPlugin } from '@novelia/web-kit/vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { ProxyAgent } from 'proxy-agent';
import Sonda from 'sonda/vite';
import AutoImport from 'unplugin-auto-import/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';
import type { UserConfig } from 'vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(
    mode,
    fileURLToPath(new URL('.', import.meta.url)),
    'VITE_',
  );
  const isServe = command === 'serve';
  const isLocalApi = env.VITE_LOCAL_API === 'true';
  const apiUrl = isLocalApi ? 'http://localhost:5000' : 'https://n.novelia.cc';
  const enableSonda = env.VITE_ENABLE_SONDA === 'true';
  const config: UserConfig = {
    define: {
      __AUTH_URL__: JSON.stringify(
        isServe ? '/auth-proxy/' : 'https://auth.novelia.cc/',
      ),
      __BUILD_TIME__: JSON.stringify(
        env.VITE_BUILD_TIME || new Date().toISOString(),
      ),
      __COMMIT_SHA__: JSON.stringify(env.VITE_COMMIT_SHA || 'unknown'),
    },
    build: {
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
                name: 'dep-naive',
                test: /\/node_modules\/naive-ui\//,
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
      allowedHosts: true,
      proxy: {
        '/auth-proxy/': {
          target: 'https://auth.novelia.cc',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/auth-proxy/, ''),
        },
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          bypass: (req, _res, _options) => {
            if (!isLocalApi && req.url && req.url.includes('/translate-v2/')) {
              console.log('检测到小说章节翻译请求，已拦截');
              return false;
            }
          },
        },
        '/files-temp': {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    plugins: [
      vue(),
      ui({
        ...webKitNuxtUiOptions,
        // 统一生成组件声明，避免两套组件自动导入插件互相覆盖。
        components: {
          dts: 'src/components.d.ts',
          dirs: ['src/**/components/**'],
          resolvers: [NaiveUiResolver()],
        },
      }),
      htmlBootstrapPlugin({ analytics: 'G-QD8MZ90XFJ' }),
      AutoImport({
        dts: 'src/auto-imports.d.ts',
        ignore: ['h'],
        imports: [
          'vue',
          'vue-router',
          'pinia',
          {
            'naive-ui': [
              'useDialog',
              'useNotification',
              'useLoadingBar',
              'useThemeVars',
            ],
          },
        ],
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

  // 注入代理能力以解决系统代理时的外网访问问题
  // ProxyAgent 会自动使用系统代理设置，如果没有系统代理则直接连接目标服务器
  const upstreamAgent = new ProxyAgent();
  const proxy = config.server!.proxy!;
  Object.entries(proxy).forEach(([key, proxyConfig]) => {
    if (typeof proxyConfig === 'object') {
      proxyConfig.agent = upstreamAgent;
    } else {
      proxy[key] = {
        target: proxyConfig,
        changeOrigin: true,
        agent: upstreamAgent,
      };
    }
  });

  return config;
});
