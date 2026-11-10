import { defineConfig } from 'vitest/config'

// Relative base so the build works from any static host path (e.g. GitHub Pages).
// `npm run economy` sets ECONOMY=1 to run the slow economy simulation instead of the tests.
export default defineConfig({
  base: './',
  test: { include: process.env.ECONOMY ? ['scripts/**/*.sim.ts'] : ['tests/**/*.test.ts'] },
})
