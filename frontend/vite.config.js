import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { quasar, transformAssetUrls } from "@quasar/vite-plugin";
import { fileURLToPath } from 'node:url'
export default defineConfig({
  plugins: [
    vue({ template: { transformAssetUrls } }),
    quasar({ sassVariables: fileURLToPath(
        new URL('./src/quasar-variables.scss', import.meta.url)
      )}),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true, rewrite: p => p.replace(/^\/api/, "") },
      "/ws":  { target: "ws://localhost:3000",   ws: true },
    },
  },
});
