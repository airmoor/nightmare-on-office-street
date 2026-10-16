import { defineConfig } from 'vite'

// Files in static/ (social preview image, favicon) are copied to the build root as is
export default defineConfig({
    publicDir: 'static',
    build: {
        // three.js alone is ~600 kB minified (~160 kB gzip); the game code itself is small
        chunkSizeWarningLimit: 700,
    },
})
