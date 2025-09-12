import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { createRequestHandler } from '@remix-run/express';
import { broadcastDevReady } from '@remix-run/node';

const BOOT_VERSION_MARK = `srv-boot-${Date.now()}`;
console.log('[server.mjs] boot mark', BOOT_VERSION_MARK);

const isProduction = process.env.NODE_ENV === 'production';
const root = process.cwd();

async function loadDevBuild() {
  try { return await import('virtual:remix/server-build'); } catch {}
  try { return await import('@remix-run/dev/server-build'); } catch {}
  return await import('@remix-run/dev/server-build.js');
}

async function createServer() {
  const app = express();
  // EARLY defensive patch: normalize any multiple Content-Type attempts before other middleware.
  app.use((req, res, next) => {
    const seen = new Set();
    function normalizeHeaderName(name) { return typeof name === 'string' ? name.toLowerCase() : name; }
    const origSetHeader = res.setHeader.bind(res);
    const origAppend = res.append ? res.append.bind(res) : null;
    const origSet = res.set ? res.set.bind(res) : null;
    function coalesce(name, value) {
      if (normalizeHeaderName(name) === 'content-type') {
        if (Array.isArray(value)) {
          console.warn('[server.mjs][ct-guard] array content-type collapse', value, req.method, req.url);
          value = value[0];
        }
        if (typeof value === 'string') {
          // If already set to an equivalent value, ignore silently; if different, keep first.
          const existing = res.getHeader('Content-Type');
            if (existing) {
              if (Array.isArray(existing)) {
                // Unexpected: collapse and keep first
                origSetHeader('Content-Type', existing[0]);
              } else if (existing !== value) {
                console.warn('[server.mjs][ct-guard] multiple Content-Type values detected; preserving first', existing, 'dropping', value);
                return; // skip conflicting change
              }
            }
        }
      }
      return origSetHeader(name, value);
    }
    res.setHeader = coalesce;
    if (origAppend) {
      res.append = function(name, value) {
        if (normalizeHeaderName(name) === 'content-type') {
          // Express append would create array; redirect to setHeader logic instead
          return coalesce(name, value);
        }
        return origAppend(name, value);
      };
    }
    if (origSet) {
      res.set = function(field, val) {
        if (typeof field === 'string') return coalesce(field, val);
        if (field && typeof field === 'object') {
          for (const k of Object.keys(field)) coalesce(k, field[k]);
          return res;
        }
        return res;
      };
    }
    next();
  });
  app.use(cors());
  // Optional helmet: dynamically import so build doesn't fail if dependency absent yet.
  try {
    const helmetPkg = await import('helmet');
    const helmet = helmetPkg.default || helmetPkg;
    // Apply a minimal CSP; relax upgradeInsecureRequests for mixed resource environments.
    app.use(helmet());
    if (helmet.contentSecurityPolicy) {
      app.use(
        helmet.contentSecurityPolicy({
          useDefaults: true,
          directives: { upgradeInsecureRequests: null }
        })
      );
    }
  } catch (e) {
    console.warn('[server.mjs] helmet unavailable, continuing without enhanced security headers');
  }
  // Removed blanket Content-Type header setter; Remix sets appropriate Content-Type per response.
  app.use(express.json());
  app.use(compression());
  app.use(express.static(path.join(root, 'public')));
  // Diagnostic middleware: warn if Content-Type header already array-ified by some previous layer
  app.use((req, res, next) => {
    const origSet = res.setHeader.bind(res);
    res.setHeader = (name, value) => {
      if (name.toLowerCase() === 'content-type' && Array.isArray(value)) {
        console.warn('[server.mjs] Attempt to set Content-Type as array', value, 'for', req.method, req.url);
        value = value[0];
      }
      return origSet(name, value);
    };
    next();
  });

  // Removed legacy optional API route imports (./src/routes/*.js) – files no longer exist.

  app.get('/health', (_req, res) => {
    res.json({ ok: true, env: process.env.NODE_ENV || 'development', mark: BOOT_VERSION_MARK });
  });

  if (!isProduction) {
    app.all('*', createRequestHandler({ build: () => loadDevBuild(), mode: 'development' }));
  } else {
    const build = await import('./build/index.js');
    app.all('*', createRequestHandler({ build, mode: 'production' }));
  }
  return app;
}

let server;
(async () => {
  const app = await createServer();
  const basePort = Number(process.env.PORT || 3000);
  const listen = (port) => {
    server = app.listen(port, () => {
      console.log(`[server.mjs] listening on http://localhost:${port}`);
      if (!isProduction && process.env.REMIX_DEV_ORIGIN) {
        (async () => { try { broadcastDevReady(await loadDevBuild()); } catch {} })();
      }
    }).on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.warn(`[server.mjs] port ${port} in use; retry ${port + 1}`);
        listen(port + 1);
      } else throw err;
    });
  };
  listen(basePort);
})();

function shutdown() {
  if (server) server.close(() => process.exit(0)); else process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
