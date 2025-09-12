import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../utils/prisma.server";

// Batch row hydration endpoint for hybrid model.
// Usage: /invoices/rows?ids=1,2,3  (up to 500 ids per request)
// Returns minimal invoice row plus computed amount aggregate.
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids");
  if (!idsParam) return json({ rows: [] });
  const rawIds = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Normalize to numbers when possible
  const ids = rawIds
    .slice(0, 500) // safety cap
    .map((v) => (v.match(/^\d+$/) ? Number(v) : v));
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
    const amt = (l.priceSell ?? 0) * (l.quantity ?? 0);
    totals.set(l.invoiceId!, (totals.get(l.invoiceId!) ?? 0) + amt);
  }
  const withTotals = rows.map((r) => ({ ...r, amount: totals.get(r.id) ?? 0 }));
  return json({ rows: withTotals });
}

export const meta = () => [];
