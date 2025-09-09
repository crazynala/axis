import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  unstable_composeUploadHandlers,
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import { useActionData, useNavigation } from "@remix-run/react";
import { Alert, Button, Group, Stack, Table, Title } from "@mantine/core";
import * as XLSX from "xlsx";
import { prisma } from "../utils/prisma.server";

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

    // Invoices
    if (finalMode === "import:invoices") {
      let created = 0,
        updated = 0,
        skipped = 0;
      const errors: any[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const idNum = asNum(pick(r, ["a__Serial", "id"])) as number | null;
        const companyId = asNum(pick(r, ["a_CompanyID"])) as number | null;
        const invoiceCode = (
          pick(r, ["Code", "InvoiceNo", "InvoiceCode"]) ?? ""
        )
          .toString()
          .trim();
        const date = asDate(pick(r, ["Date"])) as Date | null;
        const productSkuCopy =
          (pick(r, ["ProductSKU"]) ?? "").toString().trim() || null;
        const productNameCopy =
          (pick(r, ["ProductName"]) ?? "").toString().trim() || null;
        const priceCost = asNum(pick(r, ["Price|Cost", "PriceCost"])) as
          | number
          | null;
        const priceSell = asNum(pick(r, ["Price|Sell", "PriceSell"])) as
          | number
          | null;
        const taxCodeId = asNum(pick(r, ["TaxCode"])) as number | null;
        const taxRateCopy = asNum(pick(r, ["TaxRate"])) as number | null;
        const data: any = {
          companyId,
          invoiceCode: invoiceCode || null,
          date,
          productSkuCopy,
          productNameCopy,
          priceCost,
          priceSell,
          taxCodeId,
          taxRateCopy,
        };
        try {
          if (idNum != null) {
            await prisma.invoice.upsert({
              where: { id: idNum },
              create: { id: idNum, ...data },
              update: data,
            });
          } else {
            await prisma.invoice.create({ data });
          }
          created += 1;
        } catch (e: any) {
          const log = {
            index: i,
            id: idNum,
            companyId,
            invoiceCode,
            code: e?.code,
            constraint: e?.meta?.field_name || e?.meta?.target || null,
            message: e?.message,
          };
          errors.push(log);
          console.error("[import] invoices upsert error", log);
        }
      }
      batchResults.push({
        file: file.name,
        target: finalMode,
        sheet: chosenSheet,
        total: rows.length,
        imported: created + updated,
        created,
        updated,
        skipped,
        errors,
      });
      continue;
    }

    // Invoice Lines
    if (finalMode === "import:invoice_lines") {
      let created = 0,
        updated = 0,
        skipped = 0;
      const errors: any[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const idNum = asNum(pick(r, ["a__Serial", "id"])) as number | null;
        if (idNum == null) {
          skipped++;
          errors.push({
            index: i,
            message: "Missing a__Serial/id for invoice line",
          });
          continue;
        }
        const data: any = {
          id: idNum,
          costingId: asNum(pick(r, ["a_CostingID"])) as number | null,
          expenseId: asNum(pick(r, ["a_ExpenseID"])) as number | null,
          invoiceId: asNum(pick(r, ["a_InvoiceID"])) as number | null,
          jobId: asNum(pick(r, ["a_JobNo"])) as number | null,
          productId: asNum(
            pick(r, ["a__ProductCode", "a_ProductCode", "ProductCode"])
          ) as number | null,
          purchaseOrderLineId: asNum(pick(r, ["a_PurchaseOrderLineID"])) as
            | number
            | null,
          shippingIdActual: asNum(pick(r, ["a_ShippingID|Actual"])) as
            | number
            | null,
          shippingIdDuty: asNum(pick(r, ["a_ShippingID|Duty"])) as
            | number
            | null,
          category: (pick(r, ["Category"]) ?? "").toString().trim() || null,
          details: (pick(r, ["Details"]) ?? "").toString().trim() || null,
          subCategory:
            (pick(r, ["SubCategory"]) ?? "").toString().trim() || null,
          priceCost: asNum(pick(r, ["Price|Cost", "PriceCost"])) as
            | number
            | null,
          priceSell: asNum(pick(r, ["Price|Sell", "PriceSell"])) as
            | number
            | null,
          quantity: asNum(pick(r, ["Quantity"])) as number | null,
          taxCodeId: asNum(pick(r, ["TaxCode|Cost", "a_TaxCodeID"])) as
            | number
            | null,
          taxRateCopy: asNum(pick(r, ["TaxRate|Cost", "TaxRateCost"])) as
            | number
            | null,
          invoicedTotalManual: asNum(pick(r, ["InvoicedTotalManual"])) as
            | number
            | null,
        };
        try {
          await prisma.invoiceLine.upsert({
            where: { id: idNum },
            create: data,
            update: data,
          });
          created += 1;
        } catch (e: any) {
          const log = {
            index: i,
            id: idNum,
            invoiceId: data.invoiceId,
            jobId: data.jobId,
            productId: data.productId,
            purchaseOrderLineId: data.purchaseOrderLineId,
            taxCodeId: data.taxCodeId,
            code: e?.code,
            constraint: e?.meta?.field_name || e?.meta?.target || null,
            message: e?.message,
          };
          errors.push(log);
          console.error("[import] invoice_lines upsert error", log);
        }
      }
      batchResults.push({
        file: file.name,
        target: finalMode,
        sheet: chosenSheet,
        total: rows.length,
        imported: created + updated,
        created,
        updated,
        skipped,
        errors,
      });
      continue;
    }

    // Purchase Orders
    if (finalMode === "import:purchase_orders") {
      let created = 0,
        updated = 0,
        skipped = 0;
      const errors: any[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const idNum = asNum(pick(r, ["a__Serial", "id"])) as number | null;
        if (idNum == null) {
          skipped++;
          errors.push({
            index: i,
            message: "Missing a__Serial/id for purchase order",
          });
          continue;
        }
        const data: any = {
          id: idNum,
          companyId: asNum(pick(r, ["a_CompanyID"])) as number | null,
          consigneeCompanyId: asNum(pick(r, ["a_CompanyID|Consignee"])) as
            | number
            | null,
          locationId: asNum(pick(r, ["a_LocationID|In"])) as number | null,
          date: asDate(pick(r, ["Date"])) as Date | null,
        };
        try {
          await prisma.purchaseOrder.upsert({
            where: { id: idNum },
            create: data,
            update: data,
          });
          created += 1;
        } catch (e: any) {
          const log = {
            index: i,
            id: idNum,
            code: e?.code,
            constraint: e?.meta?.field_name || e?.meta?.target || null,
            message: e?.message,
          };
          errors.push(log);
          console.error("[import] purchase_orders upsert error", log);
        }
      }
      batchResults.push({
        file: file.name,
        target: finalMode,
        sheet: chosenSheet,
        total: rows.length,
        imported: created + updated,
        created,
        updated,
        skipped,
        errors,
      });
      continue;
    }

    // Purchase Order Lines
    if (finalMode === "import:purchase_order_lines") {
      let created = 0,
        updated = 0,
        skipped = 0;
      const errors: any[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const idNum = asNum(pick(r, ["a__Serial", "id"])) as number | null;
        if (idNum == null) {
          skipped++;
          errors.push({
            index: i,
            message: "Missing a__Serial/id for purchase order line",
          });
          continue;
        }
        const data: any = {
          id: idNum,
          assemblyId: asNum(pick(r, ["a_AssemblyID"])) as number | null,
          jobId: asNum(pick(r, ["a_JobNo"])) as number | null,
          purchaseOrderId: asNum(pick(r, ["a_PurchaseOrderID"])) as
            | number
            | null,
          productId: asNum(
            pick(r, ["a__ProductCode", "a_ProductCode", "ProductCode"])
          ) as number | null,
          productSkuCopy:
            (pick(r, ["ProductSkuCopy"]) ?? "").toString().trim() || null,
          productNameCopy:
            (pick(r, ["ProductNameCopy"]) ?? "").toString().trim() || null,
          priceCost: asNum(pick(r, ["PriceCost"])) as number | null,
          priceSell: asNum(pick(r, ["PriceSell"])) as number | null,
          qtyShipped: asNum(pick(r, ["QtyShipped"])) as number | null,
          qtyReceived: asNum(pick(r, ["QtyReceived"])) as number | null,
          quantity: asNum(pick(r, ["Quantity"])) as number | null,
          quantityOrdered: asNum(pick(r, ["QuantityOrdered"])) as number | null,
          taxCodeId: asNum(pick(r, ["a_TaxCodeID"])) as number | null,
          taxRate: asNum(pick(r, ["TaxRate"])) as number | null,
        };
        try {
          await prisma.purchaseOrderLine.upsert({
            where: { id: idNum },
            create: data,
            update: data,
          });
          created += 1;
        } catch (e: any) {
          const log = {
            index: i,
            id: idNum,
            purchaseOrderId: data.purchaseOrderId,
            productId: data.productId,
            jobId: data.jobId,
            assemblyId: data.assemblyId,
            taxCodeId: data.taxCodeId,
            code: e?.code,
            constraint: e?.meta?.field_name || e?.meta?.target || null,
            message: e?.message,
          };
          errors.push(log);
          console.error("[import] purchase_order_lines upsert error", log);
        }
      }
      batchResults.push({
        file: file.name,
        target: finalMode,
        sheet: chosenSheet,
        total: rows.length,
        imported: created + updated,
        created,
        updated,
        skipped,
        errors,
      });
      continue;
    }

    // Shipments
    if (finalMode === "import:shipments") {
      let created = 0,
        updated = 0,
        skipped = 0;
      const errors: any[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const idNum = asNum(pick(r, ["a__Serial", "id"])) as number | null;
        if (idNum == null) {
          skipped++;
          errors.push({
            index: i,
            message: "Missing a__Serial/id for shipment",
          });
          continue;
        }
        const data: any = {
          id: idNum,
          addressIdShip: asNum(pick(r, ["a_AddressID|Ship"])) as number | null,
          companyIdCarrier: asNum(pick(r, ["a_CompanyID_Carrier"])) as
            | number
            | null,
          companyIdReceiver: asNum(pick(r, ["a_CompanyID_Receiver"])) as
            | number
            | null,
          companyIdSender: asNum(pick(r, ["a_CompanyID_Sender"])) as
            | number
            | null,
          locationId: asNum(pick(r, ["a_LocationID"])) as number | null,
          contactIdReceiver: asNum(pick(r, ["a_ContactID_Receiver"])) as
            | number
            | null,
          date: asDate(pick(r, ["Date"])) as Date | null,
          dateReceived: asDate(pick(r, ["DateReceived"])) as Date | null,
          trackingNo: (pick(r, ["TrackingNo"]) ?? "").toString().trim() || null,
          packingSlipCode:
            (pick(r, ["PackingSlipCode"]) ?? "").toString().trim() || null,
          type: (pick(r, ["Type"]) ?? "").toString().trim() || null,
          status: (pick(r, ["Status"]) ?? "").toString().trim() || null,
        };
        try {
          await prisma.shipment.upsert({
            where: { id: idNum },
            create: data,
            update: data,
          });
          created += 1;
        } catch (e: any) {
          const log = {
            index: i,
            id: idNum,
            code: e?.code,
            constraint: e?.meta?.field_name || e?.meta?.target || null,
            message: e?.message,
          };
          errors.push(log);
          console.error("[import] shipments upsert error", log);
        }
      }
      batchResults.push({
        file: file.name,
        target: finalMode,
        sheet: chosenSheet,
        total: rows.length,
        imported: created + updated,
        created,
        updated,
        skipped,
        errors,
      });
      continue;
    }

    // Shipment Lines
    if (finalMode === "import:shipment_lines") {
      let created = 0,
        updated = 0,
        skipped = 0;
      const errors: any[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const idNum = asNum(pick(r, ["a__Serial", "id"])) as number | null;
        if (idNum == null) {
          skipped++;
          errors.push({
            index: i,
            message: "Missing a__Serial/id for shipment line",
          });
          continue;
        }
        const data: any = {
          id: idNum,
          assemblyId: asNum(pick(r, ["a_AssemblyID"])) as number | null,
          jobId: asNum(pick(r, ["a_JobNo"])) as number | null,
          locationId: asNum(pick(r, ["a_LocationID"])) as number | null,
          productId: asNum(
            pick(r, ["a__ProductCode", "a_ProductCode", "ProductCode"])
          ) as number | null,
          shipmentId: asNum(pick(r, ["a_ShippingID"])) as number | null,
          variantSetId: asNum(pick(r, ["a_VariantSetID"])) as number | null,
          category: (pick(r, ["Category"]) ?? "").toString().trim() || null,
          details: (pick(r, ["Details"]) ?? "").toString().trim() || null,
          quantity: asNum(pick(r, ["Quantity"])) as number | null,
          status: (pick(r, ["Status"]) ?? "").toString().trim() || null,
          subCategory:
            (pick(r, ["SubCategory"]) ?? "").toString().trim() || null,
        };
        try {
          await prisma.shipmentLine.upsert({
            where: { id: idNum },
            create: data,
            update: data,
          });
          created += 1;
        } catch (e: any) {
          const log = {
            index: i,
            id: idNum,
            shipmentId: data.shipmentId,
            productId: data.productId,
            code: e?.code,
            constraint: e?.meta?.field_name || e?.meta?.target || null,
            message: e?.message,
          };
          errors.push(log);
          console.error("[import] shipment_lines upsert error", log);
        }
      }
      batchResults.push({
        file: file.name,
        target: finalMode,
        sheet: chosenSheet,
        total: rows.length,
        imported: created + updated,
        created,
        updated,
        skipped,
        errors,
      });
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

export default function AdminImportRoute() {
  const actionData = useActionData<typeof action>() as any;
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  return (
    <Stack>
      <Title order={3}>Excel Import (Batch)</Title>
      <form method="post" encType="multipart/form-data">
        <input type="hidden" name="_intent" value="uploadExcel" />
        <Group align="center" wrap="wrap">
          <input name="file" type="file" accept=".xlsx" multiple />
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--mantine-color-dimmed)",
              }}
            >
              Sheet (optional)
            </label>
            <input
              name="sheetName"
              type="text"
              placeholder="Default: first sheet"
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--mantine-color-dimmed)",
              }}
            >
              Mode
            </label>
            <select name="mode" defaultValue="auto">
              <option value="auto">Auto (infer from filename)</option>
              <option value="import:jobs">Import: Jobs</option>
              <option value="import:companies">Import: Companies</option>
              <option value="import:assemblies">Import: Assemblies</option>
              <option value="import:products">Import: Products</option>
              <option value="import:variant_sets">Import: Variant Sets</option>
              <option value="import:dhl_report_lines">
                Import: DHL Report Lines
              </option>
              <option value="import:forex_lines">Import: Forex Rates</option>
              <option value="import:addresses">Import: Addresses</option>
              <option value="import:locations">Import: Locations</option>
              <option value="import:product_batches">
                Import: Product Batches
              </option>
              <option value="import:shipments">Import: Shipments</option>
              <option value="import:shipment_lines">
                Import: Shipment Lines
              </option>
              <option value="import:invoices">Import: Invoices</option>
              <option value="import:invoice_lines">
                Import: Invoice Lines
              </option>
              <option value="import:expenses">Import: Expenses</option>
              <option value="import:product_locations">
                Import: Product Locations
              </option>
              <option value="import:product_movements">
                Import: Product Movements
              </option>
              <option value="import:product_movement_lines">
                Import: Product Movement Lines
              </option>
              <option value="import:product_lines">
                Import: Product Lines
              </option>
              <option value="import:costings">Import: Costings</option>
              <option value="import:assembly_activities">
                Import: Assembly Activities
              </option>
            </select>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Importing..." : "Import"}
          </Button>
        </Group>
      </form>
      {actionData?.error && (
        <Alert color="red" mt="md">
          {actionData.error}
        </Alert>
      )}
      {actionData?.batchImport && (
        <Stack mt="md" gap="xs">
          <Title order={5}>Batch Results</Title>
          <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>File</Table.Th>
                <Table.Th>Target</Table.Th>
                <Table.Th>Sheet</Table.Th>
                <Table.Th>Total</Table.Th>
                <Table.Th>Imported</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {actionData.batchImport.map((r: any, idx: number) => (
                <Table.Tr key={idx}>
                  <Table.Td>{r.file}</Table.Td>
                  <Table.Td>{r.target}</Table.Td>
                  <Table.Td>{r.sheet}</Table.Td>
                  <Table.Td>{r.total}</Table.Td>
                  <Table.Td>{r.imported}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      )}
    </Stack>
  );
}
