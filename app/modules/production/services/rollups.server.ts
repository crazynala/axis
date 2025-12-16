import {
  ActivityAction,
  ActivityKind,
  AssemblyStage,
  Prisma,
} from "@prisma/client";
import { prisma } from "~/utils/prisma.server";

export type AssemblyRollup = {
  assemblyId: number;
  cutGoodQty: number;
  sewGoodQty: number;
  finishGoodQty: number;
  finishNetQty: number;
  packedQty: number;
  packDefectQty: number;
  readyToPackQty: number;
  qtySentOutNotReceived: number;
  sewnAvailableQty: number;
  sewnAvailableLowConfidence: boolean;
};

type NumberLike = number | string | Prisma.Decimal | null | undefined;

export async function loadAssemblyRollups(
  assemblyIds: number[]
): Promise<Map<number, AssemblyRollup>> {
  if (!assemblyIds.length) return new Map();

  const idSet = new Set(assemblyIds);
  const [
    stageSums,
    packDefects,
    packedSums,
    sentOutSums,
    receivedInSums,
  ] = await Promise.all([
    prisma.assemblyActivity.groupBy({
      by: ["assemblyId", "stage"],
      where: {
        assemblyId: { in: assemblyIds },
        action: ActivityAction.RECORDED,
        kind: ActivityKind.normal,
        stage: {
          in: [AssemblyStage.cut, AssemblyStage.sew, AssemblyStage.finish],
        },
      },
      _sum: { quantity: true },
    }),
    prisma.assemblyActivity.groupBy({
      by: ["assemblyId"],
      where: {
        assemblyId: { in: assemblyIds },
        action: ActivityAction.RECORDED,
        kind: ActivityKind.defect,
        stage: { in: [AssemblyStage.pack, AssemblyStage.qc] },
      },
      _sum: { quantity: true },
    }),
    prisma.boxLine.groupBy({
      by: ["assemblyId"],
      where: {
        assemblyId: { in: assemblyIds },
        packingOnly: { not: true },
      },
      _sum: { quantity: true },
    }),
    prisma.assemblyActivity.groupBy({
      by: ["assemblyId"],
      where: {
        assemblyId: { in: assemblyIds },
        action: ActivityAction.SENT_OUT,
      },
      _sum: { quantity: true },
    }),
    prisma.assemblyActivity.groupBy({
      by: ["assemblyId"],
      where: {
        assemblyId: { in: assemblyIds },
        action: ActivityAction.RECEIVED_IN,
      },
      _sum: { quantity: true },
    }),
  ]);

  const rollups = new Map<number, AssemblyRollup>();
  const ensure = (assemblyId: number) => {
    if (!rollups.has(assemblyId)) {
      rollups.set(assemblyId, {
        assemblyId,
        cutGoodQty: 0,
        sewGoodQty: 0,
        finishGoodQty: 0,
        finishNetQty: 0,
        packedQty: 0,
        packDefectQty: 0,
        readyToPackQty: 0,
        qtySentOutNotReceived: 0,
        sewnAvailableQty: 0,
        sewnAvailableLowConfidence: false,
      });
    }
    return rollups.get(assemblyId)!;
  };

  stageSums.forEach((row) => {
    if (!row.assemblyId || !idSet.has(row.assemblyId)) return;
    const roll = ensure(row.assemblyId);
    const value = toNumber(row._sum.quantity);
    if (row.stage === AssemblyStage.cut) roll.cutGoodQty = value;
    else if (row.stage === AssemblyStage.sew) roll.sewGoodQty = value;
    else if (row.stage === AssemblyStage.finish) roll.finishGoodQty = value;
  });

  packDefects.forEach((row) => {
    if (!row.assemblyId || !idSet.has(row.assemblyId)) return;
    const roll = ensure(row.assemblyId);
    roll.packDefectQty = Math.abs(toNumber(row._sum.quantity));
  });

  packedSums.forEach((row) => {
    if (!row.assemblyId || !idSet.has(row.assemblyId)) return;
    const roll = ensure(row.assemblyId);
    roll.packedQty = toNumber(row._sum.quantity);
  });

  const sentTotals = new Map<number, number>();
  sentOutSums.forEach((row) => {
    if (!row.assemblyId || !idSet.has(row.assemblyId)) return;
    sentTotals.set(row.assemblyId, toNumber(row._sum.quantity));
  });
  const receivedTotals = new Map<number, number>();
  receivedInSums.forEach((row) => {
    if (!row.assemblyId || !idSet.has(row.assemblyId)) return;
    receivedTotals.set(row.assemblyId, toNumber(row._sum.quantity));
  });

  assemblyIds.forEach((id) => {
    const roll = ensure(id);
    roll.packDefectQty = Math.max(roll.packDefectQty, 0);
    roll.finishNetQty = Math.max(roll.finishGoodQty - roll.packDefectQty, 0);
    roll.readyToPackQty = Math.max(roll.finishNetQty - roll.packedQty, 0);

    const sent = sentTotals.get(id) ?? 0;
    const received = receivedTotals.get(id) ?? 0;
    roll.qtySentOutNotReceived = Math.max(sent - received, 0);

    const baseSewn =
      roll.sewGoodQty > 0
        ? roll.sewGoodQty
        : roll.finishGoodQty > 0
        ? roll.finishGoodQty
        : 0;
    const lowConfidence = roll.sewGoodQty <= 0 && roll.finishGoodQty > 0;
    roll.sewnAvailableLowConfidence = lowConfidence;
    roll.sewnAvailableQty = Math.max(baseSewn - roll.qtySentOutNotReceived, 0);
  });

  return rollups;
}

function toNumber(value: NumberLike): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
