import { Link } from "@remix-run/react";
import type { ColumnDef } from "~/base/index/columns";
import { formatUSD } from "~/utils/format";

export const invoiceColumns: ColumnDef[] = [
  {
    key: "id",
    title: "ID",
    accessor: "id",
    width: 70,
    hideable: false,
    render: (r: any) => <Link to={`/invoices/${r.id}`}>{r.id}</Link>,
  },
  { key: "invoiceCode", title: "Code", accessor: "invoiceCode" },
  {
    key: "date",
    title: "Date",
    accessor: "date",
    render: (r: any) =>
      r.date ? new Date(r.date).toLocaleDateString() : "",
  },
  {
    key: "company.name",
    title: "Company",
    accessor: "company.name",
    render: (r: any) => r.company?.name ?? "",
  },
  {
    key: "amount",
    title: "Amount",
    accessor: "amount",
    render: (r: any) => formatUSD(r.amount),
  },
  { key: "status", title: "Status", accessor: "status" },
];
