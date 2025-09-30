import { prisma } from "./prisma.server";
import { buildPrismaArgs, parseTableParams } from "./table.server";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../base/find/multiFind";

/**
 * Rebuilds the same filtered/sorted dataset used by invoices index route, but without pagination when `all=true`.
 * Returns rows plus map of computed amounts (priceSell * quantity aggregated per invoice).
 */
export async function fetchInvoicesFiltered(
  url: URL,
  opts?: { all?: boolean }
) {
  const params = parseTableParams(url.toString());
  const viewName = url.searchParams.get("view");
  // NOTE: Saved view application omitted here intentionally; export should reflect current visible filters.
  // If we later need saved view behavior identical to UI, we can refactor that logic out of the route too.

  const findKeys = ["invoiceCode", "status", "companyName", "date"]; // companyName derived client side
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
  let baseParams: any = params;
  if (findWhere) baseParams = { ...baseParams, page: 1 }; // ignore original page if filter applied
  if (baseParams.filters) {
    const {
      findReqs: _omitFindReqs,
      find: _legacy,
      ...rest
    } = baseParams.filters;
    baseParams = { ...baseParams, filters: rest };
  }
  const prismaArgs = buildPrismaArgs(baseParams, {
    searchableFields: ["invoiceCode"],
    filterMappers: {},
    defaultSort: { field: "id", dir: "asc" },
  });
  if (findWhere)
    (prismaArgs.where as any).AND = [
      ...((prismaArgs.where as any).AND || []),
      findWhere,
    ];

  // If exporting all, drop pagination controls
  const take = opts?.all ? undefined : prismaArgs.take;
  const skip = opts?.all ? undefined : prismaArgs.skip;

  const rows = await prisma.invoice.findMany({
    where: prismaArgs.where,
    orderBy: prismaArgs.orderBy,
    skip,
    take,
    select: {
      id: true,
      invoiceCode: true,
      date: true,
      status: true,
      company: { select: { name: true } },
    },
  });

  const ids = rows.map((r) => r.id);
  const lines = ids.length
    ? await prisma.invoiceLine.findMany({
        where: { invoiceId: { in: ids } },
        select: { invoiceId: true, priceSell: true, quantity: true },
      })
    : [];
  const totals = new Map<number, number>();
  for (const l of lines)
    totals.set(
      l.invoiceId!,
      (totals.get(l.invoiceId!) ?? 0) +
        (Number(l.priceSell) || 0) * (Number(l.quantity) || 0)
    );
  return {
    rows: rows.map((r) => ({ ...r, amount: totals.get(r.id) ?? 0 })),
    prismaArgs,
  };
}

export interface InvoiceExportRow {
  id: number;
  invoiceCode: string | null;
  date: Date | string | null;
  companyName: string | null;
  status: string | null;
  amount: number; // raw numeric (not formatted)
}

export function mapInvoiceExportRows(rows: any[]): InvoiceExportRow[] {
  return rows.map((r) => ({
    id: r.id,
    invoiceCode: r.invoiceCode ?? null,
    date: r.date,
    companyName: r.company?.name ?? null,
    status: r.status ?? null,
    amount: r.amount ?? 0,
  }));
}

export function escapeCsv(val: any): string {
  if (val == null) return "";
  const s = String(val);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
