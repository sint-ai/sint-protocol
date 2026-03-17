import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3201,
    proxy: {
      "/v1": {
        target: "http://localhost:3100",
        changeOrigin: true,
      },
      "/metrics": {
        target: "http://localhost:3100",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
