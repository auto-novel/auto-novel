import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  pack: {
    platform: 'browser',
    target: 'esnext',
    dts: { sourcemap: true },
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
