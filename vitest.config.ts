import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// main.ts renders on import — it is an entrypoint, not a module of pure helpers. That is exactly
// what makes a DOM environment mandatory here, and it is also why the tests treat the page as a
// black box: import it, then assert on the HTML it produced. Those assertions survive a refactor of
// how the HTML is built, which is the point.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: [resolve(__dirname, 'test/setup.ts')],
    include: ['src/**/*.test.ts'],
  },
});
