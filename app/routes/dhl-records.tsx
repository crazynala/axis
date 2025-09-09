import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { MasterTableProvider } from "@aa/timber";
import { prisma } from "../utils/prisma.server";

export async function loader(_args: LoaderFunctionArgs) {
  // Redirect base path to admin route
  throw redirect("/admin/dhl-records");
  const rows = await prisma.dHLReportLine.findMany({
    orderBy: { invoiceDate: "desc" },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      destinationCountryCode: true,
      awbNumber: true,
      totalRevenueEUR: true,
    },
  });
  return json({ rows });
}

export default function DHLRecordsLayout() {
  const data = useLoaderData() as { rows?: any[] };
  return (
    <MasterTableProvider initialRecords={data.rows}>
      <Outlet />
    </MasterTableProvider>
  );
}
