import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../../../utils/prisma.server";

// Batch hydration endpoint: /companies/rows?ids=1,2,3
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  // Support repeated ids=1&ids=2 and comma lists ids=1,2; trim, dedupe, cap
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
  const rows = await prisma.company.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      notes: true,
      isCarrier: true,
      isCustomer: true,
      isSupplier: true,
      isInactive: true,
    },
  });
  // Preserve client-requested order for deterministic UI behavior
  const orderMap = new Map(rows.map((r) => [r.id, r] as const));
  const ordered = ids.map((id) => orderMap.get(id)).filter(Boolean);
  return json({ rows: ordered });
}
