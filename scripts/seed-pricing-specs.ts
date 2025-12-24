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
    target: "COST",
    curveFamily: "CMT_MOQ_50",
    defaultBreakpoints: DEFAULT_BREAKPOINTS,
    params: { moq: 50 },
    notes: "Seeded CMT cost curve spec (MOQ 50).",
  },
  {
    id: 7002,
    code: "CMT_MOQ_100",
    name: "CMT MOQ 100",
    target: "COST",
    curveFamily: "CMT_MOQ_100",
    defaultBreakpoints: DEFAULT_BREAKPOINTS,
    params: { moq: 100 },
    notes: "Seeded CMT cost curve spec (MOQ 100).",
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

    await tx.pricingSpec.upsert({
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
