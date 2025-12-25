import { json, redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { syncJobStateFromAssemblies } from "~/modules/job/services/JobStateService";
import { normalizeAssemblyState } from "~/modules/job/stateUtils";
import {
  loadDefaultInternalTargetLeadDays,
  loadDefaultInternalTargetBufferDays,
  loadDefaultDropDeadEscalationBufferDays,
  resolveAssemblyTargets,
} from "~/modules/job/services/targetOverrides.server";
import { assertAddressOwnedByCompany } from "~/utils/addressOwnership.server";

const HOLD_TYPES = new Set(["CLIENT", "INTERNAL"]);

export async function handleAssemblyUpdate(opts: {
  jobId: number;
  rawAssemblyIdParam: string;
  fallbackAssemblyId: number;
  form: FormData;
}) {
  const overrideId = Number(opts.form.get("assemblyId"));
  const targetAssemblyId = Number.isFinite(overrideId) ? overrideId : opts.fallbackAssemblyId;
  const data: any = {};
  const parseDate = (value: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  };
  if (opts.form.has("name")) {
    data.name = ((opts.form.get("name") as string) || "").trim() || null;
  }
  let statusChanged = false;
  if (opts.form.has("assemblyType")) {
    const typeVal = String(opts.form.get("assemblyType") ?? "").trim();
    data.assemblyType = typeVal || "Prod";
  }
  if (opts.form.has("status")) {
    const statusVal = normalizeAssemblyState(String(opts.form.get("status") ?? "").trim());
    data.status = statusVal || null;
    statusChanged = true;
  }
  if (opts.form.has("statusWhiteboard")) {
    const noteVal = String(opts.form.get("statusWhiteboard") ?? "");
    data.statusWhiteboard = noteVal || null;
  }
  let manualHoldOn: boolean | null = null;
  if (opts.form.has("manualHoldOn")) {
    const raw = String(opts.form.get("manualHoldOn") ?? "").trim().toLowerCase();
    manualHoldOn = raw === "true" || raw === "1" || raw === "on";
    data.manualHoldOn = manualHoldOn;
    if (!manualHoldOn) {
      data.manualHoldReason = null;
      data.manualHoldType = null;
    }
  }
  if (opts.form.has("manualHoldReason")) {
    const reason = String(opts.form.get("manualHoldReason") ?? "").trim();
    if (reason || manualHoldOn) {
      data.manualHoldReason = reason || null;
    }
  }
  if (opts.form.has("manualHoldType")) {
    const rawType = String(opts.form.get("manualHoldType") ?? "").trim().toUpperCase();
    data.manualHoldType = HOLD_TYPES.has(rawType) ? rawType : null;
  }
  const hasOverrideFields =
    opts.form.has("internalTargetDateOverride") ||
    opts.form.has("customerTargetDateOverride") ||
    opts.form.has("dropDeadDateOverride") ||
    opts.form.has("shipToLocationIdOverride") ||
    opts.form.has("shipToAddressIdOverride");
  if (hasOverrideFields) {
    const assembly = await prisma.assembly.findUnique({
      where: { id: targetAssemblyId },
      include: {
        job: {
          select: {
            createdAt: true,
            internalTargetDate: true,
            customerTargetDate: true,
            dropDeadDate: true,
            shipToLocation: { select: { id: true, name: true } },
          },
        },
        shipToLocationOverride: { select: { id: true, name: true } },
      },
    });
    if (!assembly) {
      return redirect(`/jobs/${opts.jobId}/assembly/${opts.rawAssemblyIdParam}`);
    }
    const nextInternal =
      opts.form.has("internalTargetDateOverride")
        ? parseDate(String(opts.form.get("internalTargetDateOverride") ?? ""))
        : assembly.internalTargetDateOverride ?? null;
    const nextCustomer =
      opts.form.has("customerTargetDateOverride")
        ? parseDate(String(opts.form.get("customerTargetDateOverride") ?? ""))
        : assembly.customerTargetDateOverride ?? null;
    const nextDropDead =
      opts.form.has("dropDeadDateOverride")
        ? parseDate(String(opts.form.get("dropDeadDateOverride") ?? ""))
        : assembly.dropDeadDateOverride ?? null;
    const rawShipTo = opts.form.has("shipToLocationIdOverride")
      ? String(opts.form.get("shipToLocationIdOverride") ?? "")
      : null;
    const shipToOverrideId =
      rawShipTo === null
        ? assembly.shipToLocationIdOverride
        : rawShipTo === ""
          ? null
          : Number(rawShipTo);
    const rawShipToAddress = opts.form.has("shipToAddressIdOverride")
      ? String(opts.form.get("shipToAddressIdOverride") ?? "")
      : null;
    const shipToAddressOverrideId =
      rawShipToAddress === null
        ? assembly.shipToAddressIdOverride
        : rawShipToAddress === ""
          ? null
          : Number(rawShipToAddress);
    if (rawShipToAddress != null && rawShipToAddress !== "") {
      const jobCompanyId = assembly.job?.companyId ?? null;
      const owned =
        jobCompanyId != null && shipToAddressOverrideId != null
          ? await assertAddressOwnedByCompany(
              Number(shipToAddressOverrideId),
              jobCompanyId
            )
          : false;
      if (!owned) {
        return json(
          { error: "Ship-to address must belong to the job's company." },
          { status: 400 }
        );
      }
    }
    const [defaultLeadDays, bufferDays, escalationBufferDays] = await Promise.all([
      loadDefaultInternalTargetLeadDays(prisma),
      loadDefaultInternalTargetBufferDays(prisma),
      loadDefaultDropDeadEscalationBufferDays(prisma),
    ]);
    const resolved = resolveAssemblyTargets({
      job: {
        createdAt: assembly.job?.createdAt ?? null,
        customerOrderDate: assembly.job?.customerOrderDate ?? null,
        internalTargetDate: assembly.job?.internalTargetDate ?? null,
        customerTargetDate: assembly.job?.customerTargetDate ?? null,
        dropDeadDate: assembly.job?.dropDeadDate ?? null,
        shipToLocation: assembly.job?.shipToLocation ?? null,
        shipToAddress: assembly.job?.shipToAddress ?? null,
      },
      assembly: {
        internalTargetDateOverride: nextInternal,
        customerTargetDateOverride: nextCustomer,
        dropDeadDateOverride: nextDropDead,
        shipToLocationOverride:
          shipToOverrideId != null
            ? { id: shipToOverrideId, name: null }
            : null,
        shipToAddressOverride:
          shipToAddressOverrideId != null
            ? { id: shipToAddressOverrideId, name: null }
            : null,
      },
      defaultLeadDays,
      bufferDays,
      escalationBufferDays,
    });
    if (opts.form.has("internalTargetDateOverride")) {
      data.internalTargetDateOverride =
        nextInternal && resolved.internalWasClamped
          ? resolved.internal.value
          : nextInternal;
    }
    if (opts.form.has("customerTargetDateOverride")) {
      data.customerTargetDateOverride = nextCustomer;
    }
    if (opts.form.has("dropDeadDateOverride")) {
      data.dropDeadDateOverride = nextDropDead;
    }
    if (opts.form.has("shipToLocationIdOverride")) {
      if (rawShipTo === "") data.shipToLocationOverride = { disconnect: true };
      else if (Number.isFinite(shipToOverrideId)) {
        data.shipToLocationOverride = { connect: { id: shipToOverrideId } };
      }
    }
    if (opts.form.has("shipToAddressIdOverride")) {
      if (rawShipToAddress === "") data.shipToAddressOverride = { disconnect: true };
      else if (Number.isFinite(shipToAddressOverrideId)) {
        data.shipToAddressOverride = {
          connect: { id: shipToAddressOverrideId },
        };
      }
    }
  }
  if (manualHoldOn) {
    const reason = String(opts.form.get("manualHoldReason") ?? "").trim();
    if (!reason) {
      const returnTo = opts.form.get("returnTo");
      if (typeof returnTo === "string" && returnTo.startsWith("/")) {
        const glue = returnTo.includes("?") ? "&" : "?";
        return redirect(`${returnTo}${glue}asmHoldErr=reason_required`);
      }
      return redirect(
        `/jobs/${opts.jobId}/assembly/${opts.rawAssemblyIdParam}?asmHoldErr=reason_required`
      );
    }
  }
  if (Object.keys(data).length) {
    await prisma.assembly.update({ where: { id: targetAssemblyId }, data });
    if (statusChanged) {
      await syncJobStateFromAssemblies(prisma, opts.jobId);
    }
  }
  const returnTo = opts.form.get("returnTo");
  if (typeof returnTo === "string" && returnTo.startsWith("/")) {
    return redirect(returnTo);
  }
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.rawAssemblyIdParam}`);
}
