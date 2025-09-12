import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../utils/prisma.server";

// Batch hydration endpoint: /companies/rows?ids=1,2,3
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids");
  if (!idsParam) return json({ rows: [] });
  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
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
      isActive: true,
    },
  });
  // Preserve client-requested order for deterministic UI behavior
  const orderMap = new Map(rows.map((r) => [r.id, r] as const));
  const ordered = ids.map((id) => orderMap.get(id)).filter(Boolean);
  return json({ rows: ordered });
}

export default function CompaniesRowsRoute() {
  return null; // resource route
}
