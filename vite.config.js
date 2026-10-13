import { defineConfig } from 'vite'

// Files in static/ (social preview image, favicon) are copied to the build root as is
export default defineConfig({
    publicDir: 'static',
})
