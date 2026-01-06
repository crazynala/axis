import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_BREAKPOINTS = [
  1, 5, 10, 15, 20, 25, 50, 75, 100, 125, 150, 175, 200, 250,
];

const SPECS = [
  {
    id: 7001,
    code: "CMT_MOQ_50",
    name: "CMT MOQ 50",
    target: "SELL",
    curveFamily: "CMT_MOQ_50",
    defaultBreakpoints: DEFAULT_BREAKPOINTS,
    params: { moq: 50 },
    notes: "Seeded CMT sell curve spec (MOQ 50).",
    ranges: [
      { rangeFrom: 2000, rangeTo: null, multiplier: 0.77 },
      { rangeFrom: 1500, rangeTo: 1999, multiplier: 0.81 },
      { rangeFrom: 1000, rangeTo: 1499, multiplier: 0.86 },
      { rangeFrom: 500, rangeTo: 999, multiplier: 0.89 },
      { rangeFrom: 250, rangeTo: 499, multiplier: 0.93 },
      { rangeFrom: 100, rangeTo: 249, multiplier: 1.0 },
      { rangeFrom: 50, rangeTo: 99, multiplier: 1.0 },
      { rangeFrom: 40, rangeTo: 49, multiplier: 1.25 },
      { rangeFrom: 30, rangeTo: 39, multiplier: 1.5 },
      { rangeFrom: 20, rangeTo: 29, multiplier: 1.75 },
      { rangeFrom: 10, rangeTo: 19, multiplier: 2.29 },
      { rangeFrom: 1, rangeTo: 9, multiplier: 3.0 },
    ],
  },
  {
    id: 7002,
    code: "CMT_MOQ_100",
    name: "CMT MOQ 100",
    target: "SELL",
    curveFamily: "CMT_MOQ_100",
    defaultBreakpoints: DEFAULT_BREAKPOINTS,
    params: { moq: 100 },
    notes: "Seeded CMT sell curve spec (MOQ 100).",
    ranges: [
      { rangeFrom: 100, rangeTo: null, multiplier: 1.0 },
      { rangeFrom: 90, rangeTo: 99, multiplier: 1.22875817 },
      { rangeFrom: 80, rangeTo: 89, multiplier: 1.257352941 },
      { rangeFrom: 70, rangeTo: 79, multiplier: 1.294117647 },
      { rangeFrom: 60, rangeTo: 69, multiplier: 1.343137255 },
      { rangeFrom: 50, rangeTo: 59, multiplier: 1.411764706 },
      { rangeFrom: 40, rangeTo: 49, multiplier: 1.514705882 },
      { rangeFrom: 30, rangeTo: 39, multiplier: 1.68627451 },
      { rangeFrom: 20, rangeTo: 29, multiplier: 2.029411765 },
      { rangeFrom: 15, rangeTo: 19, multiplier: 2.37254902 },
      { rangeFrom: 10, rangeTo: 14, multiplier: 3.0 },
      { rangeFrom: 5, rangeTo: 9, multiplier: 3.0 },
      { rangeFrom: 1, rangeTo: 4, multiplier: 3.0 },
    ],
  },
];

async function upsertSpec(spec: (typeof SPECS)[number]) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "PricingSpec"
      WHERE "id" = ${spec.id} AND "code" <> ${spec.code}
    `;
    await tx.$executeRaw`
      UPDATE "PricingSpec"
      SET "id" = ${spec.id}
      WHERE "code" = ${spec.code} AND "id" <> ${spec.id}
    `;

    const saved = await tx.pricingSpec.upsert({
      where: { code: spec.code },
      create: {
        id: spec.id,
        code: spec.code,
        name: spec.name,
        target: spec.target as any,
        curveFamily: spec.curveFamily as any,
        defaultBreakpoints: spec.defaultBreakpoints,
        params: spec.params,
        notes: spec.notes,
      },
      update: {
        name: spec.name,
        target: spec.target as any,
        curveFamily: spec.curveFamily as any,
        defaultBreakpoints: spec.defaultBreakpoints,
        params: spec.params,
        notes: spec.notes,
      },
    });
    await tx.pricingSpecRange.deleteMany({
      where: { pricingSpecId: saved.id },
    });
    if (spec.ranges?.length) {
      await tx.pricingSpecRange.createMany({
        data: spec.ranges.map((range) => ({
          pricingSpecId: saved.id,
          rangeFrom: range.rangeFrom,
          rangeTo: range.rangeTo,
          multiplier: range.multiplier,
        })),
      });
    }
  });
}

async function main() {
  for (const spec of SPECS) {
    await upsertSpec(spec);
  }
  await prisma.$executeRaw`
    SELECT setval(
      pg_get_serial_sequence('"PricingSpec"', 'id'),
      (SELECT COALESCE(MAX(id), 1) FROM "PricingSpec")
    )
  `;
  console.log(`[seed] Upserted ${SPECS.length} pricing specs.`);
}

main()
  .catch((err) => {
    console.error("[seed] Pricing specs failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
