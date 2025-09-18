import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prismaBase } from "../utils/prisma.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
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
  const rows = await prismaBase.purchaseOrder.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      date: true,
      company: { select: { id: true, name: true } },
      consignee: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      lines: { select: { priceCost: true, quantity: true } },
    },
  });
  const enhanced = rows.map((r: any) => ({
    ...r,
    vendorName: r.company?.name || "",
    consigneeName: r.consignee?.name || "",
    locationName: r.location?.name || "",
    totalCost: (r.lines || []).reduce(
      (sum: number, l: any) => sum + (l.priceCost || 0) * (l.quantity || 0),
      0
    ),
  }));
  const map = new Map(enhanced.map((r) => [r.id, r] as const));
  const ordered = ids.map((id) => map.get(id)).filter(Boolean);
  return json({ rows: ordered });
}
