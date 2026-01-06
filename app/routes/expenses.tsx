import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useMatches } from "@remix-run/react";
import { useEffect } from "react";
import { prismaBase } from "../utils/prisma.server";
import { ExpenseFindManager } from "~/modules/expense/findify/ExpenseFindManager";
import { useRecords } from "../base/record/RecordContext";

export async function loader(_args: LoaderFunctionArgs) {
  const ID_CAP = 50000;
  const idRows = await prismaBase.expense.findMany({
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
    initialRows = await prismaBase.expense.findMany({
      where: { id: { in: initialIds } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        date: true,
        category: true,
        details: true,
        priceCost: true,
        priceSell: true,
      },
    });
  }
  return json({ idList, idListComplete, initialRows, total: idList.length });
}

export default function ExpensesLayout() {
  const data = useLoaderData<{
    idList: number[];
    idListComplete: boolean;
    initialRows: any[];
    total: number;
  }>();
  const matches = useMatches();
  const indexData = matches.find((m) =>
    String(m.id).endsWith("routes/expenses._index")
  )?.data as { activeViewParams?: any | null } | undefined;
  const { setIdList, addRows } = useRecords();
  useEffect(() => {
    setIdList("expenses", data.idList, data.idListComplete);
    if (data.initialRows?.length)
      addRows("expenses", data.initialRows, { updateRecordsArray: true });
  }, [data.idList, data.idListComplete, data.initialRows, setIdList, addRows]);
  return (
    <>
      <ExpenseFindManager
        activeViewParams={indexData?.activeViewParams || null}
      />
      <Outlet />
    </>
  );
}
