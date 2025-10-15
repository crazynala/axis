import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prismaBase } from "~/utils/prisma.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const idStr = params.id;
  const productId = Number(idStr);
  if (!idStr || Number.isNaN(productId)) {
    throw new Response("Invalid product id", { status: 400 });
  }
  const product = await prismaBase.product.findUnique({
    where: { id: productId },
    select: { id: true, costGroupId: true, supplierId: true },
  });
  if (!product) throw new Response("Not found", { status: 404 });

  const tiers: Array<{ minQty: number; unitPrice: number; source: string }> =
    [];
  const toNum = (v: any) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? (n as number) : null;
  };
  const push = (from: any, price: any, source: string) => {
    const minQty = Math.max(1, toNum(from) ?? 1);
    const unitPrice = toNum(price);
    if (unitPrice != null) tiers.push({ minQty, unitPrice, source });
  };

  // Product-specific ranges
  const pr = await prismaBase.productCostRange.findMany({
    where: { productId },
    orderBy: [{ rangeFrom: "asc" }, { id: "asc" }],
    select: { rangeFrom: true, costPrice: true },
  });
  for (const r of pr) push(r.rangeFrom as any, r.costPrice, "product");

  // Group ranges (resolve group from product.costGroupId or supplier default)
  let groupId: number | null = product.costGroupId ?? null;
  if (!groupId && product.supplierId) {
    const g = await prismaBase.productCostGroup.findFirst({
      where: { supplierId: product.supplierId },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    groupId = g?.id ?? null;
  }
  if (groupId) {
    const group = await prismaBase.productCostGroup.findUnique({
      where: { id: groupId },
      select: { costPrice: true },
    });
    if (group?.costPrice != null) push(1, group.costPrice, "group");
    const gr = await prismaBase.productCostRange.findMany({
      where: { costGroupId: groupId },
      orderBy: [{ rangeFrom: "asc" }, { id: "asc" }],
      select: { rangeFrom: true, costPrice: true },
    });
    for (const r of gr) push(r.rangeFrom as any, r.costPrice, "group");
  }

  tiers.sort((a, b) => a.minQty - b.minQty);
  return json({ tiers });
}
