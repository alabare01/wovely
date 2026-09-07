// Separate config for the build-time prerender bundle. Kept out of
// vite.config.js so the client build's plugins (the first-run gate and the
// per-route head writer) do not run a second time and overwrite dist/.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    ssr: 'src/entry-prerender.jsx',
    outDir: 'dist-prerender',
    emptyOutDir: true,
    // Bundle everything. react-router v7 ships CJS, which Node cannot import
    // as ESM and Vite's SSR module runner cannot interop; rollup's commonjs
    // plugin can, so the whole graph goes through the bundler instead.
    rollupOptions: { external: ['react', 'react-dom', 'react-dom/server'] },
    minify: false,
  },
  ssr: { noExternal: true },
})
