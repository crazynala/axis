import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { prisma } from "~/utils/prisma.server";
import { loadAssemblyDetailVM } from "~/modules/job/services/assemblyDetailVM.server";
import { handleAssemblyDetailAction } from "~/modules/job/services/assemblyDetailActions.server";
import { AssemblyDetailView } from "~/modules/job/routes/jobs.$jobId.assembly.$assemblyId._index";

export const meta: MetaFunction = () => [{ title: "Production Ledger Assembly" }];

async function resolveJobId(assemblyId: number): Promise<number | null> {
  if (!Number.isFinite(assemblyId)) return null;
  const row = await prisma.assembly.findUnique({
    where: { id: assemblyId },
    select: { id: true, jobId: true },
  });
  return row?.jobId ?? null;
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const assemblyId = Number(params.assemblyId);
  const jobId = await resolveJobId(assemblyId);
  if (!jobId) return redirect("/production-ledger");
  const nextParams = { ...params, jobId: String(jobId) } as any;
  return loadAssemblyDetailVM({ request, params: nextParams });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const assemblyId = Number(params.assemblyId);
  const jobId = await resolveJobId(assemblyId);
  if (!jobId) return redirect("/production-ledger");
  const nextParams = { ...params, jobId: String(jobId) } as any;
  return handleAssemblyDetailAction({ request, params: nextParams } as any);
}

export default function ProductionLedgerAssemblyRoute() {
  const data = useLoaderData<typeof loader>() as any;
  const assemblies = (data?.assemblies || []) as any[];
  const primaryAssembly = assemblies?.[0] ?? null;
  const assemblyId = primaryAssembly?.id ?? null;
  return (
    <AssemblyDetailView
      moduleKey="production-ledger"
      buildBreadcrumbs={() => [
        { label: "Production Ledger", href: "/production-ledger" },
        {
          label: `Assembly A${assemblyId ?? ""}`,
          href: `/production-ledger/assembly/${assemblyId ?? ""}`,
        },
      ]}
    />
  );
}
