import { defineConfig } from "vite";
import { vitePlugin as remix } from "@remix-run/dev";
import path from "node:path";
import { fileURLToPath } from "node:url";

const r = (p) => path.resolve(fileURLToPath(new URL(".", import.meta.url)), p);

export default defineConfig({
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
