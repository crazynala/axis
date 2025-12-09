import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: ".env" });

const prisma = new PrismaClient();

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL not set; aborting reset.");
        process.exitCode = 1;
        return;
    }

    console.log("Resetting database: truncating all public tables (keeping schema)...");

    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename <> '_prisma_migrations';
    `;

    if (!tables.length) {
        console.log("No tables found to truncate.");
        return;
    }

    const quotedTables = tables.map(({ tablename }) => `"${tablename.replace(/"/g, '""')}"`);
    const truncateSql = `TRUNCATE TABLE ${quotedTables.join(", ")} RESTART IDENTITY CASCADE;`;

    await prisma.$executeRawUnsafe(truncateSql);

    console.log(`Truncated ${tables.length} table(s).`);
}

main()
    .catch((error) => {
        console.error("Failed to reset database:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
