import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getDebugAccess } from "~/modules/debug/debugAccess.server";
import { buildDashboardRowDebug } from "~/modules/debug/builders/dashboardRow.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { canDebug } = await getDebugAccess(request);
  if (!canDebug) {
    return json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const assemblyId = Number(url.searchParams.get("assemblyId"));
  if (!Number.isFinite(assemblyId) || assemblyId <= 0) {
    return json({ error: "invalid" }, { status: 400 });
  }
  const payload = await buildDashboardRowDebug(assemblyId);
  if (!payload) {
    return json({ error: "missing" }, { status: 404 });
  }
  return json(payload);
}
