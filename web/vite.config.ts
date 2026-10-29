import tailwindcss from '@tailwindcss/vite';
import { themeBootstrapPlugin } from '@novelia/web-kit/vite';
import vue from '@vitejs/plugin-vue';
import { execFileSync } from 'node:child_process';
import path from 'path';
import { ProxyAgent } from 'proxy-agent';
import Sonda from 'sonda/vite';
import AutoImport from 'unplugin-auto-import/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';
import Components from 'unplugin-vue-components/vite';
import type { UserConfig } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';

function resolveGitCommit(env: Record<string, string>) {
  const injectedCommit =
    env.VITE_COMMIT_SHA ||
    process.env.VITE_COMMIT_SHA ||
    process.env.GIT_COMMIT ||
    process.env.GITHUB_SHA;
  if (injectedCommit) return injectedCommit;

  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    // Some restricted build environments return the command output together
    // with an execution error. The resolved hash is still safe to use.
    const stdout = (error as { stdout?: string | Buffer }).stdout;
    return stdout?.toString().trim() || 'unknown';
  }
}

function setupRemoteAuthProxy(config: UserConfig) {
  const AuthUrl = 'https://auth.novelia.cc';
  const proxy = config.server!.proxy!;

  // 解决 /api /api/v1/auth 代理冲突问题
  proxy['^/api(?!/v1/auth)'] = proxy['/api'];
  delete proxy['/api'];

  // 兼容旧接口路径
  proxy['/api/v1/auth'] = {
    target: AuthUrl,
    changeOrigin: true,
  };

  // 代理静态资源
  proxy['/auth-proxy/assets'] = {
    target: AuthUrl,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/auth-proxy\/assets/, '/assets'),
  };

  // 代理首页
  proxy['/auth-proxy'] = {
    target: AuthUrl,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/auth-proxy/, ''),
    selfHandleResponse: true,
    headers: {
      'accept-encoding': 'identity',
    },
    configure(proxy) {
      proxy.on('proxyRes', (proxyRes, _req, res) => {
        const chunks: Buffer[] = [];
        proxyRes.on('data', (chunk) => {
          chunks.push(chunk);
        });
        proxyRes.on('end', () => {
          const body = Buffer.concat(chunks)
            .toString()
            .replaceAll('/assets', '/auth-proxy/assets');

          res.statusCode = proxyRes.statusCode ?? 200;
          res.statusMessage = proxyRes.statusMessage ?? '';
          for (const [key, value] of Object.entries(proxyRes.headers)) {
            if (value !== undefined) {
              res.setHeader(key, value);
            }
          }
          res.removeHeader('content-length');
          res.end(body);
        });
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd());
  const isServe = command === 'serve';
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
  const buildInfo = {
    gitCommit: resolveGitCommit(env),
    buildTime:
      env.VITE_BUILD_TIME ||
      process.env.VITE_BUILD_TIME ||
      new Date().toISOString(),
  };

  const config: UserConfig = {
    define: {
      __BUILD_INFO__: JSON.stringify(buildInfo),
      __AUTH_URL__: JSON.stringify(
        isServe ? '/auth-proxy/' : 'https://auth.novelia.cc/',
      ),
    },
    resolve: {
      tsconfigPaths: true,
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    optimizeDeps: {
      // web-kit 发布 Vue 源码，避免预构建与 SFC 分别创建注入标识和单例。
      exclude: ['@novelia/web-kit'],
    },
    build: {
      target: ['es2015'],
      cssCodeSplit: false,
      rollupOptions: {
        treeshake: true,
        output: {
          manualChunks(id) {
            // Harness 相关代码单独成 chunk：只有启动对应预设时才会下载，
            // 默认翻译流程不会因额外的模型适配代码增加首屏体积。
            if (
              id.includes('/translator/harness/HarnessMode.ts') ||
              id.endsWith('/translator/dist/harness.js')
            ) {
              return 'harness';
            } else if (id.includes('web/src')) {
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
      tailwindcss(),
      themeBootstrapPlugin(),
      createHtmlPlugin({
        minify: { minifyJS: true },
      }),
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

  if (isServe) {
    setupRemoteAuthProxy(config);
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
