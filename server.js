require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const { createRequestHandler } = require("@remix-run/express");
const { broadcastDevReady } = require("@remix-run/node");
const helmet = require("helmet");

const isProduction = process.env.NODE_ENV === "production";
const root = process.cwd();

// Helper: load the Remix server build in development (manual or virtual)
async function loadDevBuild() {
  // Try Vite virtual module first (when using the Vite plugin)
  try {
    return await import("virtual:remix/server-build");
  } catch (_) {
    // Then try Remix CLI export without extension
    try {
      return await import("@remix-run/dev/server-build");
    } catch (_) {
      // Node ESM in newer versions may require explicit .js
      return await import("@remix-run/dev/server-build.js");
    }
  }
}

async function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  // Security headers & charset hints
  app.use(
    helmet.contentSecurityPolicy({
      useDefaults: true,
      directives: { upgradeInsecureRequests: null },
    })
  );
  // Hint UTF-8 for text/* when possible
  app.use((req, res, next) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    next();
  });
  app.use(express.json());
  app.use(compression());
  app.use(express.static(path.join(root, "public")));

  // API routes (Prisma-backed)
  try {
    const productsRouter = require("./src/routes/products.js");
    const importRouter = require("./src/routes/import.js");
    const importAllRouter = require("./src/routes/importAll.js");
    app.use("/api/products", productsRouter);
    app.use("/api/import", importRouter);
    app.use("/api/import", importAllRouter);
  } catch (e) {
    console.warn("API routes not loaded:", e?.message || e);
  }

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ ok: true, env: process.env.NODE_ENV || "development" });
  });

  // Remix request handler (dev and prod)
  if (!isProduction) {
    app.all(
      "*",
      createRequestHandler({
  build: () => loadDevBuild(),
        mode: "development",
      })
    );
  } else {
    app.all(
      "*",
      createRequestHandler({
        build: require("./build"),
        mode: "production",
      })
    );
  }

  return app;
}

let server;
createServer().then((app) => {
  const basePort = Number(process.env.PORT || 3000);
  function listen(port) {
    server = app
      .listen(port, () => {
        console.log(`HTTP server is running at http://localhost:${port}`);
  if (!isProduction && process.env.REMIX_DEV_ORIGIN) {
          (async () => {
            try {
              const build = await loadDevBuild();
              broadcastDevReady(build);
            } catch (e) {
              // ignore if build cannot be imported (non-manual mode)
            }
          })();
        }
      })
      .on("error", (err) => {
        if (err && err.code === "EADDRINUSE") {
          const next = port + 1;
          console.warn(`Port ${port} in use; trying ${next}...`);
          listen(next);
        } else {
          throw err;
        }
      });
  }
  listen(basePort);
});

function shutdown() {
  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
