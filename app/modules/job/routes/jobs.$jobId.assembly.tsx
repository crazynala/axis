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
    const asmList = (assemblies || []) as Array<{
      id: number;
      name: string | null;
      status: string | null;
    }>;
    const groupList = (groups || []) as Array<{
      id: number;
      assemblies: Array<{ id: number }>;
    }>;
    // Build group membership maps
    const groupMembers = new Map<number, number[]>(); // groupId -> sorted member ids
    const memberToGroup = new Map<number, number>(); // assemblyId -> groupId
    for (const g of groupList) {
      const ids = (g.assemblies || [])
        .map((x) => Number(x.id))
        .sort((a, b) => a - b);
      if (!ids.length) continue;
      groupMembers.set(g.id, ids);
      for (const id of ids) memberToGroup.set(id, g.id);
    }
    // Map for assembly lookup
    const rowById = new Map<number, { id: number; name: any; status: any }>();
    for (const a of asmList) rowById.set(Number(a.id), a as any);
    // Sorted assembly ids for display order
    const sortedIds = Array.from(rowById.keys()).sort((a, b) => a - b);
    // Walk sorted ids; when encountering a group member, emit one group row once; otherwise emit singleton
    const visited = new Set<number>();
    const out: any[] = [];
    for (const id of sortedIds) {
      if (visited.has(id)) continue;
      const gId = memberToGroup.get(id) ?? null;
      if (gId != null) {
        const members = groupMembers.get(gId) || [id];
        // mark all members visited
        for (const mid of members) visited.add(mid);
        out.push({
          idKey: members.join(","),
          ids: members,
          name: `Group ${gId}`,
          status: null,
          label: `G${gId}`,
        });
      } else {
        const a = rowById.get(id)!;
        out.push({
          idKey: String(a.id),
          ids: [a.id],
          name: a.name,
          status: a.status,
          label: `A${a.id}`,
        });
        visited.add(id);
      }
    }
    return out;
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
