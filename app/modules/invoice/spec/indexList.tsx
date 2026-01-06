import { Link } from "@remix-run/react";
import type { ColumnDef } from "~/base/index/columns";
import { formatUSD } from "~/utils/format";

export const invoiceColumns: ColumnDef[] = [
  {
    key: "id",
    title: "ID",
    accessor: "id",
    layout: { width: 70 },
    hideable: false,
    render: (r: any) => <Link to={`/invoices/${r.id}`}>{r.id}</Link>,
  },
  {
    key: "invoiceCode",
    title: "Code",
    accessor: "invoiceCode",
    layout: { width: 140 },
  },
  {
    key: "date",
    title: "Date",
    accessor: "date",
    layout: { width: 110 },
    render: (r: any) =>
      r.date ? new Date(r.date).toLocaleDateString() : "",
  },
  {
    key: "companyName",
    title: "Company",
    accessor: "company.name",
    layout: { grow: 1, minWidth: 180 },
    render: (r: any) => r.company?.name ?? "",
  },
  {
    key: "amount",
    title: "Amount",
    accessor: "amount",
    layout: { width: 120 },
    render: (r: any) => formatUSD(r.amount),
  },
  {
    key: "status",
    title: "Status",
    accessor: "status",
    layout: { width: 110 },
  },
];
