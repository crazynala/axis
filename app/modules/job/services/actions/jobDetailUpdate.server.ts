import { json, redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { AssemblyStage } from "@prisma/client";
import {
  applyJobStateTransition,
  JobStateError,
  syncJobStateFromAssemblies,
} from "~/modules/job/services/JobStateService";
import {
  normalizeAssemblyState,
  normalizeJobPrimaryState,
} from "~/modules/job/stateUtils";
import {
  coerceBreakdown,
  computeEffectiveOrderedBreakdown,
  computeOrderedTotal,
  sumBreakdownArrays,
} from "~/modules/job/quantityUtils";
import { createCancelActivity } from "~/utils/activity.server";
import {
  loadDefaultInternalTargetLeadDays,
  resolveAssemblyTargets,
} from "~/modules/job/services/targetOverrides.server";
import { assertAddressOwnedByCompany } from "~/utils/addressOwnership.server";

const HOLD_TYPES = new Set(["CLIENT", "INTERNAL"]);

async function buildCanceledByAssembly(assemblyIds: number[]) {
  const map = new Map<number, number[]>();
  if (!assemblyIds.length) return map;
  const rows = await prisma.assemblyActivity.findMany({
    where: { assemblyId: { in: assemblyIds }, stage: AssemblyStage.cancel },
    select: { assemblyId: true, qtyBreakdown: true, quantity: true },
  });
  for (const row of rows) {
    const asmId = Number((row as any).assemblyId || 0);
    if (!asmId) continue;
    const current = map.get(asmId) || [];
    const next = sumBreakdownArrays([
      current,
      coerceBreakdown(row.qtyBreakdown as any, row.quantity as any),
    ]);
    map.set(asmId, next);
  }
  return map;
}

export async function handleJobDetailUpdate(opts: { id: number; form: FormData }) {
  const data: any = {};
  let nextCompanyId: number | null = null;
  let resolvedCompanyId: number | null = null;
  const fields = [
    "projectCode",
    "name",
    "jobType",
    "endCustomerName",
    "customerPoNum",
    "statusWhiteboard",
  ];
  for (const f of fields) if (opts.form.has(f)) data[f] = (opts.form.get(f) as string) || null;
  let nextStatus: string | null = null;
  if (opts.form.has("status")) {
    const rawStatus = String(opts.form.get("status") ?? "").trim();
    nextStatus = rawStatus ? rawStatus : null;
  }
  let nextState: string | null = null;
  if (opts.form.has("state")) {
    const rawState = String(opts.form.get("state") ?? "").trim();
    nextState = rawState ? rawState : null;
  }
  const cancelReason = opts.form.has("jobCancelReason")
    ? String(opts.form.get("jobCancelReason") ?? "").trim()
    : "";
  const cancelMode = opts.form.has("jobCancelMode")
    ? String(opts.form.get("jobCancelMode") ?? "").trim()
    : "";
  let nextJobHoldOn: boolean | null = null;
  if (opts.form.has("jobHoldOn")) {
    const raw = String(opts.form.get("jobHoldOn") ?? "").trim().toLowerCase();
    nextJobHoldOn = raw === "true" || raw === "1" || raw === "on";
  }
  const normalizedState = nextState ? normalizeJobPrimaryState(nextState) : null;
  const needsJobStateCheck =
    normalizedState === "CANCELED" || normalizedState === "COMPLETE";
  const jobRecord = needsJobStateCheck
    ? await prisma.job.findUnique({
        where: { id: opts.id },
        select: { state: true },
      })
    : null;
  if (nextState && !normalizedState) {
    return redirect(`/jobs/${opts.id}?jobPrimaryErr=invalid`);
  }
  if (normalizedState === "CANCELED") {
    if (!cancelReason) {
      return redirect(`/jobs/${opts.id}?jobCancelErr=reason_required`);
    }
    if (jobRecord?.state === "COMPLETE") {
      return redirect(`/jobs/${opts.id}?jobCancelErr=complete_blocked`);
    }
  }
  if (normalizedState === "COMPLETE") {
    const assemblies = await prisma.assembly.findMany({
      where: { jobId: opts.id },
      select: {
        id: true,
        status: true,
        qtyOrderedBreakdown: true,
      },
    });
    const canceledByAssembly = await buildCanceledByAssembly(
      assemblies.map((asm) => asm.id)
    );
    const incomplete = assemblies.filter((asm) => {
      const orderedTotal = computeOrderedTotal(
        asm.qtyOrderedBreakdown as number[] | null
      );
      const canceledBreakdown = canceledByAssembly.get(asm.id) || [];
      const effective = computeEffectiveOrderedBreakdown({
        orderedBySize: (asm.qtyOrderedBreakdown as number[] | null) || [],
        canceledBySize: canceledBreakdown,
      });
      if (orderedTotal > 0 && effective.total <= 0) return false;
      const status = normalizeAssemblyState(asm.status as string | null);
      return status !== "COMPLETE" && status !== "CANCELED";
    });
    if (incomplete.length) {
      return redirect(`/jobs/${opts.id}?jobCompleteErr=incomplete`);
    }
  }
  if (nextJobHoldOn === true) {
    const reason = String(opts.form.get("jobHoldReason") ?? "").trim();
    if (!reason) {
      return redirect(`/jobs/${opts.id}?jobHoldErr=reason_required`);
    }
  }
  if (opts.form.has("companyId")) {
    const raw = String(opts.form.get("companyId") ?? "");
    if (raw === "") {
      data.company = { disconnect: true };
      nextCompanyId = null;
    } else {
      const cid = Number(raw);
      if (Number.isFinite(cid)) {
        data.company = { connect: { id: cid } };
        nextCompanyId = cid;
        const company = await prisma.company.findUnique({
          where: { id: cid },
          select: { stockLocationId: true },
        });
        const locId = company?.stockLocationId ?? null;
        if (locId != null) data.stockLocation = { connect: { id: locId } };
      }
    }
  }
  if (opts.form.has("stockLocationId")) {
    const raw = String(opts.form.get("stockLocationId") ?? "");
    if (raw === "") data.stockLocation = { disconnect: true };
    else {
      const lid = Number(raw);
      if (Number.isFinite(lid)) data.stockLocation = { connect: { id: lid } };
    }
  }
  if (opts.form.has("shipToLocationId")) {
    const raw = String(opts.form.get("shipToLocationId") ?? "");
    if (raw === "") data.shipToLocation = { disconnect: true };
    else {
      const lid = Number(raw);
      if (Number.isFinite(lid)) data.shipToLocation = { connect: { id: lid } };
    }
  }
  if (opts.form.has("shipToAddressId")) {
    const raw = String(opts.form.get("shipToAddressId") ?? "");
    if (raw === "") {
      data.shipToAddress = { disconnect: true };
    } else {
      const addrId = Number(raw);
      if (Number.isFinite(addrId)) {
        if (resolvedCompanyId == null) {
          if (nextCompanyId != null) {
            resolvedCompanyId = nextCompanyId;
          } else {
            const job = await prisma.job.findUnique({
              where: { id: opts.id },
              select: { companyId: true },
            });
            resolvedCompanyId = job?.companyId ?? null;
          }
        }
        const owned =
          resolvedCompanyId != null
            ? await assertAddressOwnedByCompany(addrId, resolvedCompanyId)
            : false;
        if (!owned) {
          return json(
            { error: "Ship-to address must belong to the job's company." },
            { status: 400 }
          );
        }
        data.shipToAddress = { connect: { id: addrId } };
      }
    }
  }
  if (normalizedState) {
    data.state = normalizedState;
    if (normalizedState === "CANCELED") {
      data.cancelReason = cancelReason || null;
      data.canceledAt = new Date();
    }
  }
  if (nextJobHoldOn !== null) {
    data.jobHoldOn = nextJobHoldOn;
    if (!nextJobHoldOn) {
      data.jobHoldReason = null;
      data.jobHoldType = null;
    }
  }
  if (opts.form.has("jobHoldReason")) {
    const reason = String(opts.form.get("jobHoldReason") ?? "").trim();
    if (reason || nextJobHoldOn) data.jobHoldReason = reason || null;
  }
  if (opts.form.has("jobHoldType")) {
    const raw = String(opts.form.get("jobHoldType") ?? "").trim().toUpperCase();
    data.jobHoldType = HOLD_TYPES.has(raw) ? raw : null;
  }
  const dateFields = [
    "customerOrderDate",
    "internalTargetDate",
    "customerTargetDate",
    "targetDate",
    "dropDeadDate",
    "cutSubmissionDate",
  ];
  const dateValues: Record<string, Date | null> = {};
  for (const df of dateFields) {
    if (!opts.form.has(df)) continue;
    const v = opts.form.get(df) as string;
    const parsed = v ? new Date(v) : null;
    dateValues[df] = parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
    data[df] = dateValues[df];
  }
  if (
    Object.prototype.hasOwnProperty.call(dateValues, "internalTargetDate") ||
    Object.prototype.hasOwnProperty.call(dateValues, "customerTargetDate")
  ) {
    const current = await prisma.job.findUnique({
      where: { id: opts.id },
      select: {
        createdAt: true,
        internalTargetDate: true,
        customerTargetDate: true,
        dropDeadDate: true,
      },
    });
    const nextInternal =
      dateValues.internalTargetDate ?? current?.internalTargetDate ?? null;
    const nextCustomer =
      dateValues.customerTargetDate ?? current?.customerTargetDate ?? null;
    const defaultLeadDays = await loadDefaultInternalTargetLeadDays(prisma);
    const resolved = resolveAssemblyTargets({
      job: {
        createdAt: current?.createdAt ?? null,
        internalTargetDate: nextInternal,
        customerTargetDate: nextCustomer,
        dropDeadDate: current?.dropDeadDate ?? null,
        shipToLocation: null,
        shipToAddress: null,
      },
      assembly: null,
      defaultLeadDays,
    });
    if (dateValues.internalTargetDate && resolved.internalWasClamped) {
      data.internalTargetDate = resolved.internal.value;
    }
  }
  const assemblyStatusMap = new Map<number, string>();
  if (opts.form.has("assemblyStatuses")) {
    const rawStatuses = String(opts.form.get("assemblyStatuses") || "{}");
    try {
      const obj = JSON.parse(rawStatuses);
      if (obj && typeof obj === "object") {
        for (const [key, val] of Object.entries(obj)) {
          const asmId = Number(key);
          if (!Number.isFinite(asmId)) continue;
          const normalized = normalizeAssemblyState(
            typeof val === "string" ? val : String(val ?? "")
          );
          if (!normalized) continue;
          assemblyStatusMap.set(asmId, normalized);
        }
      }
    } catch {}
  }
  const assemblyWhiteboardMap = new Map<number, string>();
  if (opts.form.has("assemblyWhiteboards")) {
    const rawNotes = String(opts.form.get("assemblyWhiteboards") || "{}");
    try {
      const obj = JSON.parse(rawNotes);
      if (obj && typeof obj === "object") {
        for (const [key, val] of Object.entries(obj)) {
          const asmId = Number(key);
          if (!Number.isFinite(asmId)) continue;
          assemblyWhiteboardMap.set(asmId, typeof val === "string" ? val : String(val ?? ""));
        }
      }
    } catch {}
  }
  const assemblyHoldOnMap = new Map<number, boolean>();
  if (opts.form.has("assemblyManualHoldOn")) {
    const rawHold = String(opts.form.get("assemblyManualHoldOn") || "{}");
    try {
      const obj = JSON.parse(rawHold);
      if (obj && typeof obj === "object") {
        for (const [key, val] of Object.entries(obj)) {
          const asmId = Number(key);
          if (!Number.isFinite(asmId)) continue;
          assemblyHoldOnMap.set(asmId, Boolean(val));
        }
      }
    } catch {}
  }
  const assemblyHoldReasonMap = new Map<number, string>();
  if (opts.form.has("assemblyManualHoldReason")) {
    const rawReason = String(opts.form.get("assemblyManualHoldReason") || "{}");
    try {
      const obj = JSON.parse(rawReason);
      if (obj && typeof obj === "object") {
        for (const [key, val] of Object.entries(obj)) {
          const asmId = Number(key);
          if (!Number.isFinite(asmId)) continue;
          assemblyHoldReasonMap.set(
            asmId,
            typeof val === "string" ? val : String(val ?? "")
          );
        }
      }
    } catch {}
  }
  const assemblyHoldTypeMap = new Map<number, string>();
  if (opts.form.has("assemblyManualHoldType")) {
    const rawType = String(opts.form.get("assemblyManualHoldType") || "{}");
    try {
      const obj = JSON.parse(rawType);
      if (obj && typeof obj === "object") {
        for (const [key, val] of Object.entries(obj)) {
          const asmId = Number(key);
          if (!Number.isFinite(asmId)) continue;
          const normalized = typeof val === "string" ? val.toUpperCase() : "";
          assemblyHoldTypeMap.set(asmId, normalized);
        }
      }
    } catch {}
  }
  const assemblyTypeMap = new Map<number, string>();
  if (opts.form.has("assemblyTypes")) {
    const rawTypes = String(opts.form.get("assemblyTypes") || "{}");
    try {
      const obj = JSON.parse(rawTypes);
      if (obj && typeof obj === "object") {
        for (const [key, val] of Object.entries(obj)) {
          const asmId = Number(key);
          if (!Number.isFinite(asmId)) continue;
          const v = typeof val === "string" ? val : String(val ?? "");
          assemblyTypeMap.set(asmId, v || "Prod");
        }
    }
  } catch {}
  }
  if (assemblyHoldOnMap.size) {
    const missingReasons: number[] = [];
    for (const [asmId, holdOn] of assemblyHoldOnMap.entries()) {
      if (!holdOn) continue;
      const reason = assemblyHoldReasonMap.get(asmId) ?? "";
      if (!String(reason).trim()) missingReasons.push(asmId);
    }
    if (missingReasons.length) {
      return redirect(`/jobs/${opts.id}?asmHoldErr=${missingReasons.join(",")}`);
    }
  }
  try {
    if (Object.keys(data).length) {
      // TODO: add OperationLog entries for job state/hold changes.
      await prisma.job.update({ where: { id: opts.id }, data });
    }
    if (normalizedState === "CANCELED" && cancelMode === "cancel_remaining") {
      const assemblies = await prisma.assembly.findMany({
        where: { jobId: opts.id },
        select: {
          id: true,
          qtyOrderedBreakdown: true,
        },
      });
      const canceledByAssembly = await buildCanceledByAssembly(
        assemblies.map((asm) => asm.id)
      );
      for (const asm of assemblies) {
        const ordered = Array.isArray(asm.qtyOrderedBreakdown)
          ? (asm.qtyOrderedBreakdown as number[])
          : [];
        const len = ordered.length;
        if (!len) continue;
        const cut = Array.isArray((asm as any).c_qtyCut_Breakdown)
          ? ((asm as any).c_qtyCut_Breakdown as number[])
          : [];
        const sew = Array.isArray((asm as any).c_qtySew_Breakdown)
          ? ((asm as any).c_qtySew_Breakdown as number[])
          : [];
        const finish = Array.isArray((asm as any).c_qtyFinish_Breakdown)
          ? ((asm as any).c_qtyFinish_Breakdown as number[])
          : [];
        const pack = Array.isArray((asm as any).c_qtyPack_Breakdown)
          ? ((asm as any).c_qtyPack_Breakdown as number[])
          : [];
        const canceledExisting = canceledByAssembly.get(asm.id) || [];
        const effectiveOrdered = computeEffectiveOrderedBreakdown({
          orderedBySize: ordered,
          canceledBySize: canceledExisting,
        }).effective;
        const baseline = ordered.map((_, idx) =>
          Math.max(
            Number(pack[idx] ?? 0) || 0,
            Number(finish[idx] ?? 0) || 0,
            Number(sew[idx] ?? 0) || 0,
            Number(cut[idx] ?? 0) || 0
          )
        );
        const canceledBySize = ordered.map((_, idx) =>
          Math.max(
            0,
            Number(effectiveOrdered[idx] || 0) -
              Math.max(0, Number(baseline[idx] || 0))
          )
        );
        const canceledTotal = canceledBySize.reduce(
          (total, value) => total + (Number(value) || 0),
          0
        );
        if (canceledTotal <= 0) continue;
        await createCancelActivity({
          assemblyId: asm.id,
          jobId: opts.id,
          activityDate: new Date(),
          qtyBreakdown: canceledBySize,
          notes: cancelReason || null,
        });
      }
    }
    if (nextStatus) {
      await applyJobStateTransition(prisma, opts.id, nextStatus);
    }
    if (
      assemblyStatusMap.size ||
      assemblyWhiteboardMap.size ||
      assemblyTypeMap.size ||
      assemblyHoldOnMap.size ||
      assemblyHoldReasonMap.size ||
      assemblyHoldTypeMap.size
    ) {
      const asmIds = Array.from(
        new Set([
          ...assemblyStatusMap.keys(),
          ...assemblyWhiteboardMap.keys(),
          ...assemblyTypeMap.keys(),
          ...assemblyHoldOnMap.keys(),
          ...assemblyHoldReasonMap.keys(),
          ...assemblyHoldTypeMap.keys(),
        ])
      );
      const assemblies = await prisma.assembly.findMany({
        where: { id: { in: asmIds }, jobId: opts.id },
        select: {
          id: true,
          status: true,
          statusWhiteboard: true,
          assemblyType: true,
          manualHoldOn: true,
          manualHoldReason: true,
          manualHoldType: true,
        },
      });
      let statusUpdates = 0;
      const updates = assemblies
        .map((asm) => {
          const data: Record<string, any> = {};
          const nextStatus = assemblyStatusMap.get(asm.id);
          const currentStatus = normalizeAssemblyState(asm.status as string | null);
          if (nextStatus && nextStatus !== currentStatus) {
            data.status = nextStatus;
            statusUpdates += 1;
          }
          if (assemblyWhiteboardMap.has(asm.id)) {
            const rawNote = assemblyWhiteboardMap.get(asm.id) ?? "";
            const nextNote = rawNote === "" ? null : rawNote;
            const currentNote = (asm.statusWhiteboard || null) as string | null;
            if (nextNote !== currentNote) {
              data.statusWhiteboard = nextNote;
            }
          }
        if (assemblyTypeMap.has(asm.id)) {
          const nextType = assemblyTypeMap.get(asm.id) || "Prod";
          if (nextType !== (asm.assemblyType || "Prod")) {
            data.assemblyType = nextType;
          }
        }
        if (assemblyHoldOnMap.has(asm.id)) {
          const nextHoldOn = Boolean(assemblyHoldOnMap.get(asm.id));
          const currentHoldOn = Boolean((asm as any).manualHoldOn);
          if (nextHoldOn !== currentHoldOn) {
            data.manualHoldOn = nextHoldOn;
          }
          if (!nextHoldOn) {
            data.manualHoldReason = null;
            data.manualHoldType = null;
          }
        }
        if (assemblyHoldReasonMap.has(asm.id)) {
          const rawReason = assemblyHoldReasonMap.get(asm.id) ?? "";
          const nextReason = String(rawReason).trim() || null;
          const currentReason = ((asm as any).manualHoldReason || null) as string | null;
          if (nextReason !== currentReason) {
            data.manualHoldReason = nextReason;
          }
        }
        if (assemblyHoldTypeMap.has(asm.id)) {
          const rawType = assemblyHoldTypeMap.get(asm.id) || "";
          const nextType = HOLD_TYPES.has(rawType) ? rawType : null;
          const currentType = ((asm as any).manualHoldType || null) as string | null;
          if (nextType !== currentType) {
            data.manualHoldType = nextType;
          }
        }
          if (Object.keys(data).length) {
            return { id: asm.id, data };
          }
          return null;
        })
        .filter(Boolean) as Array<{ id: number; data: Record<string, any> }>;
      for (const update of updates) {
        // TODO: add OperationLog entries for assembly manual hold changes.
        await prisma.assembly.update({
          where: { id: update.id },
          data: update.data,
        });
      }
      if (statusUpdates > 0 && !nextStatus) {
        await syncJobStateFromAssemblies(prisma, opts.id);
      }
    }
  } catch (err) {
    if (err instanceof JobStateError) {
      return redirect(`/jobs/${opts.id}?jobStateErr=${err.code}`);
    }
    throw err;
  }
  return redirect(`/jobs/${opts.id}`);
}
