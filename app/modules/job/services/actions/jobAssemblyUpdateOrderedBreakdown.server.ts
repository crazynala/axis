import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";

export async function handleJobAssemblyUpdateOrderedBreakdown(opts: { id: number; form: FormData }) {
  const assemblyId = Number(opts.form.get("assemblyId"));
  const arrStr = String(opts.form.get("orderedArr") || "");
  try {
    const arr = JSON.parse(arrStr);
    if (Array.isArray(arr)) {
      const ints = arr.map((n: any) => (Number.isFinite(Number(n)) ? Number(n) | 0 : 0));
      await prisma.assembly.update({
        where: { id: assemblyId },
        data: { qtyOrderedBreakdown: ints as any },
      });
    }
  } catch {}
  return redirect(`/jobs/${opts.id}`);
}

