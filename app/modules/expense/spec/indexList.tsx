import { Link } from "@remix-run/react";
import type { ColumnDef } from "~/base/index/columns";
import { formatUSD } from "~/utils/format";

export const expenseColumns: ColumnDef[] = [
  {
    key: "id",
    title: "ID",
    accessor: "id",
    layout: { width: 70 },
    hideable: false,
    render: (r: any) => <Link to={`/expenses/${r.id}`}>{r.id}</Link>,
  },
  {
    key: "date",
    title: "Date",
    accessor: "date",
    sortable: true,
    layout: { width: 110 },
  },
  {
    key: "category",
    title: "Category",
    accessor: "category",
    sortable: true,
    layout: { width: 140 },
  },
  {
    key: "details",
    title: "Details",
    accessor: "details",
    sortable: true,
    layout: { grow: 1, minWidth: 180 },
  },
  {
    key: "priceCost",
    title: "Cost",
    accessor: "priceCost",
    layout: { width: 110 },
    render: (r: any) => formatUSD(r.priceCost || 0),
  },
];
