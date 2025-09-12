// Production entrypoint used by npm start. Previously empty -> caused early exit on Render.
// Delegates to ESM-aware server.js (Express + Remix) or falls back to @remix-run/serve.

try {
	require('./server.js');
} catch (err) {
	console.error('[server.cjs] Failed to load custom server.js. Falling back to @remix-run/serve. Error:', err);
	try {
		// Fallback: run the built remix app directly
		require('@remix-run/serve');
	} catch (serveErr) {
		console.error('[server.cjs] Fallback @remix-run/serve also failed:', serveErr);
		process.exit(1);
	}
}
