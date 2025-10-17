import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../utils/prisma.server";

// Batch row hydration endpoint for hybrid model.
// Usage: /invoices/rows?ids=1,2,3  (up to 500 ids per request)
// Returns minimal invoice row plus computed amount aggregate.
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

  // Fetch core rows
  const rows = await prisma.invoice.findMany({
    where: {
      id: { in: ids.filter((x): x is number => typeof x === "number") },
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      invoiceCode: true,
      date: true,
      status: true,
      company: { select: { name: true } },
    },
  });
  const numIds = rows.map((r) => r.id);
  const lines = numIds.length
    ? await prisma.invoiceLine.findMany({
        where: { invoiceId: { in: numIds } },
        select: { invoiceId: true, priceSell: true, quantity: true },
      })
    : [];
  const totals = new Map<number, number>();
  for (const l of lines) {
    const amt = Number(l.priceSell ?? 0) * Number(l.quantity ?? 0);
    totals.set(l.invoiceId!, (totals.get(l.invoiceId!) ?? 0) + amt);
  }
  const withTotals = rows.map((r) => ({ ...r, amount: totals.get(r.id) ?? 0 }));
  // Preserve client-requested order
  const map = new Map(withTotals.map((r) => [r.id, r] as const));
  const ordered = ids.map((id) => map.get(id)).filter(Boolean);
  return json({ rows: ordered });
}

export const meta = () => [];
