import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma, prismaBase, runWithDbActivity } from "../utils/prisma.server";

// Batch hydration for products: sparse detail fields for table listing
export async function loader({ request }: LoaderFunctionArgs) {
  return runWithDbActivity("products.rows", async () => {
    const url = new URL(request.url);
    // Support either repeated ids=123&ids=456 or a single comma separated ids=123,456
    const rawIds = url.searchParams.getAll("ids");
    if (!rawIds.length) return json({ rows: [] });
    const flattened: string[] = [];
    for (const part of rawIds) {
      if (!part) continue;
      for (const piece of part.split(",")) {
        const trimmed = piece.trim();
        if (trimmed) flattened.push(trimmed);
      }
    }
    const ids = Array.from(new Set(flattened))
      .slice(0, 500)
      .map((v) => (v.match(/^\d+$/) ? Number(v) : v))
      .filter((v) => typeof v === "number") as number[];
    if (!ids.length) return json({ rows: [] });
    if (process.env.NODE_ENV !== "production") {
      console.debug(
        "[products.rows] hydrating ids",
        ids.slice(0, 20),
        ids.length
      );
    }
    const baseRows = await prismaBase.product.findMany({
      where: { id: { in: ids } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        sku: true,
        name: true,
        type: true,
        costPrice: true,
        manualSalePrice: true,
        stockTrackingEnabled: true,
        batchTrackingEnabled: true,
      },
    });
    // Attach dynamic computed sell price (manual overrides cost-with-tax)
    const rows = await Promise.all(
      baseRows.map(async (r) => {
        const autoSellPrice = await (prisma as any).product.getSellPrice(
          { id: r.id },
          null
        );
        return { ...r, autoSellPrice } as any;
      })
    );
    return json({ rows });
  });
}

export const meta = () => [];
