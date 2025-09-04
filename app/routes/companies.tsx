import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { RecordBrowserProvider } from "packages/timber";
import { prisma } from "../utils/prisma.server";

export async function loader(_args: LoaderFunctionArgs) {
  const companies = await prisma.company.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, notes: true, isCarrier: true, isCustomer: true, isSupplier: true, isInactive: true, isActive: true },
  });
  return json({ companies });
}

export default function CompaniesLayout() {
  // Loader data should provide the companies list for navigation
  const data = useLoaderData() as { companies?: any[] };
  return (
    <RecordBrowserProvider initialRecords={data?.companies ?? []}>
      <Outlet />
    </RecordBrowserProvider>
  );
}
