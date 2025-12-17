import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_TOLERANCE = {
  default: { pct: 0.01, abs: 0 },
  FABRIC: { pct: 0.03, abs: 5 },
  TRIM: { pct: 0.02, abs: 10 },
  PACKAGING: { pct: 0.02, abs: 25 },
};

async function seed() {
  await prisma.setting.upsert({
    where: { key: "materialCoverageTolerance" },
    update: { json: DEFAULT_TOLERANCE },
    create: { key: "materialCoverageTolerance", json: DEFAULT_TOLERANCE },
  });
  console.log("[seed-material-coverage-tolerance] ensured Setting row exists");
}

seed()
  .catch((err) => {
    console.error("[seed-material-coverage-tolerance] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
