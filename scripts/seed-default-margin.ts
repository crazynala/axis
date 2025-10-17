import { prisma } from "../app/utils/prisma.server";

async function main() {
  const existing = await prisma.setting.findUnique({
    where: { key: "defaultMargin" },
  });
  if (!existing) {
    await prisma.setting.create({
      data: { key: "defaultMargin", number: 0.1 },
    });
    console.log("Seeded defaultMargin=0.10");
  } else {
    console.log(
      "defaultMargin already set:",
      existing.number ?? existing.value
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
