import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { useRecordBrowserContext } from "@aa/timber";
import { prisma } from "../utils/prisma.server";
import { CompanyFindManager } from "../components/CompanyFindManager";

export async function loader(_args: LoaderFunctionArgs) {
  const companies = await prisma.company.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      notes: true,
      isCarrier: true,
      isCustomer: true,
      isSupplier: true,
      isInactive: true,
      isActive: true,
    },
  });
  return json({ companies });
}

export default function CompaniesLayout() {
  const data = useLoaderData() as { companies?: any[] };
  const ctx = useRecordBrowserContext({ optional: true });
  useEffect(() => {
    if (!ctx) return;
    if (data?.companies) ctx.updateRecords(data.companies);
  }, [ctx, data?.companies]);
  return (
    <>
      <CompanyFindManager />
      <Outlet />
    </>
  );
}
