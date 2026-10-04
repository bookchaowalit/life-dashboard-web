import { fileURLToPath } from 'node:url';

import { configDefaults, defineConfig } from 'vitest/config';

// Route handlers import through the `@/` alias from tsconfig.json.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  // Standalone staging utilities use node:test and have their own Node runner.
  test: { exclude: [...configDefaults.exclude, 'scripts/*.test.mjs'] },
});
