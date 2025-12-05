import { defineConfig } from '@rslib/core';

const banner_str = `// @AutoNovel | (c) 2025 n.novelia.cc | GPL-3.0 License`;
const banner = { js: banner_str, css: banner_str, dts: banner_str };

const is_debug = process.env.NODE_ENV !== 'production';

export default defineConfig({
  resolve: {
    alias: {
      '@': './src',
    },
  },
  lib: [
    {
      format: 'esm',
      dts: false,
      bundle: true,
      source: {
        entry: { app: 'src/app/index.ts' },
        tsconfigPath: 'tsconfig.app.json',
      },
      output: {
        target: 'node',
      },
      banner,
    },
    {
      format: 'esm',
      dts: true,
      bundle: true,
      source: {
        entry: { lib: 'src/lib/index.ts' },
        tsconfigPath: 'tsconfig.lib.json',
      },
      output: { target: 'web' },
      banner,
    },
  ],
  output: {
    cleanDistPath: true,
    sourceMap: is_debug,
    minify: !is_debug,
  },
});
