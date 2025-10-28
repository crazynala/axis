import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig, type UserConfig, Plugin } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 🧼 No-cache header plugin for dev
const noCachePlugin: Plugin = {
  name: "no-cache-dev-server",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      next();
    });
  },
};

const r = (p) => path.resolve(fileURLToPath(new URL(".", import.meta.url)), p);

export default defineConfig({
  define: {
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(Date.now()), // 👈 inject version
  },
  server: {
    port: 3000,
    fs: { allow: ["..", "./packages"] },
  },
  plugins: [
    remix({
      future: {
        v3_routeConfig: true,
        v3_fetcherPersist: true,
        v3_lazyRouteDiscovery: true,
        v3_relativeSplatPath: true,
        v3_singleFetch: true,
        v3_throwAbortReason: true,
      },
    }),
    noCachePlugin,
  ],
  resolve: {
    alias: {
      "packages/timber": r("packages/timber/src/index.ts"),
      "~": r("app"),
    },
    // Ensure single React instance when linking local packages
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@remix-run/react"],
  },
  ssr: {
    noExternal: [
      "packages/timber",
      "@aa/timber",
      // Bundle the datasheet grid so Vite handles its CSS subpath imports in SSR
      "react-datasheet-grid",
    ],
  },
});
