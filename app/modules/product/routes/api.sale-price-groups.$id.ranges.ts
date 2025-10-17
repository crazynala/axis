import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUserId } from "~/utils/auth.server";
import { prisma } from "~/utils/prisma.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUserId(request);
  const id = Number(params.id);
  if (!Number.isFinite(id)) return json({ ranges: [] }, { status: 400 });
  const ranges = await prisma.salePriceRange.findMany({
    where: { saleGroupId: id },
    select: { rangeFrom: true, price: true },
    orderBy: { rangeFrom: "asc" },
    take: 2000,
  });
  return json({
    ranges: (ranges || [])
      .filter((r) => r.rangeFrom != null && r.price != null)
      .map((r) => ({
        minQty: Number(r.rangeFrom) || 0,
        unitPrice: Number(r.price) || 0,
      })),
  });
}
