import { json, redirect } from "@remix-run/node";
import type { Params } from "@remix-run/react";
import type { JobDetailVM } from "~/modules/job/types/jobDetailVM";
import {
  getActivityCountsByAssembly,
  getAssemblyTypes,
  getCustomers,
  getJobWithAssembliesCompanyGroups,
  getProductChoices,
  getProductsForAssemblies,
} from "./jobDetailQueries.server";

export async function loadJobDetailVM(opts: { params: Params }) {
  const id = Number(opts.params.id);
  if (!id) return redirect("/jobs");
  const job = await getJobWithAssembliesCompanyGroups({ id });
  if (!job) return redirect("/jobs");

  const asmIds = (job.assemblies || [])
    .map((a: any) => a.id)
    .filter((n: any) => Number.isFinite(Number(n)));
  let activityCounts: Record<number, number> = {};
  if (asmIds.length) {
    const rows = await getActivityCountsByAssembly({ assemblyIds: asmIds });
    for (const r of rows) {
      const asmId = Number((r as any).assemblyId) || 0;
      if (!asmId) continue;
      activityCounts[asmId] = (r as any)._count.assemblyId;
    }
  }

  const productIds = Array.from(
    new Set((job.assemblies || []).map((a: any) => a.productId).filter(Boolean))
  ) as number[];
  const products = await getProductsForAssemblies({ productIds });
  const productsById: Record<number, any> = Object.fromEntries(
    products.map((p: any) => [p.id, p])
  );
  const assemblyTypes = await getAssemblyTypes();
  const customers = await getCustomers();
  const productChoices = await getProductChoices();
  const groupsById: Record<number, any> = Object.fromEntries(
    (job.assemblyGroups || []).map((g: any) => [g.id, g])
  );

  console.log("[jobs.$id] Loader assemblies data", {
    jobId: id,
    assembliesCount: (job.assemblies || []).length,
    assemblies: (job.assemblies || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      c_qtyOrdered: (a as any).c_qtyOrdered,
      c_qtyCut: (a as any).c_qtyCut,
      hasComputedFields: !!((a as any).c_qtyOrdered !== undefined || (a as any).c_qtyCut !== undefined),
    })),
  });

  const vm: JobDetailVM = {
    job,
    productsById,
    assemblyTypes,
    customers,
    productChoices,
    groupsById,
    activityCounts,
  };

  return json(vm as any);
}

