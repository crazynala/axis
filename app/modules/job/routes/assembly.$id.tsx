// Legacy route kept solely for backwards-compatible bookmarks.
// Redirects to canonical nested route /jobs/:jobId/assembly/:assemblyId
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { prisma } from "../../../utils/prisma.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!id) throw new Response("Not Found", { status: 404 });
  const assembly = await prisma.assembly.findUnique({
    where: { id },
    select: { id: true, jobId: true },
  });
  if (!assembly) throw new Response("Not Found", { status: 404 });
  const jobId = assembly.jobId;
  if (jobId) return redirect(`/jobs/${jobId}/assembly/${assembly.id}`);
  // If assembly has no job (edge case) fall back to assemblies index for now.
  return redirect(`/assembly`);
}

export async function action({ params }: ActionFunctionArgs) {
  const id = Number(params.id);
  if (!id) return redirect(`/assembly`);
  const assembly = await prisma.assembly.findUnique({
    where: { id },
    select: { id: true, jobId: true },
  });
  if (!assembly) return redirect(`/assembly`);
  if (assembly.jobId)
    return redirect(`/jobs/${assembly.jobId}/assembly/${assembly.id}`);
  return redirect(`/assembly`);
}

export default function LegacyAssemblyRedirect() {
  return null; // Unreachable normally because loader redirects.
}
