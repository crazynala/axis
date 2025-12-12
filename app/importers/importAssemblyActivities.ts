import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import {
  asDate,
  asNum,
  pick,
  parseIntListPreserveGaps,
  resetSequence,
} from "./utils";
import {
  ActivityKind,
  ActivityAction,
  ExternalStepType,
  AssemblyStage,
  DefectDisposition,
} from "@prisma/client";

function deriveStructuredActivity(
  rawType: string | null
): {
  stage: AssemblyStage | null;
  kind: ActivityKind | null;
  defectDisposition: DefectDisposition | null;
  action: ActivityAction | null;
  externalStepType: ExternalStepType | null;
} {
  if (!rawType)
    return {
      stage: null,
      kind: null,
      defectDisposition: null,
      action: null,
      externalStepType: null,
    };
  const upper = rawType.trim().toUpperCase();
  const mapStage = (suffix: string): AssemblyStage => {
    if (suffix === "CUT") return AssemblyStage.cut;
    if (suffix === "MAKE") return AssemblyStage.make;
    if (suffix === "PACK") return AssemblyStage.pack;
    if (suffix === "QC") return AssemblyStage.qc;
    if (suffix === "ORDER") return AssemblyStage.order;
    return AssemblyStage.other;
  };
  if (upper.startsWith("TRASH_")) {
    const suffix = upper.replace("TRASH_", "");
    return {
      stage: mapStage(suffix),
      kind: ActivityKind.defect,
      defectDisposition: DefectDisposition.scrap,
      action: ActivityAction.RECORDED,
      externalStepType: null,
    };
  }
  if (upper === "CUT" || upper === "MAKE" || upper === "PACK" || upper === "QC") {
    return {
      stage: mapStage(upper),
      kind: ActivityKind.normal,
      defectDisposition: null,
      action: ActivityAction.RECORDED,
      externalStepType: null,
    };
  }
  return {
    stage: null,
    kind: null,
    defectDisposition: null,
    action: null,
    externalStepType: null,
  };
}

export async function importAssemblyActivities(
  rows: any[]
): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = asNum(pick(r, ["a__Serial", "id"])) as number | null;
    if (id == null) {
      skipped++;
      continue;
    }
    const qtyBreakdown = parseIntListPreserveGaps(
      pick(r, [
        "QtyBreakdown_List_c",
        "Qty_Breakdown_List_c",
        "QtyBreakdownList",
      ])
    );
    const rawActivityType =
      (pick(r, ["AssemblyActivityType", "ActivityType"]) ?? "")
        .toString()
        .trim() || null;
    const structured = deriveStructuredActivity(rawActivityType);
    const qtySum = qtyBreakdown.reduce(
      (t: number, n: number) => (Number.isFinite(n) ? t + (n | 0) : t),
      0
    );
    const assemblyIdVal = asNum(pick(r, ["a_AssemblyID"])) as number | null;
    const jobIdVal = asNum(pick(r, ["a_JobNo"])) as number | null;
    const productIdVal = asNum(
      pick(r, ["a__ProductCode", "a_ProductCode", "ProductCode"])
    ) as number | null;
    const locationInVal = asNum(
      pick(r, ["a_LocationID_In", "a_LocationID|In"])
    ) as number | null;
    const locationOutVal = asNum(
      pick(r, ["a_LocationID_Out", "a_LocationID|Out"])
    ) as number | null;

  const baseData: any = {
    name: (pick(r, ["Name"]) ?? "").toString().trim() || null,
    description: (pick(r, ["Description"]) ?? "").toString().trim() || null,
    action: structured.action,
    externalStepType: structured.externalStepType,
    activityDate: asDate(
      pick(r, ["ActivityDate", "Date", "Activity Date"])
    ) as Date | null,
      notes: (pick(r, ["Notes"]) ?? "").toString().trim() || null,
      qtyBreakdown: qtyBreakdown as any,
      quantity:
        qtySum > 0
          ? (qtySum as any)
          : (asNum(pick(r, ["Quantity"])) as number | null as any),
      qtyFabricConsumed: asNum(pick(r, ["Qty_FabricConsumed"])) as
        | number
        | null,
      qtyFabricConsumedPerUnit: asNum(
        pick(r, ["Qty_FabricConsumedPerUnit"])
      ) as number | null,
      stage: structured.stage,
      kind: structured.kind,
      defectDisposition: structured.defectDisposition,
    };

    const relationConnects: any = {};
    if (assemblyIdVal != null)
      relationConnects.assembly = { connect: { id: assemblyIdVal } };
    if (jobIdVal != null) relationConnects.job = { connect: { id: jobIdVal } };
    if (productIdVal != null)
      relationConnects.productId = productIdVal;
    if (locationInVal != null)
      relationConnects.locationIn = { connect: { id: locationInVal } };
    if (locationOutVal != null)
      relationConnects.locationOut = { connect: { id: locationOutVal } };

    const data: any = { ...baseData, ...relationConnects };
    try {
      const exists = await prisma.assemblyActivity.findUnique({
        where: { id },
        select: { id: true },
      });
      const dataForUpdate: any = { ...data };
      delete dataForUpdate.id;
      if (exists) {
        await prisma.assemblyActivity.update({
          where: { id },
          data: dataForUpdate,
        });
        updated++;
      } else {
        const createdRow = await prisma.assemblyActivity.create({
          data,
        });
        created++;
        if (createdRow.id !== id) {
          console.warn(
            "[import] assemblyActivity created with new id",
            id,
            "->",
            createdRow.id
          );
        }
      }
    } catch (e: any) {
      errors.push({
        index: i,
        id,
        assemblyId: data.assemblyId,
        message: e?.message,
        code: e?.code,
      });
    }
    if ((i + 1) % 100 === 0) {
      console.log(
        `[import] assembly_activities progress ${i + 1}/${
          rows.length
        } created=${created} skipped=${skipped} errors=${errors.length}`
      );
    }
  }
  console.log(
    `[import] assembly_activities complete total=${rows.length} created=${created} skipped=${skipped} errors=${errors.length}`
  );
  if (errors.length) {
    const grouped: Record<
      string,
      {
        key: string;
        count: number;
        ids: (number | null)[];
        assemblyIds: (number | null)[];
      }
    > = {};
    for (const e of errors) {
      const key = e.code || "error";
      if (!grouped[key])
        grouped[key] = { key, count: 0, ids: [], assemblyIds: [] };
      grouped[key].count++;
      grouped[key].ids.push(e.id ?? null);
      grouped[key].assemblyIds.push(e.assemblyId ?? null);
    }
    console.log(
      "[import] assembly_activities error summary",
      Object.values(grouped)
    );
  }
  await resetSequence(prisma, "AssemblyActivity");
  return { created, updated, skipped, errors };
}
