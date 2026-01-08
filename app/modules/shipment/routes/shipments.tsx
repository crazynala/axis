import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet } from "@remix-run/react";
import { prismaBase } from "../../../utils/prisma.server";

export async function loader(_args: LoaderFunctionArgs) {
  const ID_CAP = 50000;
  const idRows = await prismaBase.shipment.findMany({
    orderBy: { id: "asc" },
    select: { id: true },
    take: ID_CAP,
  });
  const idList = idRows.map((r) => r.id);
  const idListComplete = idRows.length < ID_CAP;
  const INITIAL_COUNT = 100;
  const initialIds = idList.slice(0, INITIAL_COUNT);
  let initialRows: any[] = [];
  if (initialIds.length) {
    initialRows = await prismaBase.shipment.findMany({
      where: { id: { in: initialIds } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        date: true,
        status: true,
        type: true,
        shipmentType: true,
        trackingNo: true,
        companySender: { select: { name: true } },
        companyReceiver: { select: { name: true } },
      },
    });
  }
  return json({ idList, idListComplete, initialRows, total: idList.length });
}

export default function ShipmentsLayout() {
  return <Outlet />; // Find manager now lives in index route per updated pattern
}
