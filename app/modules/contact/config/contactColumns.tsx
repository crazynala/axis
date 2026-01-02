import { Link } from "@remix-run/react";
import type { ColumnDef } from "~/base/index/columns";

export const contactColumns: ColumnDef[] = [
  { key: "id", title: "ID", accessor: "id", hideable: false },
  {
    key: "name",
    title: "Name",
    accessor: "name",
    render: (c: any) => {
      const name =
        [c.firstName, c.lastName].filter(Boolean).join(" ") ||
        `Contact #${c.id}`;
      return <Link to={`/contacts/${c.id}`}>{name}</Link>;
    },
  },
  {
    key: "company.name",
    title: "Company",
    accessor: "company.name",
    render: (c: any) => c.company?.name || "",
  },
  { key: "email", title: "Email", accessor: "email" },
  {
    key: "phone",
    title: "Phone",
    accessor: "phone",
    render: (c: any) => c.phoneDirect || c.phoneMobile || "",
  },
];
