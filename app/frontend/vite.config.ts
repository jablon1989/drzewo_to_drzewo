import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const dataDir = fileURLToPath(new URL("../../data", import.meta.url));

// Local dev:
//   `make local` -> `vite --mode fake` (.env.fake): fake backend on :8787, no AWS, no login
//   `make dev`   -> API_PROXY_TARGET=<CloudFront URL> in .env.local: the deployed API
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.API_PROXY_TARGET;
  const local = target?.startsWith("http://localhost");
  return {
    plugins: [react()],
    // The app's version (package.json), shown in the app. Each change adds 0.0.1;
    // the deploy workflow tags it as v<version> on GitHub.
    define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync("package.json", "utf8")).version) },
    resolve: { alias: { "@data": dataDir } },
    build: { chunkSizeWarningLimit: 600 }, // the tree list is ~540 kB (130 kB gzipped), loaded once
    server: {
      port: 5173,
      strictPort: true,
      host: true, // reachable from your phone on the same Wi-Fi
      fs: { allow: [".", dataDir] },
      proxy: target
        ? {
            "/api": { target, changeOrigin: true },
            // The fake backend also serves config.json and stores the photos.
            ...(local ? { "/dev-s3": { target }, "/config.json": { target } } : {}),
          }
        : undefined,
    },
  };
});
