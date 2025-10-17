import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../utils/prisma.server";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../base/find/multiFind";

// Batch loader for infinite scroll. Cursor = last seen invoice id (numeric ascending order)
// Accepts optional limit (default 50) and same find filter params as index route.
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const cursorRaw = url.searchParams.get("cursor");
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(200, Math.max(1, Number(limitRaw) || 50));
  const cursor = cursorRaw ? Number(cursorRaw) : null;

  // Reuse simplified filtering (subset of index route logic)
  const findKeys = ["invoiceCode", "status", "companyName", "date"]; // companyName derived (NOT implemented here yet)
  let findWhere: any = null;
  const hasFindIndicators =
    findKeys.some((k) => url.searchParams.has(k)) ||
    url.searchParams.has("findReqs");
  if (hasFindIndicators) {
    const values: Record<string, any> = {};
    for (const k of findKeys) {
      const v = url.searchParams.get(k);
      if (v) values[k] = v;
    }
    const simple: any = {};
    if (values.invoiceCode)
      simple.invoiceCode = {
        contains: values.invoiceCode,
        mode: "insensitive",
      };
    if (values.status)
      simple.status = { contains: values.status, mode: "insensitive" };
    if (values.date)
      simple.date = values.date ? new Date(values.date) : undefined;
    const multi = decodeRequests(url.searchParams.get("findReqs"));
    if (multi) {
      const interpreters: Record<string, (val: any) => any> = {
        invoiceCode: (v) => ({
          invoiceCode: { contains: v, mode: "insensitive" },
        }),
        status: (v) => ({ status: { contains: v, mode: "insensitive" } }),
      };
      const multiWhere = buildWhereFromRequests(multi, interpreters);
      findWhere = mergeSimpleAndMulti(simple, multiWhere);
    } else findWhere = simple;
  }

  const where: any = {};
  if (findWhere) where.AND = [findWhere];
  if (cursor != null) {
    // Only fetch with id greater than cursor (ascending infinite scroll)
    where.id = { gt: cursor };
  }

  const rows = await prisma.invoice.findMany({
    where,
    orderBy: { id: "asc" },
    take: limit + 1,
    select: {
      id: true,
      invoiceCode: true,
      date: true,
      status: true,
      company: { select: { name: true } },
    },
  });
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  // Compute amount totals (sum lines) in batch
  const ids = slice.map((r) => r.id);
  const lines = ids.length
    ? await prisma.invoiceLine.findMany({
        where: { invoiceId: { in: ids } },
        select: { invoiceId: true, priceSell: true, quantity: true },
      })
    : [];
  const totals = new Map<number, number>();
  for (const l of lines) {
    const amt = Number(l.priceSell ?? 0) * Number(l.quantity ?? 0);
    totals.set(l.invoiceId!, (totals.get(l.invoiceId!) ?? 0) + amt);
  }
  const withTotals = slice.map((r) => ({
    ...r,
    amount: totals.get(r.id) ?? 0,
  }));
  const nextCursor = hasMore ? slice[slice.length - 1].id : null;
  return json({ rows: withTotals, nextCursor, hasMore });
}

export const meta = () => [];
