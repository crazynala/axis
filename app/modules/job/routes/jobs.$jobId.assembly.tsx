import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Outlet } from "@remix-run/react";
import { prisma } from "../../../utils/prisma.server";
import { useEffect, useMemo } from "react";
import { useRecords } from "~/base/record/RecordContext";

export const meta: MetaFunction = () => [{ title: "Job Assembly" }];

export async function loader({ params }: LoaderFunctionArgs) {
  const jobId = Number(params.jobId);
  if (!jobId) throw new Response("Not Found", { status: 404 });
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      assemblies: {
        select: { id: true, name: true, status: true },
        orderBy: { id: "asc" },
      },
      assemblyGroups: {
        select: {
          id: true,
          assemblies: { select: { id: true }, orderBy: { id: "asc" } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!job) throw new Response("Not Found", { status: 404 });
  return json({
    job: { id: job.id, name: job.name },
    assemblies: job.assemblies,
    groups: job.assemblyGroups,
  });
}

export default function JobAssemblyMasterRecordRoute() {
  const { job, assemblies, groups } = useLoaderData<typeof loader>();
  const { setRecordSet, setIdList, addRows } = useRecords();
  const rows = useMemo(() => {
    const singleRows = (assemblies || []).map((a: any) => ({
      idKey: String(a.id),
      ids: [a.id],
      name: a.name,
      status: a.status,
      label: `A${a.id}`,
    }));
    const groupRows = (groups || [])
      .map((g: any) => {
        const ids = (g.assemblies || []).map((x: any) => x.id);
        if (!ids.length) return null;
        return {
          idKey: ids.join(","),
          ids,
          name: `Group ${g.id}`,
          status: null,
          label: `G${g.id}`,
        } as any;
      })
      .filter(Boolean) as any[];
    return [...groupRows, ...singleRows];
  }, [assemblies, groups]);
  const ids = useMemo(() => rows.map((r: any) => r.idKey), [rows]);
  useEffect(() => {
    // Use module 'jobs' so hotkeys and path checks align with first path segment.
    setRecordSet("jobs", rows as any[], {
      getId: (r: any) => r.idKey,
      getPath: (r: any) => `/jobs/${job.id}/assembly/${r.idKey}`,
    });
    setIdList("jobs", ids, true);
    if (rows?.length) {
      addRows("jobs", rows as any[], { updateRecordsArray: true });
    }
  }, [rows, ids, job.id, setRecordSet, setIdList, addRows]);
  return <Outlet />;
}
