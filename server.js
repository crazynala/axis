// Deprecated: runtime now uses server.mjs via server.cjs bridge.
// Retained as a no-op to avoid stale deployment artifacts executing outdated logic.
console.warn('[server.js] Deprecated file loaded unexpectedly. Ensure start script invokes server.cjs (ESM bridge).');
export {}; // ESM no-op
