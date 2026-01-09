import {
  ActivityAction,
  ActivityKind,
  AssemblyStage,
  DefectDisposition,
} from "@prisma/client";
import { prisma } from "~/utils/prisma.server";

function normalizeBreakdown(values: number[] | undefined | null): number[] {
  if (!Array.isArray(values)) return [];
  return values.map((n) => {
    const value = Number(n);
    return Number.isFinite(value) ? value | 0 : 0;
  });
}

function mergeBreakdowns(existing: number[], incoming: number[]): number[] {
  const len = Math.max(existing.length, incoming.length);
  const merged = Array.from({ length: len }, (_, idx) => {
    const prev = Number(existing[idx] ?? 0) || 0;
    const next = Number(incoming[idx] ?? 0) || 0;
    return prev + next;
  });
  return merged;
}

function sumBreakdown(values: number[]): number {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

type BoxLineClient = {
  boxLine: {
    findFirst: (...args: any[]) => Promise<any>;
    update: (...args: any[]) => Promise<any>;
    create: (...args: any[]) => Promise<any>;
  };
};

export async function upsertBoxLine(
  tx: BoxLineClient,
  args: {
    boxId: number;
    jobId: number;
    assemblyId: number;
    productId: number;
    qtyBreakdown: number[];
    batchId?: number | null;
    notes?: string | null;
  }
) {
  const normalizedBreakdown = normalizeBreakdown(args.qtyBreakdown);
  const quantity = sumBreakdown(normalizedBreakdown);
  if (quantity <= 0) {
    throw new Error("Quantity must be greater than zero to create a box line.");
  }

  const targetBatchId = args.batchId ?? null;
  const existing = await tx.boxLine.findFirst({
    where: {
      boxId: args.boxId,
      assemblyId: args.assemblyId,
      productId: args.productId,
      batchId: targetBatchId,
    },
  });

  if (existing) {
    const mergedBreakdown = mergeBreakdowns(
      normalizeBreakdown(existing.qtyBreakdown as number[]),
      normalizedBreakdown
    );
    const mergedQuantity = sumBreakdown(mergedBreakdown);
    return tx.boxLine.update({
      where: { id: existing.id },
      data: {
        qtyBreakdown: mergedBreakdown as any,
        quantity: mergedQuantity,
        notes: args.notes ?? existing.notes ?? null,
      },
    });
  }

  return tx.boxLine.create({
    data: {
      boxId: args.boxId,
      jobId: args.jobId,
      assemblyId: args.assemblyId,
      productId: args.productId,
      batchId: targetBatchId,
      qtyBreakdown: normalizedBreakdown as any,
      quantity,
      notes: args.notes ?? null,
    },
  });
}

type PackActivityInput = {
  assemblyId: number;
  jobId: number;
  qtyBreakdown: number[];
  activityDate: Date;
  boxMode: "existing" | "new";
  existingBoxId?: number | null;
  warehouseNumber?: number | null;
  boxDescription?: string | null;
  boxNotes?: string | null;
  allowOverpack?: boolean;
  createShortfall?: boolean;
};

function buildAvailableForPack(
  finish: number[],
  packed: number[],
  desiredLength: number
): number[] {
  const len = Math.max(finish.length, packed.length, desiredLength);
  return Array.from({ length: len }, (_, idx) => {
    const finished = Number(finish[idx] ?? 0) || 0;
    const alreadyPacked = Number(packed[idx] ?? 0) || 0;
    return Math.max(0, finished - alreadyPacked);
  });
}

export async function createPackActivity(input: PackActivityInput) {
  const normalizedBreakdown = normalizeBreakdown(input.qtyBreakdown);
  const totalQuantity = sumBreakdown(normalizedBreakdown);
  if (totalQuantity <= 0) {
    throw new Error("Pack quantity must be greater than zero.");
  }

  const assembly = await prisma.assembly.findFirst({
    where: { id: input.assemblyId, jobId: input.jobId },
    include: {
      job: {
        select: {
          id: true,
          companyId: true,
          stockLocationId: true,
        },
      },
    },
  });
  if (!assembly) {
    throw new Error("Assembly not found for this job.");
  }
  if (!assembly.productId) {
    throw new Error("Assign a product to the assembly before recording pack.");
  }

  const jobCompanyId = assembly.job?.companyId ?? null;
  const jobLocationId = assembly.job?.stockLocationId ?? null;
  const currentFinish = normalizeBreakdown(
    (assembly as any).c_qtyFinish_Breakdown
  );
  const boxLines = await prisma.boxLine.findMany({
    where: { assemblyId: assembly.id, packingOnly: { not: true } },
    select: { qtyBreakdown: true, quantity: true },
  });
  const currentPack = boxLines.reduce((acc: number[], line) => {
    const raw =
      Array.isArray(line.qtyBreakdown) && line.qtyBreakdown.length
        ? (line.qtyBreakdown as number[])
        : line.quantity != null
        ? [Number(line.quantity) || 0]
        : [];
    return mergeBreakdowns(acc, normalizeBreakdown(raw));
  }, []);
  const available = buildAvailableForPack(
    currentFinish,
    currentPack,
    normalizedBreakdown.length
  );
  console.log("Current Finish", currentFinish);
  console.log("Current Pack", currentPack);
  console.log("Available", available);
  console.log("Normalized Breakdown", normalizedBreakdown);
  const exceedsAvailable = normalizedBreakdown.some(
    (qty, idx) => qty > (available[idx] ?? 0)
  );
  if (exceedsAvailable && !input.allowOverpack) {
    throw new Error("Cannot pack more units than are available.");
  }

  const trimmedDescription = input.boxDescription?.trim();
  const trimmedNotes = input.boxNotes?.trim();
  if (exceedsAvailable && input.allowOverpack && !trimmedNotes) {
    throw new Error("Add a note to override ready-to-pack limits.");
  }
  const fallbackDescription =
    trimmedDescription && trimmedDescription.length
      ? trimmedDescription
      : assembly.name || `Assembly ${assembly.id}`;

  return prisma.$transaction(async (tx) => {
    let boxId: number;
    if (input.boxMode === "existing") {
      const existingBoxId = Number(input.existingBoxId);
      if (!Number.isFinite(existingBoxId)) {
        throw new Error("Select an open box to continue.");
      }
      const box = await tx.box.findUnique({ where: { id: existingBoxId } });
      if (!box) {
        throw new Error("Selected box could not be found.");
      }
      if (box.state !== "open") {
        throw new Error("Selected box is not open.");
      }
      if (jobCompanyId && box.companyId && box.companyId !== jobCompanyId) {
        throw new Error("Selected box belongs to a different company.");
      }
      if (jobLocationId && box.locationId && box.locationId !== jobLocationId) {
        throw new Error("Selected box is stored at a different location.");
      }
      boxId = box.id;
    } else {
      if (!jobCompanyId || !jobLocationId) {
        throw new Error(
          "Set a company and stock location on the job before creating a box."
        );
      }
      const warehouseNumber =
        input.warehouseNumber != null && Number.isFinite(input.warehouseNumber)
          ? Number(input.warehouseNumber)
          : null;
      const box = await tx.box.create({
        data: {
          companyId: jobCompanyId,
          locationId: jobLocationId,
          warehouseNumber: warehouseNumber ?? undefined,
          description: fallbackDescription,
          notes: trimmedNotes ?? undefined,
          state: "open",
        },
      });
      boxId = box.id;
    }

    await upsertBoxLine(tx, {
      boxId,
      jobId: assembly.jobId ?? input.jobId,
      assemblyId: assembly.id,
      productId: assembly.productId,
      qtyBreakdown: normalizedBreakdown,
      notes: trimmedNotes ?? null,
    });

    if (input.createShortfall && !exceedsAvailable) {
      const shortfallBreakdown = available.map((qty, idx) =>
        Math.max(0, (Number(qty) || 0) - (normalizedBreakdown[idx] ?? 0))
      );
      const shortfallTotal = sumBreakdown(shortfallBreakdown);
      if (shortfallTotal > 0) {
        await tx.assemblyActivity.create({
          data: {
            assemblyId: assembly.id,
            jobId: assembly.jobId ?? input.jobId,
            stage: AssemblyStage.pack,
            kind: ActivityKind.defect,
            action: ActivityAction.LOSS_RECONCILED,
            name: "Shortfall",
            defectDisposition: DefectDisposition.none,
            quantity: shortfallTotal,
            qtyBreakdown: shortfallBreakdown as any,
            activityDate: input.activityDate,
            notes: "Implied shortfall (unpacked units)",
            productId: assembly.productId ?? undefined,
          },
        });
      }
    }
    return { ok: true };
  });
}
