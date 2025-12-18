import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

config({ path: ".env" });

const SQL_FILES = [
  "scripts/20251125090000_add_unaccent_extension/migration.sql",
  "scripts/20251125090100_add_unaccented_columns_and_triggers/migration.sql",
  "scripts/20251125090200_backfill_unaccented_columns_conditional/migration.sql",
  "scripts/20251121123000_product_stock_snapshot/migration.sql",
] as const;

function buildSqlPayload() {
  const chunks: string[] = [];
  chunks.push("-- seed-db-extensions: begin\n");

  for (const file of SQL_FILES) {
    const absolutePath = path.resolve(process.cwd(), file);
    const sql = readFileSync(absolutePath, "utf8");
    chunks.push(`\n-- ==============================================\n`);
    chunks.push(`-- ${file}\n`);
    chunks.push(`-- ==============================================\n\n`);
    chunks.push(sql.trimEnd());
    chunks.push("\n");
  }

  chunks.push("\n-- seed-db-extensions: end\n");
  return chunks.join("");
}

function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL not set; aborting.");
    process.exitCode = 1;
    return;
  }

  console.log("Applying DB extensions (unaccent + triggers + backfills + stock snapshot view)...");
  console.log("Order:", SQL_FILES.join(" -> "));

  const sql = buildSqlPayload();
  const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    stdio: ["pipe", "inherit", "inherit"],
    env: process.env,
  });

  if (result.error) {
    console.error("Failed to execute psql:", result.error);
    process.exitCode = 1;
    return;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return;
  }

  console.log("DB extensions applied successfully.");
}

main();
