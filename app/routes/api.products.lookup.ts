import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { prismaBase } from "~/utils/prisma.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const skusParam = url.searchParams.get("skus") || "";
  const skuParams = url.searchParams.getAll("sku");

  try {
    if (q) {
      const rows = await prismaBase.product.findMany({
        where: {
          OR: [
            { sku: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          sku: true,
          name: true,
          type: true,
          supplier: { select: { id: true, name: true } },
          _count: { select: { productLines: true } },
        },
        orderBy: [{ sku: "asc" }, { id: "asc" }],
        take: 100,
      });
      return json({ ok: true, products: rows });
    }

    const list = new Set<string>();
    if (skusParam) {
      skusParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => list.add(s));
    }
    skuParams
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => list.add(s));

    const skus = Array.from(list);
    if (!skus.length) return json({ ok: true, products: [] });

    const rows = await prismaBase.product.findMany({
      where: { sku: { in: skus } },
      select: {
        id: true,
        sku: true,
        name: true,
        type: true,
        supplier: { select: { id: true, name: true } },
      },
      orderBy: [{ sku: "asc" }, { id: "asc" }],
    });
    return json({ ok: true, products: rows });
  } catch (e: any) {
    return json(
      { ok: false, error: e?.message || "Lookup failed" },
      { status: 500 }
    );
  }
}
