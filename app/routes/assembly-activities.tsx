import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { useRecordBrowserContext } from "@aa/timber";
import { prisma } from "../utils/prisma.server";

export async function loader(_args: LoaderFunctionArgs) {
  const activities = await prisma.assemblyActivity.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, status: true } });
  return json({ activities });
}

export default function AssemblyActivitiesLayout() {
  const data = useLoaderData() as { activities?: any[] };
  const ctx = useRecordBrowserContext({ optional: true });
  useEffect(() => {
    if (!ctx) return;
    if (data?.activities) ctx.updateRecords(data.activities);
  }, [ctx, data?.activities]);
  return <Outlet />;
}
