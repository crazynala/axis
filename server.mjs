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
  app.use((_, res, next) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); next(); });
  app.use(express.json());
  app.use(compression());
  app.use(express.static(path.join(root, 'public')));

  // Optional API routes (if present in legacy src directory). Wrap separately to avoid crash in prod image.
  try {
    const productsRouter = (await import('./src/routes/products.js')).default || (await import('./src/routes/products.js'));
    const importRouter = (await import('./src/routes/import.js')).default || (await import('./src/routes/import.js'));
    const importAllRouter = (await import('./src/routes/importAll.js')).default || (await import('./src/routes/importAll.js'));
    app.use('/api/products', productsRouter);
    app.use('/api/import', importRouter);
    app.use('/api/import', importAllRouter);
  } catch (e) {
    console.warn('[server.mjs] API routes not loaded (ok):', e?.message || e);
  }

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
