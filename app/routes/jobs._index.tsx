import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useNavigation,
  useSearchParams,
  useNavigate,
} from "@remix-run/react";
import { Button, Group, Stack, Title, Tooltip } from "@mantine/core";
import { JobFindModal } from "../components/JobFindModal";
import * as jobDetail from "../formConfigs/jobDetail";
import { BreadcrumbSet } from "@aa/timber";
import { prisma } from "../utils/prisma.server";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { buildWhereFromConfig } from "../utils/buildWhereFromConfig.server";
import { DataTable } from "mantine-datatable";

export const meta: MetaFunction = () => [{ title: "Jobs" }];

export async function loader(args: LoaderFunctionArgs) {
  const params = parseTableParams(args.request.url);
  // Remove control param 'find' from generic filters so it is not treated as a field
  if ((params as any).filters && "find" in (params as any).filters) {
    delete (params as any).filters.find;
  }
  const prismaArgs = buildPrismaArgs<any>(params, {
    defaultSort: { field: "id", dir: "asc" },
    searchableFields: ["name", "projectCode", "status", "jobType"],
  });
  // Apply find filters if ?find=1 present
  const url = new URL(args.request.url);
  const isFind = url.searchParams.get("find") === "1";
  if (isFind) {
    const fields: any[] = [
      ...((jobDetail as any).jobOverviewFields || []),
      ...((jobDetail as any).jobDateStatusLeft || []),
      ...((jobDetail as any).jobDateStatusRight || []),
    ];
    const raw: Record<string, any> = {};
    for (const [k, v] of url.searchParams.entries()) {
      if (
        k === "find" ||
        k === "page" ||
        k === "perPage" ||
        k === "sort" ||
        k === "dir"
      )
        continue;
      const fieldCfg = fields.find((f) => f.name === k);
      if (!fieldCfg) continue;
      if (v !== null && v !== "") raw[k] = v;
    }
    // buildWhereFromConfig(values, configs)
    const where = buildWhereFromConfig(raw as any, fields as any);
    prismaArgs.where = { ...(prismaArgs.where || {}), ...(where || {}) };
  }
  const [rows, total] = await Promise.all([
    prisma.job.findMany({
      ...prismaArgs,
      select: {
        id: true,
        name: true,
        projectCode: true,
        status: true,
        jobType: true,
        startDate: true,
        endDate: true,
        company: { select: { name: true } },
      },
    }),
    prisma.job.count({ where: prismaArgs.where }),
  ]);

  // Compute ordered/cut/make/pack per job from assemblies and activities
  const jobIds = rows.map((r: any) => r.id);
  const assemblies = jobIds.length
    ? await prisma.assembly.findMany({
        where: { jobId: { in: jobIds } },
        select: {
          id: true,
          jobId: true,
          variantSetId: true,
          qtyOrderedBreakdown: true,
          variantSet: { select: { variants: true } },
          productId: true,
          // c_* computed fields come from query extension
          // Types cast as any to access extension-calculated fields
        },
      })
    : [];

  // Preload extension-computed fields by refetching with findMany already handled by extension
  // The extension augments each assembly with c_qty* and *_Breakdown fields
  const assembliesWithComputed = (await prisma.assembly.findMany({
    where: { id: { in: assemblies.map((a: any) => a.id) } },
    select: { id: true, jobId: true },
  })) as Array<any>;
  const asmMap = new Map<number, any>();
  for (const a of assembliesWithComputed) asmMap.set(a.id, a);

  const aggByJob: Record<number, any> = {};
  function ensureJob(jid: number) {
    if (!aggByJob[jid])
      aggByJob[jid] = {
        qtyOrdered: 0,
        breakdownOrdered: [] as number[],
        c_qtyCut: 0,
        c_qtyMake: 0,
        c_qtyPack: 0,
        c_qtyCut_Breakdown: [] as number[],
        c_qtyMake_Breakdown: [] as number[],
        c_qtyPack_Breakdown: [] as number[],
        variantLabels: [] as string[],
      };
    return aggByJob[jid];
  }

  function addArrays(dst: number[], src: number[]) {
    const len = Math.max(dst.length, src.length);
    if (dst.length < len) (dst.length = len), dst.fill(0, dst.length, len);
    for (let i = 0; i < len; i++) dst[i] = (dst[i] || 0) + (src[i] || 0);
  }

  // Preload product variant sets for assemblies missing one
  const productIds = Array.from(
    new Set((assemblies as any[]).map((a) => a.productId).filter(Boolean))
  );
  const productsById: Record<number, any> = {};
  if (productIds.length) {
    const prods = await prisma.product.findMany({
      where: { id: { in: productIds as number[] } },
      select: { id: true, variantSet: { select: { variants: true } } },
    });
    for (const p of prods) productsById[p.id] = p;
  }

  for (const a of assemblies as Array<any>) {
    if (!a.jobId) continue;
    const agg = ensureJob(a.jobId);
    const aExt = asmMap.get(a.id) || {};
    const orderedArr = (a.qtyOrderedBreakdown || []) as number[];
    const orderedSum = orderedArr.reduce(
      (t: number, n: number) => (Number.isFinite(n) ? t + (n | 0) : t),
      0
    );
    agg.qtyOrdered += orderedSum;
    addArrays(agg.breakdownOrdered, orderedArr);
    agg.c_qtyCut += aExt.c_qtyCut || 0;
    agg.c_qtyMake += aExt.c_qtyMake || 0;
    agg.c_qtyPack += aExt.c_qtyPack || 0;
    addArrays(
      agg.c_qtyCut_Breakdown,
      (aExt.c_qtyCut_Breakdown || []) as number[]
    );
    addArrays(
      agg.c_qtyMake_Breakdown,
      (aExt.c_qtyMake_Breakdown || []) as number[]
    );
    addArrays(
      agg.c_qtyPack_Breakdown,
      (aExt.c_qtyPack_Breakdown || []) as number[]
    );

    // Set variant labels once per job: trim to last non-empty; prefer assembly's variantSet; fall back to product variantSet
    if (agg.variantLabels.length === 0) {
      const labelsSrc =
        a.variantSet?.variants ||
        productsById[a.productId || -1]?.variantSet?.variants ||
        [];
      const arr = (labelsSrc || []).map((s: any) => (s ?? "").toString());
      let last = -1;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].trim()) {
          last = i;
          break;
        }
      }
      agg.variantLabels = last >= 0 ? arr.slice(0, last + 1) : [];
    }
  }

  const rowsWithQty = rows.map((r: any) => ({
    ...r,
    qtyOrdered: aggByJob[r.id]?.qtyOrdered || 0,
    breakdownOrdered: aggByJob[r.id]?.breakdownOrdered || [],
    c_qtyCut: aggByJob[r.id]?.c_qtyCut || 0,
    c_qtyMake: aggByJob[r.id]?.c_qtyMake || 0,
    c_qtyPack: aggByJob[r.id]?.c_qtyPack || 0,
    c_qtyCut_Breakdown: aggByJob[r.id]?.c_qtyCut_Breakdown || [],
    c_qtyMake_Breakdown: aggByJob[r.id]?.c_qtyMake_Breakdown || [],
    c_qtyPack_Breakdown: aggByJob[r.id]?.c_qtyPack_Breakdown || [],
    variantLabels: aggByJob[r.id]?.variantLabels || [],
  }));

  return json({
    rows: rowsWithQty,
    total,
    page: params.page,
    perPage: params.perPage,
    sort: params.sort,
    dir: params.dir,
  });
}

// No mutations on index: creation handled via /jobs/new

export default function JobsIndexRoute() {
  const { rows, total, page, perPage, sort, dir } =
    useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const sortAccessor =
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("sort")
      : null) ||
    sort ||
    "id";
  const sortDirection =
    ((typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("dir")
      : null) as any) ||
    dir ||
    "asc";

  const findOpen = sp.get("find") === "1";
  // Extract initial find values from URL params
  const initialFind: Record<string, any> = {};
  const fields: any[] = [
    ...((jobDetail as any).jobOverviewFields || []),
    ...((jobDetail as any).jobDateStatusLeft || []),
    ...((jobDetail as any).jobDateStatusRight || []),
  ];
  for (const f of fields) {
    const v = sp.get(f.name);
    if (v !== null) initialFind[f.name] = v;
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>Jobs</Title>
        <BreadcrumbSet breadcrumbs={[{ label: "Jobs", href: "/jobs" }]} />
      </Group>

      <Group>
        <Button component="a" href="/jobs/new" variant="filled" color="blue">
          New Job
        </Button>
        <Button
          variant="light"
          onClick={() => {
            const next = new URLSearchParams(sp);
            if (next.get("find") === "1") {
              next.delete("find");
              // also remove field params
              for (const f of fields) next.delete(f.name);
            } else {
              next.set("find", "1");
            }
            navigate(`?${next.toString()}`);
          }}
        >
          {findOpen ? "Close Find" : "Find"}
        </Button>
      </Group>

      <section>
        <Title order={4} mb="sm">
          All Jobs
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
            const rec =
              typeof rowIndex === "number"
                ? (rows as any[])[rowIndex]
                : _record;
            const id = rec?.id;
            if (id != null) {
              const hasFind = sp.get("find") === "1";
              const ret = sp.get("return");
              if (hasFind) {
                const sp2 = new URLSearchParams();
                sp2.set("find", "1");
                if (ret) sp2.set("return", ret);
                navigate(`/jobs/${id}?${sp2.toString()}`);
              } else {
                navigate(`/jobs/${id}`);
              }
            }
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
              render: (r: any) => <Link to={`/jobs/${r.id}`}>{r.id}</Link>,
            },
            {
              accessor: "company.name",
              title: "Customer",
              render: (r: any) => r.company?.name || "",
            },
            { accessor: "projectCode", title: "Project Code", sortable: true },
            { accessor: "name", title: "Name", sortable: true },
            { accessor: "jobType", title: "Type", sortable: true },
            {
              accessor: "qtyOrdered",
              title: "Qty Ordered",
              render: (r: any) => {
                const labels: string[] = (r.variantLabels || []) as string[];
                const arr: number[] = (r.breakdownOrdered || []) as number[];
                const len = Math.max(labels.length, arr.length);
                const cols = labels.length
                  ? labels
                  : Array.from(
                      { length: len },
                      (_: any, i: number) => `${i + 1}`
                    );
                const content = (
                  <div style={{ padding: 4 }}>
                    <table>
                      <thead>
                        <tr>
                          {cols.map((c: string, i: number) => (
                            <th
                              key={`ord-h-${i}`}
                              style={{ padding: "0 6px", fontWeight: 600 }}
                            >
                              {c || `${i + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {cols.map((_c: string, i: number) => (
                            <td
                              key={`ord-${i}`}
                              style={{ textAlign: "right", padding: "0 6px" }}
                            >
                              {arr[i] || ""}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
                return (
                  <Tooltip label={content} openDelay={300}>
                    <span>{r.qtyOrdered}</span>
                  </Tooltip>
                );
              },
            },
            {
              accessor: "c_qtyCut",
              title: "Cut",
              render: (r: any) => {
                const labels: string[] = (r.variantLabels || []) as string[];
                const arr: number[] = (r.c_qtyCut_Breakdown || []) as number[];
                const len = Math.max(labels.length, arr.length);
                const cols = labels.length
                  ? labels
                  : Array.from(
                      { length: len },
                      (_: any, i: number) => `${i + 1}`
                    );
                const content = (
                  <div style={{ padding: 4 }}>
                    <table>
                      <thead>
                        <tr>
                          {cols.map((c: string, i: number) => (
                            <th
                              key={`cut-h-${i}`}
                              style={{ padding: "0 6px", fontWeight: 600 }}
                            >
                              {c || `${i + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {cols.map((_c: string, i: number) => (
                            <td
                              key={`cut-${i}`}
                              style={{ textAlign: "right", padding: "0 6px" }}
                            >
                              {arr[i] || ""}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
                return (
                  <Tooltip label={content} openDelay={300}>
                    <span>{r.c_qtyCut}</span>
                  </Tooltip>
                );
              },
            },
            {
              accessor: "c_qtyMake",
              title: "Make",
              render: (r: any) => {
                const labels: string[] = (r.variantLabels || []) as string[];
                const arr: number[] = (r.c_qtyMake_Breakdown || []) as number[];
                const len = Math.max(labels.length, arr.length);
                const cols = labels.length
                  ? labels
                  : Array.from(
                      { length: len },
                      (_: any, i: number) => `${i + 1}`
                    );
                const content = (
                  <div style={{ padding: 4 }}>
                    <table>
                      <thead>
                        <tr>
                          {cols.map((c: string, i: number) => (
                            <th
                              key={`make-h-${i}`}
                              style={{ padding: "0 6px", fontWeight: 600 }}
                            >
                              {c || `${i + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {cols.map((_c: string, i: number) => (
                            <td
                              key={`make-${i}`}
                              style={{ textAlign: "right", padding: "0 6px" }}
                            >
                              {arr[i] || ""}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
                return (
                  <Tooltip label={content} openDelay={300}>
                    <span>{r.c_qtyMake}</span>
                  </Tooltip>
                );
              },
            },
            {
              accessor: "c_qtyPack",
              title: "Pack",
              render: (r: any) => {
                const labels: string[] = (r.variantLabels || []) as string[];
                const arr: number[] = (r.c_qtyPack_Breakdown || []) as number[];
                const len = Math.max(labels.length, arr.length);
                const cols = labels.length
                  ? labels
                  : Array.from(
                      { length: len },
                      (_: any, i: number) => `${i + 1}`
                    );
                const content = (
                  <div style={{ padding: 4 }}>
                    <table>
                      <thead>
                        <tr>
                          {cols.map((c: string, i: number) => (
                            <th
                              key={`pack-h-${i}`}
                              style={{ padding: "0 6px", fontWeight: 600 }}
                            >
                              {c || `${i + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {cols.map((_c: string, i: number) => (
                            <td
                              key={`pack-${i}`}
                              style={{ textAlign: "right", padding: "0 6px" }}
                            >
                              {arr[i] || ""}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
                return (
                  <Tooltip label={content} openDelay={300}>
                    <span>{r.c_qtyPack}</span>
                  </Tooltip>
                );
              },
            },
            {
              accessor: "startDate",
              title: "Start",
              sortable: true,
              render: (r: any) =>
                r.startDate ? new Date(r.startDate).toLocaleDateString() : "",
            },
            {
              accessor: "endDate",
              title: "End",
              sortable: true,
              render: (r: any) =>
                r.endDate ? new Date(r.endDate).toLocaleDateString() : "",
            },
            { accessor: "status", title: "Status", sortable: true },
          ]}
        />
      </section>
      <JobFindModal
        opened={findOpen}
        onClose={() => {
          const next = new URLSearchParams(sp);
          next.delete("find");
          for (const f of fields) next.delete(f.name);
          navigate(`?${next.toString()}`);
        }}
        initialValues={initialFind}
        onSearch={(qs) => {
          // Replace current query but keep pagination reset
          navigate(`?${qs}`);
        }}
        jobSample={{}}
      />
    </Stack>
  );
}
