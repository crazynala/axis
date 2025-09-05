import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useNavigation, useSearchParams, useNavigate, useLoaderData } from "@remix-run/react";
import { Button, Group, Stack, Title } from "@mantine/core";
import { BreadcrumbSet } from "../../packages/timber";
import { prisma } from "../utils/prisma.server";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { DataTable } from "mantine-datatable";

export const meta: MetaFunction = () => [{ title: "Companies" }];

export async function loader(args: LoaderFunctionArgs) {
  const params = parseTableParams(args.request.url);
  const prismaArgs = buildPrismaArgs<any>(params, {
    defaultSort: { field: "id", dir: "asc" },
    searchableFields: ["name", "notes"],
  });
  const [rows, total] = await Promise.all([
    prisma.company.findMany({
      ...prismaArgs,
      select: {
        id: true,
        name: true,
        notes: true,
        isCarrier: true,
        isCustomer: true,
        isSupplier: true,
        isInactive: true,
        isActive: true,
      },
    }),
    prisma.company.count({ where: prismaArgs.where }),
  ]);
  return json({
    rows,
    total,
    page: params.page,
    perPage: params.perPage,
    sort: params.sort,
    dir: params.dir,
  });
}

export default function CompaniesIndexRoute() {
  const { rows, total, page, perPage, sort, dir } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const sortAccessor = (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("sort") : null) || sort || "id";
  const sortDirection = ((typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("dir") : null) as any) || dir || "asc";

  // New is handled in /companies/new; delete handled via this route's action

  return (
    <Stack gap="lg">
      <BreadcrumbSet breadcrumbs={[{ label: "Companies", href: "/companies" }]} />
      <Title order={2}>Companies</Title>

      <section>
        <Button component="a" href="/companies/new" variant="filled" color="blue">
          New Company
        </Button>
      </section>

      <section>
        <Title order={4} mb="sm">
          All Companies
        </Title>
        <DataTable
          withTableBorder
          withColumnBorders
          highlightOnHover
          idAccessor="id"
          records={rows as any}
          totalRecords={total}
          page={page}
          recordsPerPage={perPage}
          recordsPerPageOptions={[10, 20, 50, 100]}
          fetching={busy}
          onRowClick={(_record: any, rowIndex?: number) => {
            const rec = typeof rowIndex === "number" ? (rows as any[])[rowIndex] : _record;
            const id = rec?.id;
            if (id != null) navigate(`/companies/${id}`);
          }}
          onPageChange={(p) => {
            const next = new URLSearchParams(sp);
            next.set("page", String(p));
            navigate(`?${next.toString()}`);
          }}
          onRecordsPerPageChange={(n: number) => {
            const next = new URLSearchParams(sp);
            next.set("perPage", String(n));
            next.set("page", "1");
            navigate(`?${next.toString()}`);
          }}
          sortStatus={{
            columnAccessor: sortAccessor,
            direction: sortDirection as any,
          }}
          onSortStatusChange={({ columnAccessor, direction }) => {
            const next = new URLSearchParams(sp);
            next.set("sort", String(columnAccessor));
            next.set("dir", direction);
            navigate(`?${next.toString()}`);
          }}
          columns={[
            {
              accessor: "id",
              title: "ID",
              width: 70,
              sortable: true,
              render: (r: any) => <Link to={`/companies/${r.id}`}>{r.id}</Link>,
            },
            {
              accessor: "name",
              title: "Name",
              sortable: true,
              render: (r: any) => <Link to={`/companies/${r.id}`}>{r.name || `Company #${r.id}`}</Link>,
            },
            {
              accessor: "isCarrier",
              title: "Carrier",
              render: (r: any) => (r.isCarrier ? "Yes" : ""),
            },
            {
              accessor: "isCustomer",
              title: "Customer",
              render: (r: any) => (r.isCustomer ? "Yes" : ""),
            },
            {
              accessor: "isSupplier",
              title: "Supplier",
              render: (r: any) => (r.isSupplier ? "Yes" : ""),
            },
            {
              accessor: "isInactive",
              title: "Inactive",
              render: (r: any) => (r.isInactive ? "Yes" : ""),
            },
            {
              accessor: "isActive",
              title: "Active",
              render: (r: any) => (r.isActive ? "Yes" : "No"),
            },
            { accessor: "notes", title: "Notes" },
          ]}
        />
      </section>
    </Stack>
  );
}
