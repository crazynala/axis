import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUserId } from "~/utils/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  const url = new URL(request.url);
  const ids = url
    .searchParams
    .getAll("ids")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));
  console.log("[production.dashboard.rows] fetch", { ids });
  if (!ids.length) return json({ rows: [] });
  const { fetchDashboardRows } = await import("./production.dashboard.server");
  const rows = await fetchDashboardRows(ids);
  console.log("[production.dashboard.rows] returning", rows.length);
  return json({ rows });
}
