import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { buildWhereFromConfig } from "~/utils/buildWhereFromConfig.server";
import * as jobDetail from "~/modules/job/forms/jobDetail";

export async function handleJobDetailFind(opts: { id: number; form: FormData }) {
  const raw: Record<string, any> = {};
  for (const [k, v] of opts.form.entries()) {
    if (k.startsWith("_")) continue;
    if (k === "find") continue;
    raw[k] = v === "" ? null : v;
  }
  const searchFields: any[] = [
    ...((jobDetail as any).jobOverviewFields || []),
    ...((jobDetail as any).jobDateStatusLeft || []),
    ...((jobDetail as any).jobDateStatusRight || []),
  ];
  const where = buildWhereFromConfig(raw as any, searchFields as any);
  const first = await prisma.job.findFirst({
    where,
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const sp = new URLSearchParams();
  sp.set("find", "1");
  const returnParam = opts.form.get("return");
  if (returnParam) sp.set("return", String(returnParam));
  const push = (k: string, v: any) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  };
  push("id", raw.id);
  push("projectCode", raw.projectCode);
  push("name", raw.name);
  push("status", raw.status);
  push("jobType", raw.jobType);
  push("endCustomerName", raw.endCustomerName);
  push("companyId", raw.companyId);
  const qs = sp.toString();
  if (first?.id != null) return redirect(`/jobs/${first.id}?${qs}`);
  return redirect(`/jobs?${qs}`);
}

