import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { prisma } from "../utils/prisma.server";
import { CompanyFindManager } from "../components/CompanyFindManager";
import { useRecords } from "../record/RecordContext";

export async function loader(_args: LoaderFunctionArgs) {
  const ID_CAP = 50000;
  const idRows = await prisma.company.findMany({
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
    initialRows = await prisma.company.findMany({
      where: { id: { in: initialIds } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        notes: true,
        isCarrier: true,
        isCustomer: true,
        isSupplier: true,
        isInactive: true,
        isActive: true,
      },
    });
  }
  return json({ idList, idListComplete, initialRows, total: idList.length });
}

export default function CompaniesLayout() {
  const data = useLoaderData<{
    idList: number[];
    idListComplete: boolean;
    initialRows: any[];
    total: number;
  }>();
  const { setIdList, addRows } = useRecords();
  useEffect(() => {
    setIdList("companies", data.idList, data.idListComplete);
    if (data.initialRows?.length) {
      addRows("companies", data.initialRows, { updateRecordsArray: true });
    }
  }, [data.idList, data.idListComplete, data.initialRows, setIdList, addRows]);
  return (
    <>
      <CompanyFindManager />
      <Outlet />
    </>
  );
}
