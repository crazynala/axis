import { json, redirect } from "@remix-run/node";
import { prisma, refreshProductStockSnapshot } from "~/utils/prisma.server";

export async function handleActivityDelete(opts: {
  jobId: number;
  assemblyId: number;
  form: FormData;
}) {
  const aid = Number(opts.form.get("activityId") ?? opts.form.get("id"));
  if (Number.isFinite(aid)) {
    const activity = await prisma.assemblyActivity.findUnique({
      where: { id: aid },
      select: { id: true, assemblyGroupEventId: true },
    });
    if (activity?.assemblyGroupEventId) {
      return json(
        {
          error:
            "This activity was created by a group event. Delete the group event to remove it.",
        },
        { status: 400 }
      );
    }
    await prisma.$transaction(async (tx) => {
      const movements = await tx.productMovement.findMany({
        where: { assemblyActivityId: aid },
        select: { id: true, shippingLineId: true },
      });
      const movementIds = movements.map((m) => m.id);
      const shipmentLineIds = movements
        .map((m) => Number(m.shippingLineId))
        .filter((id) => Number.isFinite(id));
      if (movementIds.length) {
        await tx.productMovementLine.deleteMany({
          where: { movementId: { in: movementIds } },
        });
        await tx.productMovement.deleteMany({
          where: { id: { in: movementIds } },
        });
      }
      if (shipmentLineIds.length) {
        await tx.boxLine.deleteMany({
          where: { shipmentLineId: { in: shipmentLineIds } },
        });
        await tx.shipmentLine.deleteMany({
          where: { id: { in: shipmentLineIds } },
        });
      }
      await tx.assemblyActivity.delete({ where: { id: aid } });
    });
    await refreshProductStockSnapshot();
  }
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
}

