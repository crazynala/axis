import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { prismaBase } from "../../../utils/prisma.server";
import { getLogger } from "@aa/timber";
import { useEffect } from "react";
import { useRecords } from "../../../base/record/RecordContext";
import { PurchaseOrderFindManager } from "~/modules/purchaseOrder/findify/PurchaseOrderFindManager";
import { makeModuleShouldRevalidate } from "~/base/route/shouldRevalidate";

export async function loader(_args: LoaderFunctionArgs) {
  const log = getLogger("purchase-orders");
  const ID_CAP = 50000;
  const idRows = await prismaBase.purchaseOrder.findMany({
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
    const base = await prismaBase.purchaseOrder.findMany({
      where: { id: { in: initialIds } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        date: true,
        company: { select: { id: true, name: true } },
        consignee: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        lines: { select: { priceCost: true, quantity: true } },
      },
    });
    initialRows = base.map((r: any) => ({
      ...r,
      vendorName: r.company?.name || "",
      consigneeName: r.consignee?.name || "",
      locationName: r.location?.name || "",
      totalCost: (r.lines || []).reduce(
        (sum: number, l: any) => sum + (l.priceCost || 0) * (l.quantity || 0),
        0
      ),
    }));
  }
  log.debug(
    { initialRows: initialRows.length, total: idList.length },
    "purchaseOrders hybrid loader"
  );
  return json({ idList, idListComplete, initialRows, total: idList.length });
}

export default function PurchaseOrdersLayout() {
  const data = useLoaderData<{
    idList: number[];
    idListComplete: boolean;
    initialRows: any[];
    total: number;
  }>();
  const { setIdList, addRows } = useRecords();
  useEffect(() => {
    setIdList("purchase-orders", data.idList, data.idListComplete);
    if (data.initialRows?.length)
      addRows("purchase-orders", data.initialRows, {
        updateRecordsArray: true,
      });
  }, [data.idList, data.idListComplete, data.initialRows, setIdList, addRows]);
  return (
    <>
      <PurchaseOrderFindManager />
      <Outlet />
    </>
  );
}

export const shouldRevalidate = makeModuleShouldRevalidate("/purchase-orders", [
  // add any find/watch keys for PO module when available
  "view",
  "sort",
  "dir",
  "perPage",
  "q",
  "findReqs",
]);
