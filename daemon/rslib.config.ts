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
      dts: true,
      bundle: true,
      // daemon is a deployable Node.js application: bundle package
      // dependencies while keeping Node.js built-ins external.
      autoExternal: false,
      shims: {
        esm: {
          __dirname: true,
          require: true,
        },
      },
      source: {
        entry: { app: 'src/index.ts' },
        tsconfigPath: 'tsconfig.app.json',
      },
      output: {
        externals: ['impit'],
        target: 'node',
      },
      banner,
    },
  ],
  output: {
    cleanDistPath: true,
    sourceMap: is_debug,
    minify: !is_debug,
  },
  tools: {
    rspack(config) {
      // CommonJS dependencies expect require('buffer'), require('util'), etc.
      // Preserve that behavior for built-ins in the ESM application bundle.
      config.externalsType = 'commonjs';
    },
  },
});
