import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      three: path.resolve(__dirname, 'node_modules/three')
    },
    dedupe: ['three', 'react', 'react-dom', 'three-mesh-bvh', '@thatopen/components']
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/web-ifc/web-ifc.wasm',
          dest: 'wasm'
        },
        {
          src: 'node_modules/web-ifc/web-ifc-mt.wasm',
          dest: 'wasm'
        },
        {
          src: 'node_modules/@thatopen/fragments/dist/Worker/worker.mjs',
          dest: 'fragments'
        }
      ]
    })
  ],
})
