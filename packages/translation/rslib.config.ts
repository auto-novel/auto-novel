import { defineConfig } from '@rslib/core';

const isDebug = process.env.NODE_ENV !== 'production';

export default defineConfig({
  resolve: {
    alias: {
      '@': './src',
    },
  },
  lib: [
    {
      format: 'esm',
      dts: true,
      bundle: true,
      source: {
        entry: { index: 'src/index.ts' },
        tsconfigPath: 'tsconfig.json',
      },
      output: {
        target: 'web',
      },
    },
  ],
  output: {
    cleanDistPath: true,
    sourceMap: isDebug,
    minify: !isDebug,
  },
});
