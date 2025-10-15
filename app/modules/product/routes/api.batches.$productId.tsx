import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getBatchesWithComputedQty } from "~/utils/prisma.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const pid = Number(params.productId);
  if (!Number.isFinite(pid))
    return json({ error: "invalid product id" }, { status: 400 });
  console.log("[api.batches] fetching batches for product", { productId: pid });
  const batches = await getBatchesWithComputedQty(pid);
  console.log("[api.batches] found batches", { count: batches.length });
  console.log("!! batches", batches);
  return json({ batches });
}
