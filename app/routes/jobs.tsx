import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { RecordBrowserProvider } from "packages/timber";
import { prisma } from "../utils/prisma.server";

export async function loader(_args: LoaderFunctionArgs) {
  const jobs = await prisma.job.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, projectCode: true } });
  return json({ jobs });
}

export default function JobsLayout() {
  const data = useLoaderData() as { jobs?: any[] };
  return (
    <RecordBrowserProvider initialRecords={data?.jobs ?? []}>
      <Outlet />
    </RecordBrowserProvider>
  );
}
