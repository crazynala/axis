import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { MasterTableProvider } from "@aa/timber";
import { prisma } from "../utils/prisma.server";
import { ExpenseFindManager } from "../components/ExpenseFindManager";

export async function loader(_args: LoaderFunctionArgs) {
  const rows = await prisma.expense.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      date: true,
      category: true,
      details: true,
      priceCost: true,
      priceSell: true,
    },
  });
  return json({ rows });
}

export default function ExpensesLayout() {
  const data = useLoaderData() as { rows?: any[] };
  return (
    <MasterTableProvider initialRecords={data.rows}>
      <ExpenseFindManager />
      <Outlet />
    </MasterTableProvider>
  );
}
