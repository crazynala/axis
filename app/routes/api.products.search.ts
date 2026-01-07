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
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam)
    ? Math.min(50, Math.max(1, limitParam))
    : 50;
  const supplierIdRaw = url.searchParams.get("supplierId");
  const supplierId = supplierIdRaw ? Number(supplierIdRaw) : NaN;
  const tokens = q
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const andClauses: any[] = [];
  if (Number.isFinite(supplierId) && supplierId > 0) {
    andClauses.push({ supplierId });
  }
  if (tokens.length) {
    andClauses.push(
      ...tokens.map((token) => ({
        OR: [
          { sku: { contains: token, mode: "insensitive" } },
          { name: { contains: token, mode: "insensitive" } },
          { description: { contains: token, mode: "insensitive" } },
        ],
      }))
    );
  }
  const products = await prismaBase.product.findMany({
    where: andClauses.length ? { AND: andClauses } : undefined,
    select: { id: true, sku: true, name: true, productStage: true },
    take: limit,
    orderBy: [{ id: "desc" }],
  });

  console.debug("[api.products.search]", {
    q,
    supplierId: Number.isFinite(supplierId) ? supplierId : null,
    tokens: tokens.length,
    count: products.length,
  });

  return json({ products });
}
