import { RemixBrowser } from "@remix-run/react";
import { hydrateRoot } from "react-dom/client";

// Env + HMR diagnostics
console.log(
  `[env] client NODE_ENV=${process.env.NODE_ENV} | HMR=${Boolean(
    (import.meta as any)?.hot
  )}`
);

// In dev, force a full reload when the Remix asset manifest version changes.
// This guarantees auto-refresh even when HMR accepts updates but UI doesn't rerender.
if (process.env.NODE_ENV === "development") {
  const getVersion = () =>
    (window as any).__remixManifest?.version as string | undefined;
  let current = getVersion();
  // Poll lightly; the dev server updates __remixManifest on rebuild.
  const id = window.setInterval(() => {
    const next = getVersion();
    if (current && next && next !== current) {
      window.clearInterval(id);
      window.location.reload();
    }
  }, 500);
}

hydrateRoot(document, <RemixBrowser />);

// As a final fallback in dev, reload on any HMR update if Fast Refresh
// accepts the update but the UI doesn't visibly change.
if (process.env.NODE_ENV === "development") {
  const hot = (import.meta as any)?.hot;
  if (hot && typeof hot.accept === "function") {
    try {
      hot.accept(() => window.location.reload());
    } catch {}
  }
}
