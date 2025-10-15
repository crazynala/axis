import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Outlet } from "@remix-run/react";
import { prisma } from "../../../utils/prisma.server";
import { MasterTableProvider, getLogger } from "@aa/timber";

export const meta: MetaFunction = () => [{ title: "Job Assembly" }];

export async function loader({ params }: LoaderFunctionArgs) {
  const jobId = Number(params.jobId);
  const assemblyId = Number(params.assemblyId);
  if (!jobId || !assemblyId) throw new Response("Not Found", { status: 404 });
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      assemblies: {
        select: { id: true, name: true, status: true },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!job) throw new Response("Not Found", { status: 404 });
  return json({
    job: { id: job.id, name: job.name },
    assemblies: job.assemblies,
  });
}

export default function JobAssemblyMasterRecordRoute() {
  const { assemblies } = useLoaderData<typeof loader>();
  return (
    <MasterTableProvider initialRecords={assemblies} recordIdField="id">
      <Outlet />
    </MasterTableProvider>
  );
}
