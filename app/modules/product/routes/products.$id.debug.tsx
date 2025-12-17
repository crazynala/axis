import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUserId } from "~/utils/auth.server";
import { getDebugAccessForUser } from "~/modules/debug/debugAccess.server";
import { buildProductDebug } from "~/modules/debug/builders/product.server";

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
  const payload = await buildProductDebug(id);
  if (!payload) {
    throw new Response("Not found", { status: 404 });
  }
  return json(payload);
}
