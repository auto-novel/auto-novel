import { htmlBootstrapPlugin } from '@novelia/web-kit/vite';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type UserConfig } from 'vite';

const envDirectory = fileURLToPath(new URL('.', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

function readGitValue(args: string[]) {
  try {
    return execFileSync('git', args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function setupAuthProxy(config: UserConfig) {
  const authUrl = 'https://auth.novelia.cc';
  const proxy = config.server!.proxy!;

  proxy['^/api(?!/v1/auth)'] = proxy['/api'];
  delete proxy['/api'];
  proxy['/api/v1/auth'] = { target: authUrl, changeOrigin: true };
  proxy['/auth-proxy/assets'] = {
    target: authUrl,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/auth-proxy\/assets/, '/assets'),
  };
  proxy['/auth-proxy'] = {
    target: authUrl,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/auth-proxy/, ''),
    selfHandleResponse: true,
    headers: { 'accept-encoding': 'identity' },
    configure(proxyServer) {
      proxyServer.on('proxyRes', (proxyResponse, _request, response) => {
        const chunks: Buffer[] = [];
        proxyResponse.on('data', (chunk: Buffer) => chunks.push(chunk));
        proxyResponse.on('end', () => {
          const body = Buffer.concat(chunks)
            .toString()
            .replaceAll('/assets', '/auth-proxy/assets');
          response.statusCode = proxyResponse.statusCode ?? 200;
          response.statusMessage = proxyResponse.statusMessage ?? '';
          for (const [key, value] of Object.entries(proxyResponse.headers)) {
            if (value !== undefined) response.setHeader(key, value);
          }
          response.removeHeader('content-length');
          response.end(body);
        });
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, envDirectory, 'VITE_');
  const isServe = command === 'serve';
  const apiMode = env.VITE_API_MODE;
  const apiUrl =
    env.VITE_API_URL ||
    (apiMode === 'native'
      ? 'http://localhost:8080'
      : apiMode === 'local'
        ? 'http://localhost:5000'
        : 'https://n.novelia.cc');
  const commitSha =
    env.VITE_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    readGitValue(['rev-parse', 'HEAD']);
  const buildTime =
    env.VITE_BUILD_TIME ||
    (isServe
      ? readGitValue(['show', '-s', '--format=%cI', 'HEAD'])
      : new Date().toISOString());

  const config: UserConfig = {
    base: '/admin/',
    define: {
      __AUTH_URL__: JSON.stringify(
        isServe ? '/auth-proxy/' : 'https://auth.novelia.cc/',
      ),
      __BUILD_TIME__: JSON.stringify(buildTime),
      __COMMIT_SHA__: JSON.stringify(commitSha),
    },
    plugins: [htmlBootstrapPlugin(), vue(), tailwindcss()],
    build: { cssCodeSplit: false },
    optimizeDeps: {
      exclude: ['@novelia/web-kit'],
      include: ['@vicons/material'],
    },
    server: {
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          rewrite:
            apiMode === 'native'
              ? (path: string) => path.replace(/^\/api/, '')
              : undefined,
        },
      },
    },
    resolve: {
      dedupe: ['vue', 'vue-router'],
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  };

  if (isServe) setupAuthProxy(config);

  return config;
});
