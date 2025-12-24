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
import { importContacts } from "../importers/importContacts";
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
import { runImporter } from "../utils/prisma.server";
import { importProductCostGroups } from "../importers/importProductCostGroups";
import { importProductCostRanges } from "../importers/importProductCostRanges";
import {
  applyCompanyDefaultAddresses,
  applyContactDefaultAddresses,
} from "../importers/importAddressDefaults";

export async function adminImportAction({ request }: ActionFunctionArgs) {
  const uploadHandler = unstable_composeUploadHandlers(
    unstable_createMemoryUploadHandler({ maxPartSize: 15_000_000 })
  );
  const form = await unstable_parseMultipartFormData(request, uploadHandler);
  const intent = form.get("_intent");
  if (intent !== "uploadExcel")
    return json({ error: "Invalid intent" }, { status: 400 });

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
    "import:dhl_report_lines": 10,
    "import:forex_lines": 20,
    "import:variant_sets": 30,
    "import:companies": 40,
    "import:contacts": 50,
    "import:addresses": 60,
    "import:company_address_defaults": 70,
    "import:contact_address_defaults": 80,
    "import:locations": 90,
    "import:product_cost_groups": 95,
    "import:products": 100,
    "import:product_cost_ranges": 105,
    "import:jobs": 110,
    "import:assemblies": 120,
    "import:assembly_activities": 130,
    "import:shipments": 140,
    "import:shipment_lines": 150,
    "import:purchase_orders": 160,
    "import:purchase_order_lines": 170,
    "import:expenses": 180,
    "import:costings": 185,
    "import:invoices": 190,
    "import:invoice_lines": 200,
    "import:product_batches": 210,
    "import:product_locations": 220,
    "import:product_movements": 230,
    "import:product_movement_lines": 240,
    "import:product_lines": 250,
  };

  const inferMode = (filename: string): string | null => {
    const n = filename.toLowerCase();
    if (n.startsWith("product_cost_groups") || n.includes("cost_groups"))
      return "import:product_cost_groups";
    if (n.startsWith("product_cost_ranges") || n.includes("cost_ranges"))
      return "import:product_cost_ranges";
    if (
      n.includes("company_address_defaults") ||
      n.includes("company_default_addresses") ||
      n.includes("companies_defaults")
    )
      return "import:company_address_defaults";
    if (
      n.includes("contact_address_defaults") ||
      n.includes("contact_default_addresses") ||
      n.includes("contacts_defaults")
    )
      return "import:contact_address_defaults";
    if (n.includes("contact")) return "import:contacts";
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
      const r = await runImporter(finalMode, () => importDhlReportLines(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:forex_lines") {
      const r = await runImporter(finalMode, () => importForexLines(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:variant_sets") {
      const r = await runImporter(finalMode, () => importVariantSets(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:contacts") {
      const r = await runImporter(finalMode, () => importContacts(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:contact_address_defaults") {
      const r = await runImporter(finalMode, () =>
        applyContactDefaultAddresses(rows)
      );
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:companies") {
      const r = await runImporter(finalMode, () => importCompanies(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:company_address_defaults") {
      const r = await runImporter(finalMode, () =>
        applyCompanyDefaultAddresses(rows)
      );
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:addresses") {
      const r = await runImporter(finalMode, () => importAddresses(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:locations") {
      const r = await runImporter(finalMode, () => importLocations(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:products") {
      const r = await runImporter(finalMode, () => importProducts(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:jobs") {
      const r = await runImporter(finalMode, () => importJobs(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:assemblies") {
      const r = await runImporter(finalMode, () => importAssemblies(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:assembly_activities") {
      const r = await runImporter(finalMode, () =>
        importAssemblyActivities(rows)
      );
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:shipments") {
      const r = await runImporter(finalMode, () => importShipments(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:shipment_lines") {
      const r = await runImporter(finalMode, () => importShipmentLines(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:purchase_orders") {
      const r = await runImporter(finalMode, () => importPurchaseOrders(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:purchase_order_lines") {
      const r = await runImporter(finalMode, () =>
        importPurchaseOrderLines(rows)
      );
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:invoices") {
      const r = await runImporter(finalMode, () => importInvoices(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:invoice_lines") {
      const r = await runImporter(finalMode, () => importInvoiceLines(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:expenses") {
      const r = await runImporter(finalMode, () => importExpenses(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:product_batches") {
      const r = await runImporter(finalMode, () => importBatches(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:product_locations") {
      const r = await runImporter(finalMode, () =>
        importProductLocations(rows)
      );
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:product_movements") {
      const r = await runImporter(finalMode, () =>
        importProductMovements(rows)
      );
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:product_movement_lines") {
      const r = await runImporter(finalMode, () =>
        importProductMovementLines(rows)
      );
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:product_lines") {
      const r = await runImporter(finalMode, () => importProductLines(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:product_cost_groups") {
      const r = await runImporter(finalMode, () =>
        importProductCostGroups(rows)
      );
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:product_cost_ranges") {
      const r = await runImporter(finalMode, () =>
        importProductCostRanges(rows)
      );
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }
    if (finalMode === "import:costings") {
      const r = await runImporter(finalMode, () => importCostings(rows));
      push(finalMode, r.created, r.updated, r.skipped, r.errors);
      continue;
    }

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
