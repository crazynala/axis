import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { RecordBrowserProvider } from "packages/timber";
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
  return (
    <RecordBrowserProvider initialRecords={data?.costings ?? []}>
      <Outlet />
    </RecordBrowserProvider>
  );
}
