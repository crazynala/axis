import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { DataTable } from "mantine-datatable";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { BreadcrumbSet } from "@aa/timber";

export const meta: MetaFunction = () => [{ title: "Invoices" }];

export async function loader(args: LoaderFunctionArgs) {
  const params = parseTableParams(args.request.url);
  const { where, orderBy, skip, take } = buildPrismaArgs(params, {
    searchableFields: ["invoiceCode"],
    filterMappers: {
      invoiceCode: (v: string) => ({
        invoiceCode: { contains: v, mode: "insensitive" },
      }),
      status: (v: string) => ({ status: { contains: v, mode: "insensitive" } }),
    },
    defaultSort: { field: "id", dir: "asc" },
  });
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy,
      skip,
      take,
      select: { id: true, invoiceCode: true, date: true, status: true },
    }),
    prisma.invoice.count({ where }),
  ]);
  return json({ rows, total, page: params.page, perPage: params.perPage });
}

export default function InvoicesIndexRoute() {
  const data = useLoaderData<typeof loader>();
  return (
    <div>
      <BreadcrumbSet breadcrumbs={[{ label: "Invoices", href: "/invoices" }]} />
      <DataTable
        withRowBorders
        records={data.rows as any}
        totalRecords={data.total}
        page={data.page}
        recordsPerPage={data.perPage}
        columns={[
          {
            accessor: "id",
            render: (r: any) => <Link to={`/invoices/${r.id}`}>{r.id}</Link>,
          },
          { accessor: "invoiceCode", title: "Code" },
          {
            accessor: "date",
            render: (r: any) =>
              r.date ? new Date(r.date).toLocaleDateString() : "",
          },
          { accessor: "status" },
        ]}
      />
    </div>
  );
}
