import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { createCancelActivity } from "~/utils/activity.server";
import {
  coerceBreakdown,
  computeEffectiveOrderedBreakdown,
  computeOrderedTotal,
  normalizeBreakdownLength,
  sumBreakdownArrays,
} from "~/modules/job/quantityUtils";

const toInt = (value: FormDataEntryValue | null): number => {
  const raw = typeof value === "string" ? value : "";
  const num = Number(raw);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
};

const normalizeStage = (stage?: string | null, name?: string | null) => {
  let normalized = (stage || "").toString().toLowerCase();
  if (!normalized) {
    const raw = (name || "").toString().toLowerCase();
    if (raw.includes("cut")) normalized = "cut";
    else if (raw.includes("sew")) normalized = "sew";
    else if (raw.includes("finish") || raw.includes("make")) normalized = "finish";
    else if (raw.includes("pack")) normalized = "pack";
    else if (raw.includes("qc")) normalized = "qc";
    else if (raw.includes("cancel")) normalized = "cancel";
    else normalized = "other";
  }
  if (normalized === "make") normalized = "finish";
  if (normalized === "trim") normalized = "sew";
  if (normalized === "embroidery") normalized = "finish";
  return normalized;
};

export async function handleAssemblyCancel(opts: {
  jobId: number;
  assemblyId: number;
  form: FormData;
  rawAssemblyIdParam?: string;
}) {
  const overrideId = Number(opts.form.get("assemblyId"));
  const targetAssemblyId = Number.isFinite(overrideId)
    ? overrideId
    : opts.assemblyId;
  const canceledQty = toInt(opts.form.get("canceledQty"));
  const canceledBySizeRaw = String(opts.form.get("canceledBySize") ?? "").trim();
  const reason = String(opts.form.get("cancelReason") ?? "").trim();
  const override =
    String(opts.form.get("override") ?? "").trim().toLowerCase() === "true";
  const cancelMode = String(opts.form.get("cancelMode") ?? "").trim();
  const returnTo = opts.form.get("returnTo");

  const assembly = await prisma.assembly.findFirst({
    where: { id: targetAssemblyId, jobId: opts.jobId },
    select: {
      id: true,
      qtyOrderedBreakdown: true,
    },
  });
  if (!assembly) {
    return redirect(`/jobs/${opts.jobId}`);
  }
  const buildErrorRedirect = (code: string) => {
    const base =
      typeof returnTo === "string" && returnTo.startsWith("/")
        ? returnTo
        : `/jobs/${opts.jobId}`;
    const glue = base.includes("?") ? "&" : "?";
    return `${base}${glue}asmCancelErr=${code}&asmCancelId=${assembly.id}`;
  };

  const orderedBreakdown = Array.isArray(assembly.qtyOrderedBreakdown)
    ? (assembly.qtyOrderedBreakdown as number[])
    : [];
  const orderedTotal = computeOrderedTotal(orderedBreakdown);

  let canceledBySize: number[] = [];
  if (canceledBySizeRaw) {
    try {
      const parsed = JSON.parse(canceledBySizeRaw);
      if (Array.isArray(parsed)) {
        canceledBySize = parsed.map((n) =>
          Number.isFinite(Number(n)) ? Number(n) | 0 : 0
        );
      }
    } catch {}
  }
  if (!canceledBySize.length && canceledQty > 0) {
    let remaining = Math.min(canceledQty, orderedTotal);
    canceledBySize = orderedBreakdown.map(() => 0);
    for (let i = orderedBreakdown.length - 1; i >= 0 && remaining > 0; i--) {
      const maxCancel = Math.max(0, Number(orderedBreakdown[i] || 0));
      const take = Math.min(maxCancel, remaining);
      canceledBySize[i] = take;
      remaining -= take;
    }
  }

  const cancelActivities = await prisma.assemblyActivity.findMany({
    where: { assemblyId: assembly.id },
    select: { stage: true, name: true, qtyBreakdown: true, quantity: true },
  });
  const productionActivities = cancelActivities.filter((act) => {
    const stage = normalizeStage(act.stage as string | null, act.name);
    return ["cut", "sew", "finish", "pack", "qc"].includes(stage);
  });
  if (cancelMode === "full" && productionActivities.length) {
    return redirect(buildErrorRedirect("has_activity"));
  }

  const existingCanceled = sumBreakdownArrays(
    cancelActivities
      .filter(
        (act) =>
          normalizeStage(act.stage as string | null, act.name) === "cancel"
      )
      .map((act) => coerceBreakdown(act.qtyBreakdown as any, act.quantity as any))
  );
  const normalizedCanceled = normalizeBreakdownLength(
    canceledBySize,
    orderedBreakdown.length
  );
  const normalizedExisting = normalizeBreakdownLength(
    existingCanceled,
    orderedBreakdown.length
  );
  const combinedCanceled = normalizedCanceled.map(
    (val, idx) => Number(val || 0) + (Number(normalizedExisting[idx] || 0) || 0)
  );
  const invalid = combinedCanceled.some(
    (val, idx) => val > (Number(orderedBreakdown[idx] ?? 0) || 0)
  );
  if (invalid) {
    return redirect(buildErrorRedirect("qty_invalid"));
  }

  const normalized = computeEffectiveOrderedBreakdown({
    orderedBySize: orderedBreakdown,
    canceledBySize: combinedCanceled,
  });
  const canceledTotal = normalizedCanceled.reduce(
    (total, value) => total + (Number(value) || 0),
    0
  );
  if (canceledTotal > 0 && !reason) {
    return redirect(buildErrorRedirect("reason_required"));
  }
  if (!canceledTotal) {
    return redirect(
      typeof returnTo === "string" && returnTo.startsWith("/")
        ? returnTo
        : `/jobs/${opts.jobId}/assembly/${opts.rawAssemblyIdParam || assembly.id}`
    );
  }

  const pack = Array.isArray((assembly as any).c_qtyPack_Breakdown)
    ? ((assembly as any).c_qtyPack_Breakdown as number[])
    : [];
  const finish = Array.isArray((assembly as any).c_qtyFinish_Breakdown)
    ? ((assembly as any).c_qtyFinish_Breakdown as number[])
    : [];
  const cut = Array.isArray((assembly as any).c_qtyCut_Breakdown)
    ? ((assembly as any).c_qtyCut_Breakdown as number[])
    : [];
  const sew = Array.isArray((assembly as any).c_qtySew_Breakdown)
    ? ((assembly as any).c_qtySew_Breakdown as number[])
    : [];
  const effectiveOrdered = normalized.effective;
  const hardBlock = effectiveOrdered.some(
    (val, idx) =>
      val < (Number(pack[idx] ?? 0) || 0) ||
      val < (Number(finish[idx] ?? 0) || 0)
  );
  if (hardBlock) {
    return redirect(buildErrorRedirect("qty_below_progress"));
  }
  const softBlock = effectiveOrdered.some(
    (val, idx) =>
      val <
      Math.max(
        Number(cut[idx] ?? 0) || 0,
        Number(sew[idx] ?? 0) || 0
      )
  );
  if (softBlock && !override) {
    return redirect(buildErrorRedirect("override_required"));
  }

  await createCancelActivity({
    assemblyId: assembly.id,
    jobId: opts.jobId,
    activityDate: new Date(),
    qtyBreakdown: normalizedCanceled,
    notes: reason || null,
  });

  if (typeof returnTo === "string" && returnTo.startsWith("/")) {
    return redirect(returnTo);
  }
  const raw = opts.rawAssemblyIdParam || String(assembly.id);
  return redirect(`/jobs/${opts.jobId}/assembly/${raw}`);
}
