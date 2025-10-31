import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { prisma } from "../../../utils/prisma.server";

export async function loader(_args: LoaderFunctionArgs) {
  const activities = await prisma.assemblyActivity.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });
  return json({ activities });
}

export default function AssemblyActivitiesLayout() {
  const data = useLoaderData() as { activities?: any[] };
  // Legacy RecordBrowserContext removed.
  return <Outlet />;
}
