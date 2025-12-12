import { prisma } from "../app/utils/prisma.server";

async function main() {
  const assemblies = await prisma.assembly.findMany({
    where: { primaryCostingId: null },
    select: {
      id: true,
      name: true,
      costings: {
        select: {
          id: true,
          product: { select: { type: true, name: true, sku: true } },
        },
      },
    },
  });

  let updated = 0;
  for (const asm of assemblies) {
    const fabricCostings =
      asm.costings?.filter((c) => c.product?.type === "Fabric") || [];
    if (fabricCostings.length === 1) {
      const target = fabricCostings[0];
      await prisma.assembly.update({
        where: { id: asm.id },
        data: { primaryCostingId: target.id },
      });
      updated++;
      console.log(
        `[seed-primary-costings] Assembly ${asm.id} -> costing ${target.id} (${target.product?.sku || target.product?.name || "Fabric"})`
      );
    }
  }

  console.log(
    `[seed-primary-costings] complete assemblies=${assemblies.length} updated=${updated}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
