import { json, redirect } from "@remix-run/node";
import type { Params } from "@remix-run/react";
import type { JobDetailVM } from "~/modules/job/types/jobDetailVM";
import { prisma } from "~/utils/prisma.server";
import {
  getActivityCountsByAssembly,
  getAssemblyTypes,
  getCancelActivitiesByAssembly,
  getCustomers,
  getJobWithAssembliesCompanyGroups,
  getProductChoices,
  getProductsForAssemblies,
} from "./jobDetailQueries.server";
import { coerceBreakdown, sumBreakdownArrays } from "~/modules/job/quantityUtils";
import {
  loadDefaultInternalTargetLeadDays,
  loadDefaultInternalTargetBufferDays,
  loadDefaultDropDeadEscalationBufferDays,
  resolveAssemblyTargets,
} from "~/modules/job/services/targetOverrides.server";
import { getCompanyAddressOptions } from "~/utils/addressOwnership.server";
import { loadJobProjectCodePrefix } from "~/modules/job/services/jobProjectCode.server";

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
  if (asmIds.length) {
    const cancelActs = await getCancelActivitiesByAssembly({ assemblyIds: asmIds });
    const canceledByAssembly = new Map<number, number[]>();
    for (const act of cancelActs) {
      const asmId = Number((act as any).assemblyId || 0);
      if (!asmId) continue;
      const current = canceledByAssembly.get(asmId) || [];
      const next = sumBreakdownArrays([
        current,
        coerceBreakdown(act.qtyBreakdown as any, act.quantity as any),
      ]);
      canceledByAssembly.set(asmId, next);
    }
    for (const asm of job.assemblies || []) {
      (asm as any).c_canceled_Breakdown =
        canceledByAssembly.get((asm as any).id) || [];
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
  const locations = await prisma.location.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const shipToAddresses = job.companyId
    ? await getCompanyAddressOptions(job.companyId)
    : [];
  const contacts = await prisma.contact.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      companyId: true,
      defaultAddressId: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    take: 5000,
  });
  const [
    defaultLeadDays,
    internalTargetBufferDays,
    dropDeadEscalationBufferDays,
    jobProjectCodePrefix,
  ] = await Promise.all([
    loadDefaultInternalTargetLeadDays(prisma),
    loadDefaultInternalTargetBufferDays(prisma),
    loadDefaultDropDeadEscalationBufferDays(prisma),
    loadJobProjectCodePrefix(prisma),
  ]);

  const jobTargets = resolveAssemblyTargets({
    job: {
      createdAt: job.createdAt,
      customerOrderDate: job.customerOrderDate ?? null,
      internalTargetDate: job.internalTargetDate,
      customerTargetDate: job.customerTargetDate,
      dropDeadDate: job.dropDeadDate,
      shipToLocation: job.shipToLocation ?? null,
      shipToAddress: job.shipToAddress ?? null,
    },
    assembly: null,
    defaultLeadDays,
    bufferDays: internalTargetBufferDays,
    escalationBufferDays: dropDeadEscalationBufferDays,
  });

  const assemblyTargetsById: Record<number, any> = Object.fromEntries(
    (job.assemblies || []).map((assembly: any) => {
      const resolved = resolveAssemblyTargets({
        job: {
          createdAt: job.createdAt,
          customerOrderDate: job.customerOrderDate ?? null,
          internalTargetDate: job.internalTargetDate,
          customerTargetDate: job.customerTargetDate,
          dropDeadDate: job.dropDeadDate,
          shipToLocation: job.shipToLocation ?? null,
          shipToAddress: job.shipToAddress ?? null,
        },
        assembly: {
          internalTargetDateOverride: assembly.internalTargetDateOverride,
          customerTargetDateOverride: assembly.customerTargetDateOverride,
          dropDeadDateOverride: assembly.dropDeadDateOverride,
          shipToLocationOverride: assembly.shipToLocationOverride ?? null,
          shipToAddressOverride: assembly.shipToAddressOverride ?? null,
        },
        defaultLeadDays,
        bufferDays: internalTargetBufferDays,
        escalationBufferDays: dropDeadEscalationBufferDays,
      });
      return [assembly.id, resolved];
    })
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
    locations,
    contacts,
    shipToAddresses,
    defaultLeadDays,
    internalTargetBufferDays,
    dropDeadEscalationBufferDays,
    jobProjectCodePrefix,
    jobTargets,
    assemblyTargetsById,
  };

  return json(vm as any);
}
