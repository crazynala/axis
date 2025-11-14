import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prismaBase } from "../utils/prisma.server";
import { getUserId } from "../utils/auth.server";

// Lightweight internal product search for selects
export async function loader({ request }: LoaderFunctionArgs) {
  const uid = await getUserId(request);
  if (!uid) return json({ products: [] }, { status: 200 });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("limit") || 20))
  );
  const supplierIdRaw = url.searchParams.get("supplierId");
  const supplierId = supplierIdRaw ? Number(supplierIdRaw) : NaN;
  if (!q) return json({ products: [] });

  const asNum = Number(q);
  const isNum = Number.isFinite(asNum as any);

  const andClauses: any[] = [
    isNum ? { id: asNum as number } : { id: { gt: -1 } },
    {
      OR: [
        { sku: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
  ];
  if (Number.isFinite(supplierId) && supplierId > 0) {
    andClauses.push({ supplierId });
  }
  const products = await prismaBase.product.findMany({
    where: { AND: andClauses },
    select: { id: true, sku: true, name: true },
    take: limit,
    orderBy: [{ id: "desc" }],
  });

  console.debug("[api.products.search]", {
    q,
    supplierId: Number.isFinite(supplierId) ? supplierId : null,
    isNum,
    count: products.length,
  });

  return json({ products });
}
