import { prisma } from "../app/utils/prisma.server";
import { createDefectActivity } from "../app/modules/job/services/defectActivity.server";

async function run() {
  const stockLocation = await prisma.location.create({
    data: { name: "Main Stock", type: "stock" as any },
  });
  const product = await prisma.product.create({
    data: {
      sku: `DEFECT-${Date.now()}`,
      name: "Defect Test Product",
      stockTrackingEnabled: true,
      batchTrackingEnabled: true,
    },
  });
  const job = await prisma.job.create({
    data: {
      name: "Defect Test Job",
      stockLocationId: stockLocation.id,
    },
  });
  const assembly = await prisma.assembly.create({
    data: {
      jobId: job.id,
      productId: product.id,
      quantity: 1,
    },
  });

  let threw = false;
  try {
    await createDefectActivity({
      assemblyId: assembly.id,
      jobId: job.id,
      activityDate: new Date(),
      stage: "finish" as any,
      quantity: 1,
      defectDisposition: "sample" as any,
    });
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error("Expected defect activity to throw when sample location missing.");
  }
  const activityCount = await prisma.assemblyActivity.count({
    where: { assemblyId: assembly.id },
  });
  const movementCount = await prisma.productMovement.count({
    where: { productId: product.id },
  });
  if (activityCount !== 0 || movementCount !== 0) {
    throw new Error(
      `Expected no activity/movement. activity=${activityCount} movement=${movementCount}`
    );
  }

  const sampleLocation = await prisma.location.create({
    data: { name: "Samples", type: "sample" as any },
  });

  await createDefectActivity({
    assemblyId: assembly.id,
    jobId: job.id,
    activityDate: new Date(),
    stage: "finish" as any,
    quantity: 1,
    defectDisposition: "sample" as any,
  });

  const activityCount2 = await prisma.assemblyActivity.count({
    where: { assemblyId: assembly.id },
  });
  const movementCount2 = await prisma.productMovement.count({
    where: { productId: product.id },
  });
  if (activityCount2 === 0 || movementCount2 === 0) {
    throw new Error("Expected activity + movement after sample location exists.");
  }

  console.log("OK: defect sample requires destination location.");

  await prisma.assembly.delete({ where: { id: assembly.id } });
  await prisma.job.delete({ where: { id: job.id } });
  await prisma.productMovement.deleteMany({ where: { productId: product.id } });
  await prisma.assemblyActivity.deleteMany({ where: { assemblyId: assembly.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.location.deleteMany({
    where: { id: { in: [stockLocation.id, sampleLocation.id] } },
  });
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
