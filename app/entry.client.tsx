import { RemixBrowser } from "@remix-run/react";
import { hydrateRoot } from "react-dom/client";

// Let Vite plugin-react handle HMR and fast refresh without custom listeners
hydrateRoot(document, <RemixBrowser />);
