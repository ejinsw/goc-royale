import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "client",
  plugins: [react()],
  // Shown in Settings, so players can tell which build a device is running.
  define: {
    __BUILD__: JSON.stringify(
      (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
    ),
  },
  build: { outDir: "../dist", emptyOutDir: true },
  server: { port: 5173 },
});
