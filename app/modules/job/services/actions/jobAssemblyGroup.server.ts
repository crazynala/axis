import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";

export async function handleJobAssemblyGroup(opts: { id: number; form: FormData }) {
  const idsStr = String(opts.form.get("assemblyIds") || "");
  const name = (opts.form.get("groupName") as string) || null;
  const ids = idsStr
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  if (ids.length >= 2) {
    const assemblies = await prisma.assembly.findMany({
      where: { id: { in: ids }, jobId: opts.id },
      select: { id: true },
    });
    const issueCodes: string[] = [];
    if (assemblies.length !== ids.length) issueCodes.push("missing");
    if (issueCodes.length > 0) {
      const search = new URLSearchParams();
      search.set("asmGroupErr", issueCodes.join(","));
      return redirect(`/jobs/${opts.id}?${search.toString()}`);
    }
    const created = await prisma.assemblyGroup.create({
      data: { jobId: opts.id, name: name || undefined },
    });
    await prisma.assembly.updateMany({
      where: { id: { in: ids }, jobId: opts.id },
      data: { assemblyGroupId: created.id },
    });
  }
  return redirect(`/jobs/${opts.id}`);
}
