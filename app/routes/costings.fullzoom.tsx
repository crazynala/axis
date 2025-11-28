import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { prismaBase } from "../utils/prisma.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids") || "";
  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!ids.length) {
    return redirect("/jobs");
  }

  const assemblies = await prismaBase.assembly.findMany({
    where: { id: { in: ids } },
    select: { id: true, jobId: true },
    orderBy: { id: "asc" },
  });

  if (!assemblies.length) {
    return redirect("/jobs");
  }

  const jobIds = new Set(assemblies.map((a) => a.jobId));
  if (jobIds.size !== 1) {
    return redirect(`/jobs/${assemblies[0].jobId}`);
  }

  const jobId = assemblies[0].jobId;
  const validIds = assemblies.map((a) => a.id);
  const normalized = ids.filter((id) => validIds.includes(id));
  if (!normalized.length) {
    return redirect(`/jobs/${jobId}`);
  }

  return redirect(
    `/jobs/${jobId}/assembly/${normalized.join(",")}/costings-sheet`
  );
}

export async function action() {
  return redirect("/jobs");
}

export default function DeprecatedCostingsFullzoom() {
  return null;
}
