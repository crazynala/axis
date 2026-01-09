import { AssemblyStage, ActivityKind } from "@prisma/client";
import { prisma } from "~/utils/prisma.server";
import { normalizeBreakdown, sumInto } from "../parsers/assemblyDetailFormParsers.server";

export async function validateDefectBreakdown(opts: {
  assemblyId: number;
  stage: AssemblyStage;
  breakdown: number[];
  excludeActivityId?: number | null;
}) {
  if (!opts.breakdown.length) return null;
  const acts = await prisma.assemblyActivity.findMany({
    where: {
      assemblyId: opts.assemblyId,
      stage: {
        in: [
          AssemblyStage.cut,
          AssemblyStage.sew,
          AssemblyStage.finish,
          AssemblyStage.pack,
        ],
      },
    },
    select: {
      id: true,
      stage: true,
      kind: true,
      qtyBreakdown: true,
      quantity: true,
    },
  });
  const cutArr: number[] = [];
  const sewArr: number[] = [];
  const finishArr: number[] = [];
  const packArr: number[] = [];
  const cutDefArr: number[] = [];
  const sewDefArr: number[] = [];
  const finishDefArr: number[] = [];
  const apply = (target: number[], act: any, sign = 1) => {
    const arr = normalizeBreakdown(
      Array.isArray(act?.qtyBreakdown) ? (act.qtyBreakdown as number[]) : [],
      Number(act?.quantity ?? 0) || 0
    );
    sumInto(target, arr, sign);
  };
  acts.forEach((act) => {
    if (opts.excludeActivityId && act.id === opts.excludeActivityId) return;
    if (act.stage === AssemblyStage.cut) {
      if (act.kind === ActivityKind.defect) apply(cutDefArr, act, 1);
      else apply(cutArr, act, 1);
    }
    if (act.stage === AssemblyStage.sew) {
      if (act.kind === ActivityKind.defect) apply(sewDefArr, act, 1);
      else apply(sewArr, act, 1);
    }
    if (act.stage === AssemblyStage.finish) {
      if (act.kind === ActivityKind.defect) apply(finishDefArr, act, 1);
      else apply(finishArr, act, 1);
    }
    if (act.stage === AssemblyStage.pack) {
      apply(packArr, act, 1);
    }
  });
  const availableCut: number[] = [];
  const availableSew: number[] = [];
  const availableFinish: number[] = [];
  const len = Math.max(
    cutArr.length,
    cutDefArr.length,
    sewArr.length,
    sewDefArr.length,
    finishArr.length,
    finishDefArr.length,
    packArr.length,
    opts.breakdown.length
  );
  for (let i = 0; i < len; i++) {
    const cut = Number(cutArr[i] ?? 0) || 0;
    const cutDef = Number(cutDefArr[i] ?? 0) || 0;
    const sew = Number(sewArr[i] ?? 0) || 0;
    const sewDef = Number(sewDefArr[i] ?? 0) || 0;
    const finish = Number(finishArr[i] ?? 0) || 0;
    const finishDef = Number(finishDefArr[i] ?? 0) || 0;
    availableCut[i] = cut - cutDef - sew;
    availableSew[i] = sew - sewDef - finish;
    const pack = Number(packArr[i] ?? 0) || 0;
    availableFinish[i] = finish - finishDef - pack;
  }
  const errs: string[] = [];
  if (opts.stage === AssemblyStage.cut) {
    opts.breakdown.forEach((val, idx) => {
      if (val > Math.max(0, availableCut[idx] ?? 0)) {
        errs.push(
          `Cut defect at variant ${idx + 1} exceeds available cut (${Math.max(
            0,
            availableCut[idx] ?? 0
          )})`
        );
      }
    });
  }
  if (opts.stage === AssemblyStage.sew) {
    opts.breakdown.forEach((val, idx) => {
      if (val > Math.max(0, availableSew[idx] ?? 0)) {
        errs.push(
          `Sew defect at variant ${idx + 1} exceeds available sew (${Math.max(
            0,
            availableSew[idx] ?? 0
          )})`
        );
      }
    });
  }
  if (opts.stage === AssemblyStage.finish) {
    opts.breakdown.forEach((val, idx) => {
      if (val > Math.max(0, availableFinish[idx] ?? 0)) {
        errs.push(
          `Finish defect at variant ${idx + 1} exceeds available finish (${Math.max(
            0,
            availableFinish[idx] ?? 0
          )})`
        );
      }
    });
  }
  return errs.length ? errs.join("; ") : null;
}
