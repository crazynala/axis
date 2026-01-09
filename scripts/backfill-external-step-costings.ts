import { prisma } from "../app/utils/prisma.server";
import { mapExternalStepTypeToActivityUsed } from "../app/modules/job/services/externalStepActivity";

async function run() {
  const costings = await prisma.costing.findMany({
    where: {
      externalStepType: null,
      product: { externalStepType: { not: null } },
    },
    select: {
      id: true,
      product: { select: { externalStepType: true } },
    },
  });
  let updated = 0;
  for (const c of costings) {
    const stepType = c.product?.externalStepType ?? null;
    if (!stepType) continue;
    const activity = mapExternalStepTypeToActivityUsed(stepType);
    await prisma.costing.update({
      where: { id: c.id },
      data: {
        externalStepType: stepType,
        activityUsed: activity ?? undefined,
      },
    });
    updated += 1;
  }
  console.log(`[backfill] Updated ${updated} costings.`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
