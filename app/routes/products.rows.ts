import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prismaBase } from "../utils/prisma.server";

// Batch hydration for products: sparse detail fields for table listing
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids");
  if (!idsParam) return json({ rows: [] });
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 500)
    .map((v) => (v.match(/^\d+$/) ? Number(v) : v))
    .filter((v) => typeof v === "number") as number[];
  if (!ids.length) return json({ rows: [] });
  const rows = await prismaBase.product.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      sku: true,
      name: true,
      type: true,
      costPrice: true,
      manualSalePrice: true,
      autoSalePrice: true,
      stockTrackingEnabled: true,
      batchTrackingEnabled: true,
    },
  });
  return json({ rows });
}

export const meta = () => [];
