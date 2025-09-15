import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { DataTable } from "mantine-datatable";
import { BreadcrumbSet } from "@aa/timber";

export const meta: MetaFunction = ({ params }) => [
  { title: `Forex ${params.fromCurrency} → ${params.toCurrency}` },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const from = String(params.fromCurrency ?? "").toUpperCase();
  const to = String(params.toCurrency ?? "").toUpperCase();
  const rows = await prisma.forexLine.findMany({
    where: { currencyFrom: from, currencyTo: to },
    orderBy: { date: "desc" },
    select: {
      id: true,
      date: true,
      price: true,
      currencyFrom: true,
      currencyTo: true,
    },
  });
  return json({ rows, from, to });
}

export default function AdminForexPairRoute() {
  const data = useLoaderData<typeof loader>();
  return (
    <div>
      <BreadcrumbSet
        breadcrumbs={[
          { label: "Forex", href: `/admin/forex/${data.from}/${data.to}` },
        ]}
      />
      <DataTable
        withTableBorder
        withRowBorders
        records={data.rows as any}
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
