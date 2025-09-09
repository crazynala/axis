import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  unstable_composeUploadHandlers,
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import * as XLSX from "xlsx";
import { importDhlReportLines } from "../importers/importDhlReportLines";
import { importForexLines } from "../importers/importForexLines";
import { importVariantSets } from "../importers/importVariantSets";
import { importCompanies } from "../importers/importCompanies";
import { importInvoices } from "../importers/importInvoices";
import { importInvoiceLines } from "../importers/importInvoiceLines";
import { importPurchaseOrders } from "../importers/importPurchaseOrders";
import { importPurchaseOrderLines } from "../importers/importPurchaseOrderLines";
import { importShipments } from "../importers/importShipments";
import { importShipmentLines } from "../importers/importShipmentLines";
import { importAddresses } from "../importers/importAddresses";
import { importLocations } from "../importers/importLocations";
import { importJobs } from "../importers/importJobs";
import { importProducts } from "../importers/importProducts";
import { importAssemblies } from "../importers/importAssemblies";
import { importAssemblyActivities } from "../importers/importAssemblyActivities";
import { importBatches } from "../importers/importBatches";
import { importProductMovements } from "../importers/importProductMovements";
import { importProductMovementLines } from "../importers/importProductMovementLines";
import { importProductLines } from "../importers/importProductLines";
import { importExpenses } from "../importers/importExpenses";
import { importCostings } from "../importers/importCostings";
import { importProductLocations } from "../importers/importProductLocations";

export async function action({ request }: ActionFunctionArgs) {
  const uploadHandler = unstable_composeUploadHandlers(
    unstable_createMemoryUploadHandler({ maxPartSize: 15_000_000 })
  );
  const form = await unstable_parseMultipartFormData(request, uploadHandler);
  const intent = form.get("_intent");
  if (intent !== "uploadExcel")
    return json({ error: "Invalid intent" }, { status: 400 });

  // Helpers
  const normalizeKey = (s: string) =>
    String(s || "")
      .toLowerCase()
      .replace(/[\s|]+/g, "|")
      .replace(/\|+/g, "|")
      .replace(/__/g, "__");
  const pick = (row: any, names: string[]) => {
    const map: Record<string, any> = {};
    for (const key of Object.keys(row)) map[normalizeKey(key)] = row[key];
    for (const n of names) {
      const v = map[normalizeKey(n)];
      if (v !== undefined) return v;
    }
    return undefined;
  };
  const asNum = (raw: any): number | null => {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (s === "" || s.toLowerCase() === "null" || s === "-") return null;
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const asDate = (raw: any): Date | null => {
    if (raw == null) return null;
    if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
    if (typeof raw === "number") {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const ms = Math.round(raw * 24 * 60 * 60 * 1000);
      const d = new Date(excelEpoch.getTime() + ms);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(String(raw));
    return isNaN(d.getTime()) ? null : d;
  };

  const uploadMode = ((form.get("mode") as string) || "auto").toLowerCase();
  const sheetNameOverride = (form.get("sheetName") as string) || "";
  const files = (form.getAll("file") as any[]).filter(
    (f) => f && typeof f.arrayBuffer === "function"
  ) as File[];

  const modePriority: Record<string, number> = {
    "import:dhl_report_lines": 2,
    "import:forex_lines": 3,
    "import:variant_sets": 5,
    "import:companies": 10,
    "import:addresses": 12,
    "import:locations": 15,
    "import:products": 20,
    "import:jobs": 30,
    "import:assemblies": 40,
    "import:assembly_activities": 50,
    "import:shipments": 60,
    "import:shipment_lines": 61,
    "import:purchase_orders": 62,
    "import:purchase_order_lines": 63,
    "import:invoices": 64,
    "import:invoice_lines": 65,
    "import:expenses": 66,
    "import:product_batches": 70,
    "import:product_locations": 80,
    "import:product_movements": 90,
    "import:product_movement_lines": 110,
    "import:product_lines": 120,
    "import:costings": 130,
  };

  const inferMode = (filename: string): string | null => {
    const n = filename.toLowerCase();
    if (n.includes("dhl")) return "import:dhl_report_lines";
    if (n.includes("forex") || n.includes("fx")) return "import:forex_lines";
    if (n.includes("variantset") || n.includes("variant_set"))
      return "import:variant_sets";
    if (n.includes("companies") || n.includes("company"))
      return "import:companies";
    if (n.includes("address")) return "import:addresses";
    if (n.includes("jobs")) return "import:jobs";
    if (n.includes("assembl")) {
      if (n.includes("activit")) return "import:assembly_activities";
      return "import:assemblies";
    }
    if (n.includes("shipment") && !n.includes("line"))
      return "import:shipments";
    if (n.includes("shipment") && n.includes("line"))
      return "import:shipment_lines";
    if (n.includes("purchase_order") && n.includes("line"))
      return "import:purchase_order_lines";
    if (n.includes("purchase_order")) return "import:purchase_orders";
    if (n.includes("invoice") && !n.includes("line")) return "import:invoices";
    if (n.includes("invoice") && n.includes("line"))
      return "import:invoice_lines";
    if (n.includes("expense")) return "import:expenses";
    if (n.includes("product_locations")) return "import:product_locations";
    if (n.includes("product_batches")) return "import:product_batches";
    if (n.includes("product_movement_lines"))
      return "import:product_movement_lines";
    if (n.includes("product_movements")) return "import:product_movements";
    if (n.includes("productlines") || n.includes("product_lines"))
      return "import:product_lines";
    if (n.includes("costings") || n.includes("costing"))
      return "import:costings";
    if (n.includes("product") || n.includes("products"))
      return "import:products";
    if (n.includes("location")) return "import:locations";
    return null;
  };

  const modeOf = (f: File): string | null =>
    uploadMode === "auto" ? inferMode(f.name) : uploadMode;
  const filesOrdered = [...files].sort((a, b) => {
    const ma = modeOf(a);
    const mb = modeOf(b);
    const pa = ma ? modePriority[ma] ?? 999 : 999;
    const pb = mb ? modePriority[mb] ?? 999 : 999;
    return pa - pb;
  });

  const batchResults: any[] = [];
  for (const file of filesOrdered) {
    let resolvedMode = uploadMode;
    if (uploadMode === "auto") {
      const inferred = inferMode(file.name);
      if (!inferred) {
        batchResults.push({
          file: file.name,
          error: "Could not infer import mode from filename",
        });
        continue;
      }
      resolvedMode = inferred;
    }
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: "array" });
    const chosenSheet =
      sheetNameOverride && wb.SheetNames.includes(sheetNameOverride)
        ? sheetNameOverride
        : wb.SheetNames[0];
    const ws = wb.Sheets[chosenSheet];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as any[];
    const finalMode = resolvedMode;
    console.log(
      `[import] start mode=${finalMode} file="${file.name}" sheet="${chosenSheet}" totalRows=${rows.length}`
    );

    const push = (
      mode: string,
      created: number,
      updated: number,
      skipped: number,
      errors: any[]
    ) => {
      batchResults.push({
        file: file.name,
        target: mode,
        sheet: chosenSheet,
        total: rows.length,
        imported: created + updated,
        created,
        updated,
        skipped,
        errors,
      });
      console.log(
        `[import] done ${mode} created=${created} updated=${updated} skipped=${skipped} errors=${errors.length}`
      );
    };

    if (finalMode === "import:dhl_report_lines") {
      const r = await importDhlReportLines(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:forex_lines") {
      const r = await importForexLines(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:variant_sets") {
      const r = await importVariantSets(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:companies") {
      const r = await importCompanies(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:addresses") {
      const r = await importAddresses(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:locations") {
      const r = await importLocations(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:products") {
      const r = await importProducts(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:jobs") {
      const r = await importJobs(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:assemblies") {
      const r = await importAssemblies(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:assembly_activities") {
      const r = await importAssemblyActivities(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:shipments") {
      const r = await importShipments(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:shipment_lines") {
      const r = await importShipmentLines(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:purchase_orders") {
      const r = await importPurchaseOrders(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:purchase_order_lines") {
      const r = await importPurchaseOrderLines(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:invoices") {
      const r = await importInvoices(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:invoice_lines") {
      const r = await importInvoiceLines(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:expenses") {
      const r = await importExpenses(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:product_batches") {
      const r = await importBatches(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:product_locations") {
      const r = await importProductLocations(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:product_movements") {
      const r = await importProductMovements(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:product_movement_lines") {
      const r = await importProductMovementLines(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:product_lines") {
      const r = await importProductLines(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:costings") {
      const r = await importCostings(rows);
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }

    // Fallback
    batchResults.push({
      file: file.name,
      target: finalMode,
      sheet: chosenSheet,
      total: rows.length,
      imported: 0,
      note: "Mode not implemented in this pass",
    });
  }

  return json({ batchImport: batchResults });
}
