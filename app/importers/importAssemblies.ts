import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick, parseIntListPreserveGaps, resetSequence } from "./utils";
import {
  mapLegacyAssemblyStatusToHoldAndIntent,
  mapLegacyJobStatusToHold,
  mapLegacyJobStatusToState,
} from "../modules/job/stateUtils";

// Canonical “tight” assembly statuses (string keys) for Axis dashboards.
// These correspond to your assemblyStateKeys in the front-end config.
const CANON = {
  DRAFT: "DRAFT",
  NEW: "NEW",
  CANCELED: "CANCELED",
  PENDING: "PENDING",
  ON_HOLD: "ON_HOLD",
  CUT_PLANNED: "CUT_PLANNED",
  PARTIAL_CUT: "PARTIAL_CUT",
  FULLY_CUT: "FULLY_CUT",
  COMPLETE: "COMPLETE",
} as const;

type CanonState = (typeof CANON)[keyof typeof CANON];

function normalizeFmStatus(s: unknown) {
  return (s ?? "").toString().trim().replace(/\s+/g, " ").toLowerCase();
}

function mapFmAssemblyStatus(statusRaw: unknown): {
  canon: CanonState | null; // null => unknown
  statusNorm: string;
  // optional nuance if you want to store it (you currently have no field)
  blockerHint: "FABRIC" | "INFO" | "DEV_PLANNING" | "OTHER" | null;
} {
  const statusNorm = normalizeFmStatus(statusRaw);
  if (!statusNorm) return { canon: null, statusNorm, blockerHint: null };

  if (statusNorm === "shipped" || statusNorm === "complete")
    return { canon: CANON.COMPLETE, statusNorm, blockerHint: null };

  if (statusNorm === "cut complete")
    return { canon: CANON.FULLY_CUT, statusNorm, blockerHint: null };

  if (statusNorm === "on hold")
    return { canon: CANON.ON_HOLD, statusNorm, blockerHint: null };

  if (statusNorm === "cancelled" || statusNorm === "canceled")
    return { canon: CANON.CANCELED, statusNorm, blockerHint: null };

  if (statusNorm === "not started" || statusNorm === "submitted")
    return { canon: CANON.NEW, statusNorm, blockerHint: null };

  if (statusNorm === "pending info")
    return { canon: CANON.PENDING, statusNorm, blockerHint: "INFO" };

  if (statusNorm === "pending fabric")
    return { canon: CANON.PENDING, statusNorm, blockerHint: "FABRIC" };

  if (
    statusNorm === "dev / planning" ||
    statusNorm === "dev/planning" ||
    statusNorm === "dev planning"
  )
    return { canon: CANON.PENDING, statusNorm, blockerHint: "DEV_PLANNING" };

  return { canon: null, statusNorm, blockerHint: "OTHER" };
}

// Optional: roll up job status from the canonical assembly statuses.
// Uses your jobStateKeys: DRAFT, NEW, CANCELED, PENDING, ON_HOLD, IN_WORK, COMPLETE
function rollupJobStatusFromAssemblies(canonStates: (CanonState | null)[]) {
  const states = canonStates.filter(Boolean) as CanonState[];
  if (states.length === 0) return "DRAFT";

  const allCanceled = states.every((s) => s === CANON.CANCELED);
  if (allCanceled) return "CANCELED";

  const allClosed = states.every(
    (s) => s === CANON.COMPLETE || s === CANON.CANCELED
  );
  if (allClosed) return "COMPLETE";

  // “in work” if any production-ish state
  const anyInWork = states.some((s) =>
    [CANON.CUT_PLANNED, CANON.PARTIAL_CUT, CANON.FULLY_CUT].includes(s)
  );
  if (anyInWork) return "IN_WORK";

  if (states.includes(CANON.ON_HOLD)) return "ON_HOLD";
  if (states.includes(CANON.PENDING)) return "PENDING";
  if (states.includes(CANON.NEW)) return "NEW";

  return "DRAFT";
}

export async function importAssemblies(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  const shipToStats = {
    setFromFm: 0,
    clearedMismatch: 0,
    missingInFm: 0,
    legacyLocationRetained: 0,
  };

  const unknownStatusCounts = new Map<string, number>();

  // Prefetch product names (as you had)
  const productIdSet = new Set<number>();
  for (const row of rows) {
    const pid = asNum(
      pick(row, ["a__ProductCode", "a_ProductCode", "ProductId", "ProductID"])
    ) as number | null;
    if (pid != null) productIdSet.add(pid);
  }

  const productNameById = new Map<number, string | null>();
  if (productIdSet.size) {
    const products = await prisma.product.findMany({
      where: { id: { in: Array.from(productIdSet) } },
      select: { id: true, name: true },
    });
    for (const product of products) {
      productNameById.set(product.id, product.name ?? null);
    }
  }

  // Track per-job canonical statuses so we can roll up job status at the end
  const jobCanonStates = new Map<number, (CanonState | null)[]>();
  const addressOwners = new Map<number, number | null>();
  const addressRows = await prisma.address.findMany({
    select: { id: true, companyId: true },
  });
  for (const row of addressRows) {
    addressOwners.set(row.id, row.companyId ?? null);
  }
  const jobIdSet = new Set<number>();
  for (const row of rows) {
    const jid = asNum(pick(row, ["a_JobNo"])) as number | null;
    if (jid != null) jobIdSet.add(jid);
  }
  const jobCompanyById = new Map<number, number | null>();
  if (jobIdSet.size) {
    const jobs = await prisma.job.findMany({
      where: { id: { in: Array.from(jobIdSet) } },
      select: { id: true, companyId: true },
    });
    for (const job of jobs) {
      jobCompanyById.set(job.id, job.companyId ?? null);
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = asNum(pick(r, ["a__Serial", "id"])) as number | null;
    if (id == null) {
      skipped++;
      continue;
    }

    const qtyOrderedBreakdown = parseIntListPreserveGaps(
      pick(r, [
        "Qty_Ordered_List_c",
        "QtyOrdered_List_c",
        "QtyOrderedList",
        "Qty_Ordered_List",
      ])
    );

    const orderedSum = qtyOrderedBreakdown.reduce(
      (t: number, n: number) => (Number.isFinite(n) ? t + (n | 0) : t),
      0
    );

    const productId = asNum(
      pick(r, ["a__ProductCode", "a_ProductCode", "ProductId", "ProductID"])
    ) as number | null;

    const rawName = (pick(r, ["Name", "AssemblyName", "NameOverride"]) ?? "")
      .toString()
      .trim();

    const notes = pick(r, ["Notes"]);

    const resolvedName = rawName
      ? rawName
      : productId != null
      ? productNameById.get(productId) ?? null
      : null;

    const statusRaw = pick(r, ["Status"]);
    const status = (statusRaw ?? "").toString().trim() || null;
    const hold = mapLegacyAssemblyStatusToHoldAndIntent(status);

    const { canon, statusNorm } = mapFmAssemblyStatus(statusRaw);
    if (statusNorm && !canon) {
      unknownStatusCounts.set(
        statusNorm,
        (unknownStatusCounts.get(statusNorm) ?? 0) + 1
      );
    }

    const jobId = asNum(pick(r, ["a_JobNo"])) as number | null;
    const shipToAddressRaw = asNum(
      pick(r, [
        "a_AddressID|ShipOverride",
        "a_AddressID|ShipToOverride",
        "ShipToAddressOverrideID",
        "ShipToAddressIdOverride",
        "ShipToAddressIDOverride",
        "AddressID|ShipTo|Override",
        "a_ShipToAddressOverrideID",
      ])
    ) as number | null;
    let shipToAddressIdOverride: number | null = null;
    if (shipToAddressRaw == null) {
      shipToStats.missingInFm++;
    } else {
      const jobCompanyId = jobId != null ? jobCompanyById.get(jobId) ?? null : null;
      const ownerCompanyId = addressOwners.get(shipToAddressRaw) ?? null;
      if (jobCompanyId && ownerCompanyId && jobCompanyId === ownerCompanyId) {
        shipToAddressIdOverride = shipToAddressRaw;
        shipToStats.setFromFm++;
      } else {
        shipToStats.clearedMismatch++;
      }
    }

    // Keep both:
    // - status: raw FM
    // - statusWhiteboard: canonical mapped (used for dashboard), falling back to null
    const data: any = {
      id,
      name: resolvedName,
      status: canon,
      statusWhiteboard: notes,
      manualHoldOn: hold.manualHoldOn,
      manualHoldReason: hold.manualHoldReason,
      quantity:
        orderedSum > 0
          ? (orderedSum as any)
          : (asNum(pick(r, ["Quantity"])) as number | null as any),
      qtyOrderedBreakdown: qtyOrderedBreakdown as any,
      jobId,
      productId,
      variantSetId: asNum(pick(r, ["a_VariantSetID"])) as number | null,
      notes: (pick(r, ["Notes"]) ?? "").toString().trim() || null,
      ...(shipToAddressIdOverride != null
        ? { shipToAddressIdOverride, shipToLocationIdOverride: null }
        : {}),
    };

    try {
      // Correct created vs updated count
      const existed = await prisma.assembly.findUnique({
        where: { id },
        select: { id: true, shipToLocationIdOverride: true },
      });

      await prisma.assembly.upsert({
        where: { id },
        create: data,
        update: data,
      });

      if (existed) updated++;
      else created++;
      if (
        shipToAddressIdOverride == null &&
        existed?.shipToLocationIdOverride != null
      ) {
        shipToStats.legacyLocationRetained++;
      }

      if (jobId != null) {
        if (!jobCanonStates.has(jobId)) jobCanonStates.set(jobId, []);
        jobCanonStates.get(jobId)!.push(canon);
      }
    } catch (e: any) {
      errors.push({ index: i, id, message: e?.message, code: e?.code });
    }
  }

  // Roll up job canonical status into Job.status.
  // Set Job.statusWhiteboard only if there is extra nuance worth surfacing.
  for (const [jobId, canonStates] of jobCanonStates.entries()) {
    const jobCanon = rollupJobStatusFromAssemblies(canonStates);
    const jobState = mapLegacyJobStatusToState(jobCanon);
    const jobHold = mapLegacyJobStatusToHold(jobCanon);

    // Optional nuance: if any assembly in the job is blocked, summarize why.
    // This uses the RAW FM status captured in Assembly.status.
    const assemblies = await prisma.assembly.findMany({
      where: { jobId },
      select: { status: true },
    });

    const norm = (s: string | null) =>
      (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

    let whiteboard: string | null = null;

    const hasPendingFabric = assemblies.some(
      (a) => norm(a.status) === "pending fabric"
    );
    const hasPendingInfo = assemblies.some(
      (a) => norm(a.status) === "pending info"
    );
    const hasDevPlanning = assemblies.some((a) =>
      ["dev / planning", "dev/planning", "dev planning"].includes(
        norm(a.status)
      )
    );

    // Only add nuance if it adds information beyond the canonical status
    if (jobCanon === "PENDING") {
      const bits: string[] = [];
      if (hasPendingFabric) bits.push("Pending Fabric");
      if (hasPendingInfo) bits.push("Pending Info");
      if (hasDevPlanning) bits.push("Dev/Planning");
      if (bits.length) whiteboard = bits.join(" · ");
    }

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: jobCanon,
        statusWhiteboard: whiteboard,
        state: jobState,
        jobHoldOn: jobHold.jobHoldOn,
        jobHoldReason: jobHold.jobHoldReason,
      },
    });
  }

  if (unknownStatusCounts.size) {
    const top = [...unknownStatusCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
    console.log("[import] assemblies: unknown FM statuses (top)", top);
  }

  console.log("[import] assemblies ship-to summary", shipToStats);

  if (errors.length) {
    const grouped: Record<
      string,
      { key: string; count: number; samples: (number | null)[] }
    > = {};
    for (const e of errors) {
      const key = e.code || "error";
      if (!grouped[key]) grouped[key] = { key, count: 0, samples: [] };
      grouped[key].count++;
      if (grouped[key].samples.length < 5)
        grouped[key].samples.push(e.id ?? null);
    }
    console.log("[import] assemblies error summary", Object.values(grouped));
  }

  await resetSequence(prisma, "Assembly");
  return { created, updated, skipped, errors };
}
