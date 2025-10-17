import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUserId } from "~/utils/auth.server";
import { prisma } from "~/utils/prisma.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUserId(request);
  const id = Number(params.id);
  if (!Number.isFinite(id)) return json({ ranges: [] }, { status: 400 });
  const ranges = await prisma.productCostRange.findMany({
    where: { costGroupId: id },
    select: { rangeFrom: true, costPrice: true, sellPriceManual: true },
    orderBy: { rangeFrom: "asc" },
    take: 2000,
  });
  return json({
    ranges: (ranges || [])
      .filter((r) => r.rangeFrom != null)
      .map((r) => ({
        minQty: Number(r.rangeFrom) || 0,
        unitCost: Number(r.costPrice ?? 0) || 0,
        unitSellManual: Number(r.sellPriceManual ?? 0) || 0,
      })),
  });
}
