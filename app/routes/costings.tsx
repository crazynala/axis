import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { prismaBase } from "../utils/prisma.server";

export async function loader(_args: LoaderFunctionArgs) {
  const costings = await prismaBase.costing.findMany({
    orderBy: { id: "asc" },
    select: { id: true, notes: true },
  });
  return json({ costings });
}

export default function CostingsLayout() {
  const data = useLoaderData() as { costings?: any[] };
  // Legacy RecordBrowserContext removed; windowed roster handled by RecordContext.
  return <Outlet />;
}
