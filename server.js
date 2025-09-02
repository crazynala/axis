require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const { createRequestHandler } = require("@remix-run/express");

const isProduction = process.env.NODE_ENV === "production";
const root = process.cwd();

async function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
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
        build: async () => {
          try {
            // Vite plugin virtual module (if present)
            return await import("virtual:remix/server-build");
          } catch (_) {
            // Remix CLI virtual module
            return await import("@remix-run/dev/server-build");
          }
        },
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
