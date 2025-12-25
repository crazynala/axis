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
  loadDefaultInternalTargetBufferDays,
  loadDefaultDropDeadEscalationBufferDays,
  resolveAssemblyTargets,
} from "~/modules/job/services/targetOverrides.server";
import { deriveInternalTargetDate } from "~/modules/job/services/jobTargetDefaults";
import { isCompanyImmutableViolation } from "~/modules/job/services/jobUpdateRules";
import {
  resolveJobSetupDefaults,
} from "~/modules/job/services/jobSetupDefaults";
import {
  buildProjectCodeFromIncrement,
  parseJobProjectCodeNumber,
} from "~/modules/job/services/jobProjectCode";
import { loadJobProjectCodePrefix } from "~/modules/job/services/jobProjectCode.server";
import {
  assertAddressAllowedForShipment,
} from "~/utils/addressOwnership.server";

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
  let nextEndCustomerContactId: number | null = null;
  let resolvedContactId: number | null = null;
  let assignProjectCodeCompanyId: number | null = null;
  let assignProjectCodeShortCode: string | null = null;
  const jobProjectCodePrefix = await loadJobProjectCodePrefix(prisma);
  const fields = [
    "name",
    "jobType",
    "customerPoNum",
    "statusWhiteboard",
  ];
  for (const f of fields) if (opts.form.has(f)) data[f] = (opts.form.get(f) as string) || null;
  let nextProjectCode: string | null = null;
  if (opts.form.has("projectCode")) {
    const raw = String(opts.form.get("projectCode") ?? "").trim();
    nextProjectCode = raw || null;
    data.projectCode = nextProjectCode;
  }
  if (opts.form.has("endCustomerContactId")) {
    const raw = String(opts.form.get("endCustomerContactId") ?? "").trim();
    if (!raw) {
      nextEndCustomerContactId = null;
      data.endCustomerContactId = null;
      data.endCustomerName = null;
    } else {
      const parsed = Number(raw);
      nextEndCustomerContactId = Number.isFinite(parsed) ? parsed : null;
      data.endCustomerContactId = nextEndCustomerContactId;
    }
  }
  if (nextEndCustomerContactId != null) {
    resolvedContactId = nextEndCustomerContactId;
  }
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
  const needsJobDefaultsLookup =
    opts.form.has("companyId") ||
    opts.form.has("endCustomerContactId") ||
    opts.form.has("projectCode") ||
    opts.form.has("shipToAddressId") ||
    opts.form.has("customerOrderDate") ||
    opts.form.has("internalTargetDate") ||
    opts.form.has("customerTargetDate");
  const existingJob = needsJobDefaultsLookup
    ? await prisma.job.findUnique({
        where: { id: opts.id },
        select: {
          companyId: true,
          projectCode: true,
          endCustomerContactId: true,
          customerOrderDate: true,
          createdAt: true,
          internalTargetDate: true,
          customerTargetDate: true,
          dropDeadDate: true,
        },
      })
    : null;
  nextCompanyId = existingJob?.companyId ?? null;
  resolvedCompanyId = nextCompanyId;
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
    const parsed = raw === "" ? null : Number(raw);
    const next = Number.isFinite(parsed as number) ? (parsed as number) : null;
    if (
      isCompanyImmutableViolation({
        existingCompanyId: nextCompanyId,
        nextCompanyId: next,
      })
    ) {
      return json(
        { error: "Customer cannot be changed after job creation." },
        { status: 400 }
      );
    }
  }
  if (nextEndCustomerContactId != null) {
    const contact = await prisma.contact.findUnique({
      where: { id: nextEndCustomerContactId },
      select: { companyId: true, firstName: true, lastName: true },
    });
    const targetCompanyId = nextCompanyId ?? existingJob?.companyId ?? null;
    if (!contact) {
      return json(
        { error: "End-customer contact could not be found." },
        { status: 400 }
      );
    }
    if (targetCompanyId != null && contact.companyId !== targetCompanyId) {
      return json(
        { error: "End-customer contact must belong to the selected company." },
        { status: 400 }
      );
    }
    const name = [contact.firstName, contact.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    data.endCustomerName = name || null;
  }
  if (!nextProjectCode && !existingJob?.projectCode) {
    const targetCompanyId = nextCompanyId ?? null;
    if (targetCompanyId != null && assignProjectCodeShortCode == null) {
      const company = await prisma.company.findUnique({
        where: { id: targetCompanyId },
        select: { shortCode: true },
      });
      if (company?.shortCode) {
        assignProjectCodeCompanyId = targetCompanyId;
        assignProjectCodeShortCode = company.shortCode;
      }
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
      if (nextCompanyId != null) {
        const company = await prisma.company.findUnique({
          where: { id: nextCompanyId },
          select: { defaultAddressId: true, stockLocationId: true },
        });
        const defaults = resolveJobSetupDefaults({ company });
        if (defaults.shipToAddressId != null) {
          data.shipToAddress = { connect: { id: defaults.shipToAddressId } };
        } else {
          data.shipToAddress = { disconnect: true };
        }
      } else {
        data.shipToAddress = { disconnect: true };
      }
    } else {
      const addrId = Number(raw);
      if (Number.isFinite(addrId)) {
        if (resolvedCompanyId == null) {
          resolvedCompanyId =
            nextCompanyId ?? existingJob?.companyId ?? null;
        }
        if (resolvedContactId == null) {
          resolvedContactId = existingJob?.endCustomerContactId ?? null;
        }
        const allowed = await assertAddressAllowedForShipment(
          addrId,
          resolvedCompanyId,
          resolvedContactId
        );
        if (!allowed) {
          return json(
            {
              error:
                "Ship-to address must belong to the job's company or end-customer contact.",
            },
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
    Object.prototype.hasOwnProperty.call(dateValues, "customerTargetDate") ||
    Object.prototype.hasOwnProperty.call(dateValues, "customerOrderDate")
  ) {
    const current = await prisma.job.findUnique({
      where: { id: opts.id },
      select: {
        createdAt: true,
        customerOrderDate: true,
        internalTargetDate: true,
        customerTargetDate: true,
        dropDeadDate: true,
      },
    });
    let nextInternal =
      dateValues.internalTargetDate ?? current?.internalTargetDate ?? null;
    const nextCustomer =
      dateValues.customerTargetDate ?? current?.customerTargetDate ?? null;
    const nextOrderDate =
      dateValues.customerOrderDate ?? current?.customerOrderDate ?? null;
    const [defaultLeadDays, bufferDays, escalationBufferDays] = await Promise.all(
      [
        loadDefaultInternalTargetLeadDays(prisma),
        loadDefaultInternalTargetBufferDays(prisma),
        loadDefaultDropDeadEscalationBufferDays(prisma),
      ]
    );
    const derivedCurrent = deriveInternalTargetDate({
      baseDate: current?.customerOrderDate ?? current?.createdAt ?? null,
      customerTargetDate: current?.customerTargetDate ?? null,
      defaultLeadDays,
      bufferDays,
      now: new Date(),
    });
    const derivedNext = deriveInternalTargetDate({
      baseDate: nextOrderDate ?? current?.createdAt ?? null,
      customerTargetDate: nextCustomer ?? null,
      defaultLeadDays,
      bufferDays,
      now: new Date(),
    });
    const sameDay = (a: Date | null, b: Date | null) =>
      a && b
        ? a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
        : false;
    const shouldUpdateInternalFromOrder =
      !dateValues.internalTargetDate &&
      dateValues.customerOrderDate != null &&
      (!current?.internalTargetDate ||
        (derivedCurrent && sameDay(derivedCurrent, current.internalTargetDate)));
    if (shouldUpdateInternalFromOrder && derivedNext) {
      data.internalTargetDate = derivedNext;
      nextInternal = derivedNext;
    }
    const resolved = resolveAssemblyTargets({
      job: {
        createdAt: current?.createdAt ?? null,
        customerOrderDate: nextOrderDate ?? current?.customerOrderDate ?? null,
        internalTargetDate: nextInternal,
        customerTargetDate: nextCustomer,
        dropDeadDate: current?.dropDeadDate ?? null,
        shipToLocation: null,
        shipToAddress: null,
      },
      assembly: null,
      defaultLeadDays,
      bufferDays,
      escalationBufferDays,
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
      let projectCodeSync:
        | { companyId: number; nextNumber: number }
        | null = null;
      if (nextProjectCode) {
        const targetCompanyId = nextCompanyId ?? existingJob?.companyId ?? null;
        if (targetCompanyId != null) {
          const company = await prisma.company.findUnique({
            where: { id: targetCompanyId },
            select: { shortCode: true, projectCodeNextNumber: true },
          });
          const parsed = parseJobProjectCodeNumber({
            code: nextProjectCode,
            shortCode: company?.shortCode,
            prefix: jobProjectCodePrefix,
          });
          if (parsed != null) {
            const base = Number(company?.projectCodeNextNumber ?? 1) || 1;
            projectCodeSync = {
              companyId: targetCompanyId,
              nextNumber: Math.max(base, parsed + 1),
            };
          }
        }
      }

      if (assignProjectCodeCompanyId != null && assignProjectCodeShortCode) {
        await prisma.$transaction(async (tx) => {
          const updated = await tx.company.update({
            where: { id: assignProjectCodeCompanyId },
            data: { projectCodeNextNumber: { increment: 1 } },
            select: { projectCodeNextNumber: true },
          });
          const assigned = buildProjectCodeFromIncrement({
            shortCode: assignProjectCodeShortCode,
            prefix: jobProjectCodePrefix,
            nextNumberAfterIncrement: updated.projectCodeNextNumber,
          });
          if (assigned) data.projectCode = assigned;
          await tx.job.update({ where: { id: opts.id }, data });
        });
      } else if (projectCodeSync) {
        await prisma.$transaction(async (tx) => {
          await tx.job.update({ where: { id: opts.id }, data });
          await tx.company.update({
            where: { id: projectCodeSync.companyId },
            data: { projectCodeNextNumber: projectCodeSync.nextNumber },
          });
        });
      } else {
        await prisma.job.update({ where: { id: opts.id }, data });
      }
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
