/* Quick health check of imported data */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [companies, products, skus, duplicateSkus, movements, lines] = await Promise.all([
    prisma.company.count(),
    prisma.product.count(),
    prisma.product.count({ where: { sku: { not: null } } }),
    prisma.$queryRawUnsafe(
      `select sku, count(*) as n from "Product" where sku is not null group by sku having count(*) > 1 order by n desc limit 10`
    ),
    prisma.productMovement.count(),
    prisma.productMovementLine.count(),
  ]);

  const [linesNoProduct, linesNoMovement, linesNoBatch] = await Promise.all([
    prisma.productMovementLine.count({ where: { productId: null } }),
    prisma.productMovementLine.count({ where: { movementId: null } }),
    prisma.productMovementLine.count({ where: { batchId: null } }),
  ]);

  console.log(JSON.stringify({
    companies,
    products,
    productsWithSku: skus,
    duplicateSkus: Array.isArray(duplicateSkus) ? duplicateSkus : [],
    productMovements: movements,
    productMovementLines: lines,
    linesNoProduct,
    linesNoMovement,
    linesNoBatch,
  }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
