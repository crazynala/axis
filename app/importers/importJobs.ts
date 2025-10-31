import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asDate, asNum, pick } from "./utils";

export async function importJobs(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const jobIdNum = asNum(
      pick(r, [
        "a__JobNo",
        "a_JobNo",
        "JobNo",
        "job_no",
        "jobno",
        "job_num",
        "jobnum",
      ])
    ) as number | null;
    const projectCodeRaw = (pick(r, ["ProjectCode"]) ?? "").toString().trim();
    const projectCode = (projectCodeRaw || "").trim();
    const name = (pick(r, ["JobName"]) ?? "").toString().trim();
    if (jobIdNum == null) {
      skipped++;
      continue;
    }
    const companyId = asNum(pick(r, ["a_CompanyID"])) as number | null;
    const locationId = asNum(pick(r, ["a_LocationID|In"])) as number | null;
    const status = (pick(r, ["JobType"]) ?? "").toString().trim() || null;
    const endCustomerName =
      (pick(r, ["EndCustomerName"]) ?? "").toString().trim() || null;
    const customerOrderDate = asDate(
      pick(r, ["Date|CustomerOrder", "Date|CustomerOrder|Manual"])
    ) as Date | null;
    const cutSubmissionDate = asDate(
      pick(r, ["Date|CutSubmission"])
    ) as Date | null;
    const dropDeadDate = asDate(pick(r, ["Date|DropDead"])) as Date | null;
    const finishDate = asDate(
      pick(r, ["Date|Finish", "Date|Finish|Manual"])
    ) as Date | null;
    const firstInvoiceDate = asDate(
      pick(r, ["Date|FirstInvoice"])
    ) as Date | null;
    const targetDate = asDate(pick(r, ["Date|Target"])) as Date | null;
    const data: any = {
      projectCode: projectCode || null,
      name: name || null,
      endCustomerName,
      status,
      customerOrderDate,
      cutSubmissionDate,
      dropDeadDate,
      finishDate,
      firstInvoiceDate,
      targetDate,
      companyId: companyId ?? undefined,
      stockLocationId: locationId ?? undefined,
    };
    try {
      const existing = await prisma.job.findUnique({ where: { id: jobIdNum } });
      if (existing)
        await prisma.job.update({ where: { id: existing.id }, data });
      else await prisma.job.create({ data: { id: jobIdNum, ...data } });
      created += 1;
    } catch (e: any) {
      errors.push({
        index: i,
        id: jobIdNum,
        message: e?.message,
        code: e?.code,
      });
    }
    if ((i + 1) % 100 === 0) {
      console.log(
        `[import] jobs progress ${i + 1}/${
          rows.length
        } created=${created} skipped=${skipped} errors=${errors.length}`
      );
    }
  }
  console.log(
    `[import] jobs complete total=${rows.length} created=${created} skipped=${skipped} errors=${errors.length}`
  );
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
    console.log("[import] jobs error summary", Object.values(grouped));
  }
  return { created, updated, skipped, errors };
}
