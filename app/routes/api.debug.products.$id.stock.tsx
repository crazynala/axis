import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUserId } from "~/utils/auth.server";
import { getDebugAccessForUser } from "~/modules/debug/debugAccess.server";
import { buildProductStockDebug } from "~/modules/debug/builders/productStock.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const debugAccess = await getDebugAccessForUser(userId);
  if (!debugAccess.canDebug) {
    throw new Response("Not authorized", { status: 403 });
  }
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    throw new Response("Invalid product id", { status: 400 });
  }
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "");
  const cursor = url.searchParams.get("cursor");
  const includeSnapshot = url.searchParams.get("includeSnapshot");
  const includeLedger = url.searchParams.get("includeLedger");
  const includeReconciliation = url.searchParams.get("includeReconciliation");

  const payload = await buildProductStockDebug(id, {
    limit: Number.isFinite(limit) ? limit : undefined,
    cursor: cursor && cursor.trim() ? cursor : null,
    includeSnapshot: includeSnapshot !== "false",
    includeLedger: includeLedger !== "false",
    includeReconciliation: includeReconciliation !== "false",
  });
  if (!payload) {
    throw new Response("Not found", { status: 404 });
  }
  return json(payload);
}
