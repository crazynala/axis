// Minimal bridge: loads pure ESM server (server.mjs). No fallback to @remix-run/serve.
// If this fails on Render, the logs will clearly show the timestamp and cause.
console.log('[server.cjs] bridge starting', new Date().toISOString());
(async () => {
  try {
    const mod = await import('./server.mjs');
    if (!mod) throw new Error('Empty module returned');
    console.log('[server.cjs] ESM server loaded');
  } catch (err) {
    console.error('[server.cjs] Failed to load server.mjs', err);
    process.exit(1);
  }
})();
