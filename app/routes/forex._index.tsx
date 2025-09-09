import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { DataTable } from "mantine-datatable";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { BreadcrumbSet } from "@aa/timber";

export const meta: MetaFunction = () => [{ title: "Forex" }];

export async function loader(args: LoaderFunctionArgs) {
  // Redirect top-level to admin pair default
  const url = new URL(args.request.url);
  if (url.pathname === "/forex") {
    throw redirect("/admin/forex/USD/TRY");
  }
  const params = parseTableParams(args.request.url);
  const prismaArgs = buildPrismaArgs<any>(params, {
    defaultSort: { field: "date", dir: "desc" },
    searchableFields: ["currencyFrom", "currencyTo"],
  });
  const [rows, total] = await Promise.all([
    prisma.forexLine.findMany({
      ...prismaArgs,
      select: {
        id: true,
        date: true,
        price: true,
        currencyFrom: true,
        currencyTo: true,
      },
    }),
    prisma.forexLine.count({ where: prismaArgs.where }),
  ]);
  return json({ rows, total, page: params.page, perPage: params.perPage });
}

export default function ForexIndexRoute() {
  const data = useLoaderData<typeof loader>();
  return (
    <div>
      <BreadcrumbSet
        breadcrumbs={[{ label: "Forex", href: "/admin/forex/USD/TRY" }]}
      />
      <DataTable
        withRowBorders
        records={data.rows as any}
        totalRecords={data.total}
        page={data.page}
        recordsPerPage={data.perPage}
        columns={[
          {
            accessor: "date",
            render: (r: any) =>
              r.date ? new Date(r.date).toLocaleDateString() : "",
          },
          { accessor: "currencyFrom", title: "From" },
          { accessor: "currencyTo", title: "To" },
          { accessor: "price", title: "Rate" },
        ]}
      />
    </div>
  );
}
