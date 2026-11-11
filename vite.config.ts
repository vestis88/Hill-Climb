import { defineConfig } from 'vitest/config'

// Relative base so the build works from any static host path (e.g. GitHub Pages).
// `npm run economy` and `npm run stages` set SIM to run one slow simulation instead of the tests.
export default defineConfig({
  base: './',
  test: { include: process.env.SIM ? [`scripts/${process.env.SIM}.sim.ts`] : ['tests/**/*.test.ts'] },
})
