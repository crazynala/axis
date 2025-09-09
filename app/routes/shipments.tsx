import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { MasterTableProvider } from "@aa/timber";
import { prisma } from "../utils/prisma.server";

export async function loader(_args: LoaderFunctionArgs) {
  const shipments = await prisma.shipment.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      date: true,
      status: true,
      type: true,
      trackingNo: true,
    },
  });
  return json({ shipments });
}

export default function ShipmentsLayout() {
  const data = useLoaderData() as { shipments?: any[] };
  return (
    <MasterTableProvider initialRecords={data.shipments}>
      <Outlet />
    </MasterTableProvider>
  );
}
