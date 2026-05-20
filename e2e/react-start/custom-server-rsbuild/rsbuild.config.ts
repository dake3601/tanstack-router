import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'

// `CJS=1` forces the client to emit UMD instead of ES modules.
const FORCE_CJS = process.env.CJS === '1'

export default defineConfig({
  plugins: [
    pluginReact({ splitChunks: false }),
    tanstackStart({ rsbuild: { installDevServerMiddleware: false } }),
  ],
  source: {
    define: { 'import.meta.env.CJS': JSON.stringify(FORCE_CJS) },
  },
  ...(FORCE_CJS && {
    environments: {
      client: {
        tools: {
          rspack: (config) => {
            config.output = {
              ...config.output,
              // Defaults
              module: false,
              library: { type: 'umd', name: 'CjsBundle' },
              chunkLoading: 'jsonp',
              chunkFormat: 'array-push',
            }
            if (config.experiments) {
              config.experiments.outputModule = false
            }
          },
        },
      },
    },
  }),
})
