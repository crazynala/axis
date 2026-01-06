import { Link } from "@remix-run/react";
import type { ColumnDef } from "~/base/index/columns";

export const contactColumns: ColumnDef[] = [
  { key: "id", title: "ID", accessor: "id", hideable: false, layout: { width: 70 } },
  {
    key: "name",
    title: "Name",
    accessor: "name",
    layout: { grow: 1, minWidth: 180 },
    render: (c: any) => {
      const name =
        [c.firstName, c.lastName].filter(Boolean).join(" ") ||
        `Contact #${c.id}`;
      return <Link to={`/contacts/${c.id}`}>{name}</Link>;
    },
  },
  {
    key: "companyName",
    title: "Company",
    accessor: "company.name",
    layout: { grow: 1, minWidth: 160 },
    render: (c: any) => c.company?.name || "",
  },
  { key: "email", title: "Email", accessor: "email", layout: { width: 200 } },
  {
    key: "phone",
    title: "Phone",
    accessor: "phone",
    layout: { width: 140 },
    render: (c: any) => c.phoneDirect || c.phoneMobile || "",
  },
];
