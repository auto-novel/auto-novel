import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

const sourceDirectory = fileURLToPath(new URL('./src', import.meta.url));
const isDebug = process.env.NODE_ENV !== 'production';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  pack: {
    entry: { app: 'src/index.ts' },
    alias: { '@': sourceDirectory },
    tsconfig: 'tsconfig.app.json',
    platform: 'node',
    target: 'node22.5',
    format: 'esm',
    fixedExtension: false,
    // 保留工作区包和原生依赖的运行时导入，不将 impit 打进 JS。
    deps: { neverBundle: true },
    dts: false,
    banner: '// @AutoNovel | (c) 2025 n.novelia.cc | GPL-3.0 License',
    clean: true,
    sourcemap: isDebug,
    minify: !isDebug,
  },
  test: {
    // 各包独立缓存，避免并行测试共享工作区模块缓存文件。
    fsModuleCachePath: 'node_modules/.vitest-cache',
  },
});
