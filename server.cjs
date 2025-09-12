// Bridge loader: loads ESM server.js under a CommonJS invocation (Render `node server.cjs`).
// Avoids requiring dev-only @remix-run/serve in production container.

(async () => {
  try {
    await import('./server.js');
  } catch (err) {
    console.error('[server.cjs] Failed to load ESM server.js', err);
    process.exit(1);
  }
})();
