import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { prismaBase } from "../utils/prisma.server";
import { MasterTableProvider, getLogger } from "@aa/timber";

export async function loader(_args: LoaderFunctionArgs) {
  const log = getLogger("purchase-orders");
  const purchaseOrders = await prismaBase.purchaseOrder.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      date: true,
      company: true,
      consignee: true,
      location: true,
    },
  });
  log.debug(purchaseOrders, `Fetched ${purchaseOrders.length} purchase orders`);
  return json({ purchaseOrders });
}

export default function PurchaseOrdersLayout() {
  const data = useLoaderData() as { purchaseOrders?: any[] };
  return (
    <MasterTableProvider initialRecords={data.purchaseOrders}>
      <Outlet />
    </MasterTableProvider>
  );
}
