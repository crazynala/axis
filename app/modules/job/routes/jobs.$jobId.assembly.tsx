import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Outlet } from "@remix-run/react";
import { prisma } from "../../../utils/prisma.server";
import { useEffect, useMemo } from "react";
import { useRecords } from "~/base/record/RecordContext";

export const meta: MetaFunction = () => [{ title: "Job Assembly" }];

export async function loader({ params }: LoaderFunctionArgs) {
  const jobId = Number(params.jobId);
  if (!jobId) return redirect("/jobs");
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      assemblies: {
        select: { id: true, name: true, status: true, assemblyGroupId: true },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!job) return redirect("/jobs");
  return json({
    job: { id: job.id, name: job.name },
    assemblies: job.assemblies,
  });
}

export default function JobAssemblyMasterRecordRoute() {
  const { job, assemblies } = useLoaderData<typeof loader>();
  const { setRecordSet, setIdList, addRows } = useRecords();
  const rows = useMemo(() => {
    const asmList = (assemblies || []) as Array<{
      id: number;
      name: string | null;
      status: string | null;
      assemblyGroupId: number | null;
    }>;
    return asmList.map((a) => ({
      idKey: String(a.id),
      ids: [a.id],
      name: a.name,
      status: a.status,
      label: `A${a.id}`,
      assemblyGroupId: a.assemblyGroupId ?? null,
    }));
  }, [assemblies]);
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
