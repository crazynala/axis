import { prisma } from "../app/utils/prisma.server";
async function main() {
  console.log(
    "[backfill-assembly-actions] activityType column removed; no work to perform."
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
