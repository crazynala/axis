import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { RecordBrowserProvider } from "packages/timber";
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
  return (
    <RecordBrowserProvider initialRecords={data?.assemblies ?? []}>
      <Outlet />
    </RecordBrowserProvider>
  );
}
