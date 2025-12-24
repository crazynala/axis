// app/routes.ts
import type { RouteConfig } from "@remix-run/route-config";
import { flatRoutes } from "@remix-run/fs-routes";
// (optional) you can also import { route, layout, index } from "@remix-run/route-config" to add ad-hoc routes

// NOTE: default export may be a Promise<RouteConfig>,
// so we can use top-level await and array spreads.
export default [
  // 1) Keep your conventional app/routes/** (if you want):
  ...(await flatRoutes()),

  // 2) Mount module routes (pick as many folders as you like):
  ...(await flatRoutes({ rootDirectory: "modules/company/routes" })),
  ...(await flatRoutes({ rootDirectory: "modules/address/routes" })),
  ...(await flatRoutes({ rootDirectory: "modules/box/routes" })),
  ...(await flatRoutes({ rootDirectory: "modules/product/routes" })),
  ...(await flatRoutes({ rootDirectory: "modules/job/routes" })),
  ...(await flatRoutes({ rootDirectory: "modules/purchaseOrder/routes" })),
  ...(await flatRoutes({ rootDirectory: "modules/shipment/routes" })),
  ...(await flatRoutes({ rootDirectory: "modules/integrity/routes" })),
  ...(await flatRoutes({ rootDirectory: "modules/production/routes" })),

  // 3) You can also mix in hand-written routes if needed:
  // route("/healthz", "routes/healthz.tsx"),
] satisfies RouteConfig;
