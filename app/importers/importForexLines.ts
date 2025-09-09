import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asDate, asNum, pick } from "./utils";

export async function importForexLines(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const date = asDate(pick(r, ["Date"])) as Date | null;
    const price = asNum(pick(r, ["Price", "Rate"])) as number | null;
    const currencyFrom = (
      (pick(r, ["CurrencyFrom", "From"]) ?? "USD").toString().trim() || "USD"
    ).toUpperCase();
    const currencyTo = (
      (pick(r, ["CurrencyTo", "To"]) ?? "TRY").toString().trim() || "TRY"
    ).toUpperCase();
    if (!date || price == null) {
      skipped++;
      errors.push({
        index: i,
        message: "Missing date or price for forex line",
      });
      continue;
    }
    try {
      await prisma.forexLine.upsert({
        where: {
          date_currencyFrom_currencyTo: { date, currencyFrom, currencyTo },
        },
        create: { date, price, currencyFrom, currencyTo },
        update: { price },
      });
      created += 1;
    } catch (e: any) {
      const log = {
        index: i,
        date,
        currencyFrom,
        currencyTo,
        code: e?.code,
        constraint: e?.meta?.field_name || e?.meta?.target || null,
        message: e?.message,
      };
      errors.push(log);
      console.error("[import] forex_lines upsert error", log);
    }
  }
  return { created, updated, skipped, errors };
}
