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
  resolve: {
    alias: {
      "packages/timber": r("packages/timber/src/index.ts"),
    },
  },
  ssr: {
    noExternal: ["packages/timber", "@aa/timber"],
  },
  plugins: [remix()],
});
