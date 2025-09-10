import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { MasterTableProvider } from "@aa/timber";
import { InvoiceFindManager } from "../components/InvoiceFindManager";

export async function loader(_args: LoaderFunctionArgs) {
  const invoices = await prisma.invoice.findMany({
    orderBy: { id: "asc" },
    select: { id: true, invoiceCode: true, date: true, status: true },
  });
  return json({ invoices });
}

export default function InvoicesLayout() {
  const data = useLoaderData() as { invoices?: any[] };
  return (
    <MasterTableProvider initialRecords={data.invoices}>
      <InvoiceFindManager />
      <Outlet />
    </MasterTableProvider>
  );
}
