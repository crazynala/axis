import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { MasterTableProvider } from "@aa/timber";
import { prisma } from "../utils/prisma.server";

export async function loader(_args: LoaderFunctionArgs) {
  // Redirect base path to default admin forex pair
  throw redirect("/admin/forex/USD/TRY");
  const rows = await prisma.forexLine.findMany({
    orderBy: { date: "desc" },
    select: {
      id: true,
      date: true,
      price: true,
      currencyFrom: true,
      currencyTo: true,
    },
  });
  return json({ rows });
}

export default function ForexLayout() {
  const data = useLoaderData() as { rows?: any[] };
  return (
    <MasterTableProvider initialRecords={data.rows}>
      <Outlet />
    </MasterTableProvider>
  );
}
