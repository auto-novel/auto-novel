import { defineConfig, mergeConfig } from 'vitest/config';
import * as viteConfig from './vite.config.ts';
import path from 'path';

export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    test: {},
  }),
);
