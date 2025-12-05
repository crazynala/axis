import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { DataTable } from "mantine-datatable";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { BreadcrumbSet } from "@aa/timber";
import { requireAdminUser } from "../utils/auth.server";

export const meta: MetaFunction = () => [{ title: "DHL Records" }];

export async function loader(args: LoaderFunctionArgs) {
  await requireAdminUser(args.request);
  const params = parseTableParams(args.request.url);
  const prismaArgs = buildPrismaArgs<any>(params, {
    defaultSort: { field: "invoiceDate", dir: "desc" },
    searchableFields: ["invoiceNumber", "awbNumber", "destinationCountryCode"],
  });
  const [rows, total] = await Promise.all([
    prisma.dHLReportLine.findMany({
      ...prismaArgs,
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        destinationCountryCode: true,
        awbNumber: true,
        totalRevenueEUR: true,
      },
    }),
    prisma.dHLReportLine.count({ where: prismaArgs.where }),
  ]);
  return json({ rows, total, page: params.page, perPage: params.perPage });
}

export default function AdminDHLRecordsIndexRoute() {
  const data = useLoaderData<typeof loader>();
  return (
    <div>
      <BreadcrumbSet
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "DHL Records", href: "/admin/dhl-records" },
        ]}
      />
      <DataTable
        withTableBorder
        withRowBorders
        records={data.rows as any}
        totalRecords={data.total}
        page={data.page}
        onPageChange={() => {}}
        recordsPerPage={data.perPage}
        columns={[
          {
            accessor: "id",
            render: (r: any) => (
              <Link to={`/admin/dhl-records/${r.id}`}>{r.id}</Link>
            ),
          },
          {
            accessor: "invoiceDate",
            title: "Date",
            render: (r: any) =>
              r.invoiceDate ? new Date(r.invoiceDate).toLocaleDateString() : "",
          },
          { accessor: "invoiceNumber", title: "Invoice" },
          { accessor: "awbNumber", title: "AWB" },
          { accessor: "destinationCountryCode", title: "Dest" },
          { accessor: "totalRevenueEUR", title: "Revenue EUR" },
        ]}
      />
    </div>
  );
}
