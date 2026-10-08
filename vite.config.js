import { defineConfig } from 'vite'

// Файлы из static/ (превью для соцсетей, favicon) копируются в корень сборки как есть
export default defineConfig({
    publicDir: 'static',
})
