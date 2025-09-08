import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { useRecordBrowserContext } from "@aa/timber";
import { prisma } from "../utils/prisma.server";

export async function loader(_args: LoaderFunctionArgs) {
  const assemblies = await prisma.assembly.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, status: true },
  });
  return json({ assemblies });
}

export default function AssemblyLayout() {
  const data = useLoaderData() as { assemblies?: any[] };
  const ctx = useRecordBrowserContext({ optional: true });
  useEffect(() => {
    if (!ctx) return;
    if (data?.assemblies) ctx.updateRecords(data.assemblies);
  }, [ctx, data?.assemblies]);
  return <Outlet />;
}
