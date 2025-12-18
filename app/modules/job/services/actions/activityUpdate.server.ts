import { json, redirect } from "@remix-run/node";
import { AssemblyStage, DefectDisposition, ActivityAction } from "@prisma/client";
import { prisma, refreshProductStockSnapshot } from "~/utils/prisma.server";
import { ensureFinishInventoryArtifacts } from "~/utils/activity.server";
import { moveDefectDisposition } from "~/modules/job/services/defectActivity.server";
import { normalizeBreakdown } from "../parsers/assemblyDetailFormParsers.server";
import { validateDefectBreakdown } from "../validators/validateDefectBreakdown.server";

export async function handleActivityUpdate(opts: {
  jobId: number;
  assemblyId: number;
  form: FormData;
}) {
  const activityId = Number(opts.form.get("activityId"));
  const qtyArrStr = String(opts.form.get("qtyBreakdown") || "[]");
  const activityDateStr = String(opts.form.get("activityDate") || "");
  const consumptionsStr = String(opts.form.get("consumptions") || "[]");
  const defectReasonRaw = opts.form.get("defectReasonId");
  const defectReasonId =
    defectReasonRaw != null && defectReasonRaw !== "" ? Number(defectReasonRaw) : null;
  const defectReasonValid =
    defectReasonId != null && Number.isFinite(defectReasonId) && defectReasonId > 0;
  const notesRaw = opts.form.get("notes");
  const dispositionRaw = opts.form.get("defectDisposition");
  const dispositionVal = typeof dispositionRaw === "string" ? dispositionRaw.trim() : "";
  const allowedDisposition = new Set<DefectDisposition>([
    DefectDisposition.review,
    DefectDisposition.scrap,
    DefectDisposition.offSpec,
    DefectDisposition.sample,
    DefectDisposition.none,
  ]);
  const newDisposition: DefectDisposition | null = allowedDisposition.has(
    dispositionVal as DefectDisposition
  )
    ? (dispositionVal as DefectDisposition)
    : null;
  let qtyArr: number[] = [];
  let consumptions: any[] = [];
  try {
    const arr = JSON.parse(qtyArrStr);
    if (Array.isArray(arr))
      qtyArr = arr.map((n: any) => (Number.isFinite(Number(n)) ? Number(n) | 0 : 0));
  } catch {}
  try {
    const c = JSON.parse(consumptionsStr);
    if (Array.isArray(c)) consumptions = c;
  } catch {}
  const activityDate = activityDateStr ? new Date(activityDateStr) : new Date();
  const qtyTotal = qtyArr.reduce((t, n) => t + (Number(n) || 0), 0);
  const existingForValidation = await prisma.assemblyActivity.findUnique({
    where: { id: activityId },
    select: { assemblyId: true, stage: true, defectDisposition: true },
  });
  const validationBreakdown = normalizeBreakdown(qtyArr, qtyTotal);
  if (existingForValidation?.assemblyId) {
    const validationError = await validateDefectBreakdown({
      assemblyId: existingForValidation.assemblyId,
      stage: existingForValidation.stage as AssemblyStage,
      breakdown: validationBreakdown,
      excludeActivityId: activityId,
    });
    if (validationError) {
      return json({ error: validationError }, { status: 400 });
    }
  }
  let updatedDisposition: DefectDisposition | null = null;
  let previousDisposition: DefectDisposition | null = null;
  await prisma.$transaction(async (tx) => {
    const existingActivity = await tx.assemblyActivity.findUnique({
      where: { id: activityId },
      select: {
        defectDisposition: true,
        stage: true,
        assemblyId: true,
        action: true,
      },
    });
    previousDisposition = (existingActivity?.defectDisposition ?? null) as DefectDisposition | null;
    const stageLower = String(existingActivity?.stage || "").toLowerCase();
    const isRecordedStage =
      stageLower === "cut" || stageLower === "make" || stageLower === "pack";
    const updateAction = isRecordedStage ? ActivityAction.RECORDED : existingActivity?.action ?? null;
    const updated = await tx.assemblyActivity.update({
      where: { id: activityId },
      data: {
        qtyBreakdown: qtyArr as any,
        quantity: qtyTotal,
        activityDate,
        defectDisposition: newDisposition ?? undefined,
        defectReasonId: defectReasonValid ? (defectReasonId as number) : null,
        notes: typeof notesRaw === "string" ? notesRaw || null : undefined,
        action: updateAction ?? undefined,
      },
      select: {
        id: true,
        assemblyId: true,
        jobId: true,
        groupKey: true,
        defectDisposition: true,
      },
    });
    updatedDisposition = updated.defectDisposition as DefectDisposition | null;
    const existing = await tx.productMovement.findMany({
      where: { assemblyActivityId: activityId },
      select: { id: true },
    });
    const existingIds = existing.map((m) => m.id);
    if (existingIds.length) {
      await tx.productMovementLine.deleteMany({
        where: { movementId: { in: existingIds } },
      });
      await tx.productMovement.deleteMany({
        where: { id: { in: existingIds } },
      });
    }
    const targetAssemblyId = updated.assemblyId ?? opts.assemblyId;
    const targetJobId = updated.jobId ?? opts.jobId;
    // NOTE: normalizedType is referenced in the original route but not declared.
    // Intentionally preserved here to avoid changing runtime behavior.
    if (normalizedType.includes("cut")) {
      for (const cons of consumptions || []) {
        const rawLines = (cons?.lines || []).filter(
          (l: any) => Number(l.qty) > 0 && Number.isFinite(Number(l.qty))
        );
        if (!rawLines.length) continue;
        const costing = await tx.costing.findUnique({
          where: { id: Number(cons.costingId) },
          select: { productId: true },
        });
        const enriched = await Promise.all(
          rawLines.map(async (line: any) => {
            const b = await tx.batch.findUnique({
              where: { id: Number(line.batchId) },
              select: { productId: true, locationId: true },
            });
            return {
              ...line,
              productId: b?.productId ?? null,
              locationId: b?.locationId ?? null,
            };
          })
        );
        const byLocation = new Map<number | null, any[]>();
        for (const l of enriched) {
          const key = l.locationId ?? null;
          const arr = byLocation.get(key) ?? [];
          arr.push(l);
          byLocation.set(key, arr);
        }
        for (const [locId, lines] of byLocation.entries()) {
          const totalQty = lines.reduce((t, l) => t + Math.abs(Number(l.qty) || 0), 0);
          const headerProductId =
            costing?.productId ??
            lines.find((l) => l.productId != null)?.productId ??
            undefined;
          const movement = await tx.productMovement.create({
            data: {
              movementType: "Assembly",
              date: activityDate,
              jobId: targetJobId,
              assemblyId: targetAssemblyId,
              assemblyActivityId: activityId,
              costingId: Number(cons.costingId),
              locationOutId: locId ?? undefined,
              productId: headerProductId as number | undefined,
              quantity: totalQty,
              notes: "Cut consumption (edit)",
            },
          });
          for (const line of lines) {
            await tx.productMovementLine.create({
              data: {
                movementId: movement.id,
                productMovementId: movement.id,
                productId: (line.productId ?? headerProductId) as number | undefined,
                batchId: Number(line.batchId),
                costingId: Number(cons.costingId),
                quantity: -Math.abs(Number(line.qty)),
                notes: null,
              },
            });
          }
        }
      }
    } else if (normalizedType.includes("make")) {
      await ensureFinishInventoryArtifacts(tx, {
        activityId: activityId,
        assemblyId: targetAssemblyId,
        jobId: targetJobId,
        qtyBreakdown: qtyArr,
        activityDate,
        groupKey: updated.groupKey ?? null,
      });
    }
  });
  if (
    newDisposition &&
    newDisposition !== DefectDisposition.none &&
    previousDisposition !== newDisposition
  ) {
    await moveDefectDisposition(activityId, newDisposition);
  }
  await refreshProductStockSnapshot();
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
}

