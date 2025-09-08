import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { useRecordBrowserContext } from "@aa/timber";
import { prisma } from "../utils/prisma.server";

export async function loader(_args: LoaderFunctionArgs) {
  const costings = await prisma.costing.findMany({
    orderBy: { id: "asc" },
    select: { id: true, usageType: true, notes: true },
  });
  return json({ costings });
}

export default function CostingsLayout() {
  const data = useLoaderData() as { costings?: any[] };
  const ctx = useRecordBrowserContext({ optional: true });
  useEffect(() => {
    if (!ctx) return;
    if (data?.costings) ctx.updateRecords(data.costings);
  }, [ctx, data?.costings]);
  return <Outlet />;
}
