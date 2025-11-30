import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Configure Vitest (https://vitest.dev/config/)
  plugins: [tsconfigPaths()],
  test: {},
});
