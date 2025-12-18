import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import {
  applyJobStateTransition,
  JobStateError,
  syncJobStateFromAssemblies,
} from "~/modules/job/services/JobStateService";
import { normalizeAssemblyState } from "~/modules/job/stateUtils";

export async function handleJobDetailUpdate(opts: { id: number; form: FormData }) {
  const data: any = {};
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
  if (opts.form.has("companyId")) {
    const raw = String(opts.form.get("companyId") ?? "");
    if (raw === "") {
      data.companyId = null;
    } else {
      const cid = Number(raw);
      data.companyId = Number.isFinite(cid) ? cid : null;
      if (Number.isFinite(cid)) {
        const company = await prisma.company.findUnique({
          where: { id: cid },
          select: { stockLocationId: true },
        });
        const locId = company?.stockLocationId ?? null;
        if (locId != null) data.stockLocationId = locId;
      }
    }
  }
  if (opts.form.has("stockLocationId")) {
    const raw = String(opts.form.get("stockLocationId") ?? "");
    if (raw === "") data.stockLocationId = null;
    else {
      const lid = Number(raw);
      data.stockLocationId = Number.isFinite(lid) ? lid : null;
    }
  }
  const dateFields = ["customerOrderDate", "targetDate", "dropDeadDate", "cutSubmissionDate"];
  for (const df of dateFields)
    if (opts.form.has(df)) {
      const v = opts.form.get(df) as string;
      data[df] = v ? new Date(v) : null;
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
  try {
    if (Object.keys(data).length) {
      await prisma.job.update({ where: { id: opts.id }, data });
    }
    if (nextStatus) {
      await applyJobStateTransition(prisma, opts.id, nextStatus);
    }
    if (assemblyStatusMap.size || assemblyWhiteboardMap.size || assemblyTypeMap.size) {
      const asmIds = Array.from(
        new Set([
          ...assemblyStatusMap.keys(),
          ...assemblyWhiteboardMap.keys(),
          ...assemblyTypeMap.keys(),
        ])
      );
      const assemblies = await prisma.assembly.findMany({
        where: { id: { in: asmIds }, jobId: opts.id },
        select: {
          id: true,
          status: true,
          statusWhiteboard: true,
          assemblyType: true,
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
          if (Object.keys(data).length) {
            return { id: asm.id, data };
          }
          return null;
        })
        .filter(Boolean) as Array<{ id: number; data: Record<string, any> }>;
      for (const update of updates) {
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

