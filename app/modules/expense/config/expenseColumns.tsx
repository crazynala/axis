import { Link } from "@remix-run/react";
import type { ColumnDef } from "~/base/index/columns";
import { formatUSD } from "~/utils/format";

export const expenseColumns: ColumnDef[] = [
  {
    key: "id",
    title: "ID",
    accessor: "id",
    width: 70,
    hideable: false,
    render: (r: any) => <Link to={`/expenses/${r.id}`}>{r.id}</Link>,
  },
  { key: "date", title: "Date", accessor: "date", sortable: true },
  {
    key: "category",
    title: "Category",
    accessor: "category",
    sortable: true,
  },
  { key: "details", title: "Details", accessor: "details", sortable: true },
  {
    key: "priceCost",
    title: "Cost",
    accessor: "priceCost",
    render: (r: any) => formatUSD(r.priceCost || 0),
  },
];
