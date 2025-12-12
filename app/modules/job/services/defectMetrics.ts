import {
  ActivityKind,
  AssemblyActivity,
  AssemblyStage,
  DefectDisposition,
} from "@prisma/client";

export function computeUsableForStage(
  activities: Pick<
    AssemblyActivity,
    "stage" | "kind" | "defectDisposition" | "quantity"
  >[],
  stage: AssemblyStage
): number {
  const totalGood = activities
    .filter(
      (a) =>
        a.stage === stage &&
        (a.kind === ActivityKind.normal || a.kind === ActivityKind.rework)
    )
    .reduce((sum, a) => sum + Number(a.quantity ?? 0), 0);

  const removed = activities
    .filter(
      (a) =>
        a.stage === stage &&
        a.kind === ActivityKind.defect &&
        a.defectDisposition !== DefectDisposition.none
    )
    .reduce((sum, a) => sum + Number(a.quantity ?? 0), 0);

  return totalGood - removed;
}

export function computeAttemptsForStage(
  activities: Pick<AssemblyActivity, "stage" | "quantity">[],
  stage: AssemblyStage
): number {
  return activities
    .filter((a) => a.stage === stage)
    .reduce((sum, a) => sum + Number(a.quantity ?? 0), 0);
}

export function groupDefectsByReasonAndDisposition(
  activities: Pick<
    AssemblyActivity,
    "stage" | "kind" | "defectReasonId" | "defectDisposition" | "quantity"
  >[],
  stage: AssemblyStage
) {
  const buckets = new Map<
    string,
    { reasonId: number | null; disposition: DefectDisposition; quantity: number }
  >();
  activities
    .filter(
      (a) =>
        a.stage === stage &&
        a.kind === ActivityKind.defect &&
        a.defectDisposition !== null
    )
    .forEach((a) => {
      const key = `${a.defectReasonId ?? "null"}::${
        a.defectDisposition ?? "none"
      }`;
      const bucket = buckets.get(key) ?? {
        reasonId: a.defectReasonId ?? null,
        disposition: a.defectDisposition ?? DefectDisposition.none,
        quantity: 0,
      };
      bucket.quantity += Number(a.quantity ?? 0);
      buckets.set(key, bucket);
    });
  return Array.from(buckets.values());
}
