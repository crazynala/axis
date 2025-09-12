import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { prismaBase } from "../utils/prisma.server";
import { InvoiceFindManager } from "../components/InvoiceFindManager";
import { useEffect } from "react";
import { useRecords } from "../record/RecordContext";

// Hybrid A' Light loader: returns full ordered id list (capped at 50k) and initial rows (first batch) with amount aggregates.
export async function loader(_args: LoaderFunctionArgs) {
  // Cap of 50k
  const ID_CAP = 50000;
  // Fetch all ids up to cap
  const ids = await prismaBase.invoice.findMany({
    orderBy: { id: "asc" },
    select: { id: true },
    take: ID_CAP,
  });
  const idList = ids.map((r) => r.id);
  const idListComplete = ids.length < ID_CAP; // if we hit cap, not complete
  // Load initial row slice (first 100 or fewer)
  const INITIAL_COUNT = 100;
  const initialIds = idList.slice(0, INITIAL_COUNT);
  let initialRows: any[] = [];
  if (initialIds.length) {
    const rows = await prismaBase.invoice.findMany({
      where: { id: { in: initialIds } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        invoiceCode: true,
        date: true,
        status: true,
        company: { select: { name: true } },
      },
    });
    // Compute amounts for these
    const lines = await prismaBase.invoiceLine.findMany({
      where: { invoiceId: { in: initialIds } },
      select: { invoiceId: true, priceSell: true, quantity: true },
    });
    const totals = new Map<number, number>();
    for (const l of lines) {
      const amt = (l.priceSell ?? 0) * (l.quantity ?? 0);
      totals.set(l.invoiceId!, (totals.get(l.invoiceId!) ?? 0) + amt);
    }
    initialRows = rows.map((r) => ({ ...r, amount: totals.get(r.id) ?? 0 }));
  }
  return json({ idList, idListComplete, initialRows, total: idList.length });
}

export default function InvoicesLayout() {
  const data = useLoaderData<{
    idList: Array<number>;
    idListComplete: boolean;
    initialRows: any[];
    total: number;
  }>();
  const { setIdList, addRows } = useRecords();
  useEffect(() => {
    setIdList("invoices", data.idList, data.idListComplete);
    if (data.initialRows?.length) {
      addRows("invoices", data.initialRows, { updateRecordsArray: true });
    }
  }, [data.idList, data.idListComplete, data.initialRows, setIdList, addRows]);
  return (
    <>
      <InvoiceFindManager />
      <Outlet />
    </>
  );
}
