import { defineConfig } from 'vitest/config'

// A unique id per build: baked into the game and written to version.json, so a running game can
// notice that a newer version has been published and offer to reload (src/main.ts).
const BUILD_ID = new Date().toISOString()

// Relative base so the build works from any static host path (e.g. GitHub Pages).
// `npm run economy` and `npm run stages` set SIM to run one slow simulation instead of the tests.
export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    {
      name: 'version-file',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) })
      },
    },
  ],
  test: {
    include: process.env.SIM ? [`scripts/${process.env.SIM}.sim.ts`] : ['tests/**/*.test.ts'],
    // Physics tests simulate many seconds of driving; shared CI runners can be several times
    // slower than a laptop, and the 5 s default once timed out a passing test there.
    testTimeout: 30000,
  },
})
