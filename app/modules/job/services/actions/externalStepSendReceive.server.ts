import { json } from "@remix-run/node";
import { ActivityAction, ActivityKind, AssemblyStage, ExternalStepType } from "@prisma/client";
import { prisma } from "~/utils/prisma.server";
import { parseExternalQtyBreakdown } from "../parsers/assemblyDetailFormParsers.server";

export async function handleExternalStepSendReceive(opts: {
  jobId: number;
  assemblyId: number;
  intent: "externalStep.send" | "externalStep.receive";
  form: FormData;
}) {
  const targetAssemblyId = Number(opts.form.get("assemblyId") ?? opts.assemblyId);
  if (!Number.isFinite(targetAssemblyId)) {
    return json({ ok: false, error: "invalid_assembly" }, { status: 400 });
  }
  const externalStepTypeRaw = String(opts.form.get("externalStepType") || "");
  const externalStepType = Object.values(ExternalStepType).includes(
    externalStepTypeRaw as ExternalStepType
  )
    ? (externalStepTypeRaw as ExternalStepType)
    : null;
  if (!externalStepType) {
    return json({ ok: false, error: "missing_step_type" }, { status: 400 });
  }
  const qtyBreakdown = parseExternalQtyBreakdown(opts.form.get("qtyBreakdown"));
  const qty = qtyBreakdown.reduce((sum, value) => sum + value, 0);
  if (!qtyBreakdown.length || qty <= 0) {
    return json({ ok: false, error: "invalid_qty_breakdown" }, { status: 400 });
  }
  const activityDateRaw = String(opts.form.get("activityDate") || "");
  const activityDate = activityDateRaw ? new Date(activityDateRaw) : new Date();
  const vendorCompanyIdRaw = Number(opts.form.get("vendorCompanyId") ?? NaN);
  const vendorCompanyId = Number.isFinite(vendorCompanyIdRaw) ? vendorCompanyIdRaw : null;
  const vendorUnknown = String(opts.form.get("vendorUnknown") || "") === "1";
  if (!vendorCompanyId && !vendorUnknown) {
    return json({ ok: false, error: "vendor_required" }, { status: 400 });
  }
  const targetAssembly = await prisma.assembly.findFirst({
    where: { id: targetAssemblyId, jobId: opts.jobId },
    select: { id: true, jobId: true },
  });
  if (!targetAssembly) {
    return json({ ok: false, error: "missing_assembly" }, { status: 404 });
  }
  const action =
    opts.intent === "externalStep.send"
      ? ActivityAction.SENT_OUT
      : ActivityAction.RECEIVED_IN;
  await prisma.assemblyActivity.create({
    data: {
      assemblyId: targetAssemblyId,
      jobId: targetAssembly.jobId ?? opts.jobId,
      stage: AssemblyStage.other,
      kind: ActivityKind.normal,
      action,
      name: externalStepType,
      externalStepType,
      vendorCompanyId: vendorCompanyId ?? undefined,
      activityDate,
      quantity: qty,
      qtyBreakdown,
      notes: vendorUnknown ? "Unknown vendor selected" : null,
    },
  });
  return json({ ok: true });
}
