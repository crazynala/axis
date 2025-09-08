import { prisma } from "./prisma.server";

type CutConsumptionLine = {
  batchId: number;
  qty: number; // positive number entered by user; server will store as negative for consumption
  notes?: string | null;
};

type CutConsumption = {
  costingId: number;
  lines: CutConsumptionLine[];
};

export async function createCutActivity(options: {
  assemblyId: number;
  jobId: number;
  activityDate: Date;
  qtyBreakdown: number[];
  notes?: string | null;
  consumptions: CutConsumption[];
}) {
  const { assemblyId, jobId, activityDate, qtyBreakdown, notes, consumptions } =
    options;
  const totalCut = (qtyBreakdown || []).reduce(
    (t, n) => (Number.isFinite(n) ? t + (n as number) : t),
    0
  );
  console.log("[activity] createCutActivity begin", {
    assemblyId,
    jobId,
    activityDate: activityDate?.toISOString?.() || activityDate,
    totalCut,
    lines: (consumptions || []).reduce(
      (t, c) => t + (c?.lines?.length || 0),
      0
    ),
  });

  return await prisma.$transaction(async (tx) => {
    // Create the assembly activity first
    const activity = await tx.assemblyActivity.create({
      data: {
        assemblyId,
        jobId,
        name: "Cut",
        activityType: "cut",
        activityDate,
        endTime: activityDate,
        qtyBreakdown: qtyBreakdown as any,
        quantity: totalCut,
        notes: notes ?? null,
      },
    });

    // For each costing selection, create ProductMovements grouped by batch location
    for (const cons of consumptions || []) {
      const rawLines = (cons?.lines || []).filter(
        (l) => Number(l.qty) > 0 && Number.isFinite(Number(l.qty))
      );
      if (!rawLines.length) continue;

      // Fetch costing to determine the component productId for the header
      const costing = await tx.costing.findUnique({
        where: { id: cons.costingId },
        select: { componentId: true },
      });

      // Enrich lines with batch product/location and group by locationId
      type Enriched = CutConsumptionLine & {
        productId: number | null;
        locationId: number | null;
      };
      const enriched: Enriched[] = [];
      for (const line of rawLines) {
        const b = await tx.batch.findUnique({
          where: { id: line.batchId },
          select: { productId: true, locationId: true },
        });
        enriched.push({
          ...line,
          productId: b?.productId ?? null,
          locationId: b?.locationId ?? null,
        });
      }

      const byLocation = new Map<number | null, Enriched[]>();
      for (const l of enriched) {
        const key = l.locationId ?? null;
        const arr = byLocation.get(key) ?? [];
        arr.push(l);
        byLocation.set(key, arr);
      }

      for (const [locId, lines] of byLocation.entries()) {
        const totalQty = lines.reduce(
          (t, l) => t + Math.abs(Number(l.qty) || 0),
          0
        );
        // Prefer costing.componentId; fallback to first line's productId
        const headerProductId =
          costing?.componentId ??
          lines.find((l) => l.productId != null)?.productId ??
          undefined;
        const movement = await tx.productMovement.create({
          data: {
            movementType: "Assembly",
            date: activityDate,
            jobId,
            assemblyId,
            assemblyActivityId: activity.id,
            costingId: cons.costingId,
            locationOutId: locId ?? undefined,
            productId: headerProductId as number | undefined,
            quantity: totalQty,
            notes: "Cut consumption",
          },
        });
        for (const line of lines) {
          await tx.productMovementLine.create({
            data: {
              movementId: movement.id,
              productMovementId: movement.id,
              productId: (line.productId ?? headerProductId) as
                | number
                | undefined,
              batchId: line.batchId,
              costingId: cons.costingId,
              quantity: -Math.abs(Number(line.qty)),
              notes: line.notes ?? null,
            },
          });
        }
      }
    }

    return activity;
  });
}
