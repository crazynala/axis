import { json } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import {
  unstable_composeUploadHandlers,
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import * as XLSX from "xlsx";
import { useForm, Controller } from "react-hook-form";
import {
  Button,
  Group,
  TextInput,
  NumberInput,
  Table,
  Title,
  Stack,
  Divider,
  Alert,
  Select,
} from "@mantine/core";

type LoaderData = {
  values: Array<{
    id: number;
    code: string | null;
    label: string | null;
    type: string | null;
    value: number | null;
  }>;
};

export async function loader({}: LoaderFunctionArgs) {
  const values = await prisma.valueList.findMany({
    orderBy: [{ type: "asc" }, { label: "asc" }],
  });
  return json<LoaderData>({ values });
}

export async function action({ request }: ActionFunctionArgs) {
  const contentType = request.headers.get("content-type") || "";
  const isMultipart = contentType.includes("multipart/form-data");

  if (isMultipart) {
    const uploadHandler = unstable_composeUploadHandlers(
      unstable_createMemoryUploadHandler({ maxPartSize: 15_000_000 })
    );
    const form = await unstable_parseMultipartFormData(request, uploadHandler);
    const intent = form.get("_intent");

    // ValueList create/delete through multipart
    if (intent === "valueList.create") {
      const code = (form.get("code") as string) || null;
      const label = (form.get("label") as string) || null;
      const type = (form.get("type") as string) || null;
      const valueRaw = form.get("value") as string | null;
      const value = valueRaw ? Number(valueRaw) : null;
      await prisma.valueList.create({ data: { code, label, type, value } });
      const values = await prisma.valueList.findMany({
        orderBy: [{ type: "asc" }, { label: "asc" }],
      });
      return json({ values, message: "Value created" });
    }
    // Expecting Excel upload via multipart
    if (intent !== "uploadExcel") {
      // Other intents (like valueList.delete) are handled below in non-multipart fallback
      return json({ error: "Invalid intent" });
    }
    // Helper to normalize header keys
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
      // Excel serial dates sometimes come through as numbers
      if (typeof raw === "number") {
        // Excel epoch: days since 1899-12-30
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const ms = Math.round(raw * 24 * 60 * 60 * 1000);
        const d = new Date(excelEpoch.getTime() + ms);
        return isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(String(raw));
      return isNaN(d.getTime()) ? null : d;
    };

    const asBool = (raw: any): boolean => {
      const s = String(raw ?? "")
        .trim()
        .toLowerCase();
      return ["1", "y", "yes", "true", "t"].includes(s);
    };

    // Upload config
    const uploadMode = ((form.get("mode") as string) || "auto").toLowerCase();
    const sheetNameOverride = (form.get("sheetName") as string) || "";
    const files = (form.getAll("file") as any[]).filter(
      (f) => f && typeof f.arrayBuffer === "function"
    ) as File[];

    // Mode priority ensures dependencies import in the right order when auto
    const modePriority: Record<string, number> = {
      "import:variant_sets": 5,
      "import:companies": 10,
      "import:locations": 15,
      "import:products": 20,
      "import:jobs": 30,
      "import:assemblies": 40,
      "import:assembly_activities": 50,
      "import:product_batches": 70,
      "import:product_locations": 80,
      "import:product_movements": 90,
      "import:product_movement_lines": 110,
      "import:product_lines": 120,
      "import:costings": 130,
    };

    const inferMode = (filename: string): string | null => {
      const n = filename.toLowerCase();
      if (n.includes("variantset") || n.includes("variant_set"))
        return "import:variant_sets";
      if (n.includes("companies") || n.includes("company"))
        return "import:companies";
      if (n.includes("jobs")) return "import:jobs";
      if (n.includes("assembl")) {
        if (n.includes("activit")) return "import:assembly_activities";
        return "import:assemblies";
      }
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

    // Parse comma/semicolon/pipe separated integer lists preserving blanks as zeros.
    const parseIntListPreserveGaps = (raw: any): number[] => {
      if (raw == null) return [];
      const s = String(raw).replace(/[;|]/g, ",");
      // Keep empty entries by splitting on comma only
      const arr = s.split(",").map((tok) => {
        const t = tok.trim();
        if (t === "") return 0;
        const n = Number(t);
        return Number.isFinite(n) ? Math.trunc(n) : 0;
      });
      return arr;
    };

    // Parse string lists preserving blanks (empty strings) to keep alignment.
    const parseStringListPreserveGaps = (raw: any): string[] => {
      if (raw == null) return [];
      const s = String(raw).replace(/[;|]/g, ",");
      return s.split(",").map((tok) => tok.trim());
    };

    // Run async workers over rows in batches for concurrency and periodic progress updates
    const IMPORT_BATCH_SIZE = Number(process.env.IMPORT_BATCH_SIZE ?? 200);
    const processRowsInBatches = async <T,>(
      items: T[],
      worker: (item: T, index: number) => Promise<void>,
      opts?: { batchSize?: number; label?: string }
    ) => {
      const batchSize = opts?.batchSize ?? IMPORT_BATCH_SIZE;
      const label = opts?.label ?? "rows";
      for (let start = 0; start < items.length; start += batchSize) {
        const end = Math.min(items.length, start + batchSize);
        const slice = items.slice(start, end);
        await Promise.allSettled(
          slice.map((item, idx) => worker(item, start + idx))
        );
        console.log(`[import] ${label} ${end}/${items.length}`);
      }
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
      // Light progress logging to monitor long imports
      console.log(
        `[import] start mode=${finalMode} file="${file.name}" sheet="${chosenSheet}" totalRows=${rows.length}`
      );
      if (finalMode === "import:products") {
        const total = rows.length;
        let imported = 0,
          created = 0,
          updated = 0,
          skippedNoId = 0,
          skuRenamed = 0,
          missingVariantSet = 0,
          linkedVariantSet = 0,
          linkedCustomer = 0,
          missingCustomer = 0;

        // Ensure SKU uniqueness; when desired is null keep null
        const getUniqueSku = async (
          desired: string | null,
          currentId?: number | null
        ): Promise<string | null> => {
          const base = (desired || "").trim();
          if (!base) return null;
          let candidate = base;
          let n = 1;
          while (true) {
            const clash = await prisma.product.findFirst({
              where: { sku: candidate },
            });
            if (!clash || (currentId != null && clash.id === currentId))
              return candidate;
            n += 1;
            candidate = n === 2 ? `${base}-dup` : `${base}-dup${n - 1}`;
          }
        };

        // Prefer FileMaker Product Code as primary key for Product.id
        const idKeys = [
          "a__ProductCode",
          "a_ProductCode",
          "ProductCode",
          "product_code",
          "product code",
          "productcode",
          // Fallbacks
          "a__Serial",
          "product_id",
          "productid",
          "id",
        ];
        const codeKeys = [
          "code",
          "product_code",
          "product code",
          "productcode",
          "item code",
          "sku",
          "sku code",
        ];
        const nameKeys = [
          "name",
          "product_name",
          "product name",
          "productname", // FileMaker: Product.ProductName
          "item name",
          "description",
          "product description",
        ];
        const variantSetIdKeys = [
          "a__VariantSetID", // FileMaker: double underscore version
          "a_VariantSetID", // FileMaker: single underscore variant
          "variantsetid",
          "variant set id",
          "variant_set_id",
        ];
        const typeKeys = ["type", "product_type", "product type"];
        const costKeys = [
          "costprice",
          "cost price",
          "cost_price",
          "cost",
          "unit cost",
        ];
        const manualKeys = [
          "manualsaleprice",
          "manual sale price",
          "manual_sale_price",
          "manual",
          "manual price",
        ];
        const autoKeys = [
          "autosaleprice",
          "auto sale price",
          "auto_sale_price",
          "auto",
          "auto price",
        ];
        const stockKeys = [
          "stocktrackingenabled",
          "stock tracking enabled",
          "stock_tracking_enabled",
          "stock tracking",
          "stock",
        ];
        const batchKeys = [
          "batchtrackingenabled",
          "batch tracking enabled",
          "batch_tracking_enabled",
          "batch tracking",
          "batch",
        ];

        await processRowsInBatches(
          rows,
          async (r, i) => {
            const idNum = asNum(pick(r, idKeys)) as number | null;
            if (idNum == null) {
              skippedNoId++;
              return;
            }
            const sku = pick(r, ["sku", "sku code"])?.toString().trim() || null;
            const name = pick(r, nameKeys)?.toString().trim() || null;
            const typeRaw = pick(r, typeKeys)?.toString().trim() || null;
            const allowedTypes = [
              "CMT",
              "Fabric",
              "Finished",
              "Trim",
              "Service",
            ];
            const type =
              allowedTypes.find(
                (t) => t.toLowerCase() === (typeRaw || "").toLowerCase()
              ) ||
              (typeRaw && typeRaw.toLowerCase() === "finished goods"
                ? "Finished"
                : null);
            const costPrice = asNum(pick(r, costKeys)) as number | null;
            const manualSalePrice = asNum(pick(r, manualKeys)) as number | null;
            const autoSalePrice = asNum(pick(r, autoKeys)) as number | null;
            const stockTrackingEnabled = asBool(pick(r, stockKeys)) as boolean;
            const batchTrackingEnabled = asBool(pick(r, batchKeys)) as boolean;
            const variantSetIdVal = asNum(pick(r, variantSetIdKeys)) as
              | number
              | null;
            let resolvedVariantSetId: number | null = null;
            if (variantSetIdVal != null) {
              const vs = await prisma.variantSet.findUnique({
                where: { id: variantSetIdVal },
              });
              if (vs) {
                resolvedVariantSetId = vs.id;
                linkedVariantSet++;
              } else missingVariantSet++;
            }

            // Resolve customer -> Product.customerId from either numeric a_CompanyID or Customer name
            const companyIdRaw = asNum(pick(r, ["a_CompanyID"])) as
              | number
              | null;
            const customerName = (pick(r, ["Customer"]) ?? "")
              .toString()
              .trim();
            let resolvedCustomerId: number | null = null;
            if (companyIdRaw != null) {
              const c = await prisma.company.findUnique({
                where: { id: companyIdRaw },
              });
              if (c) {
                resolvedCustomerId = c.id;
                linkedCustomer++;
              } else missingCustomer++;
            } else if (customerName) {
              const c = await prisma.company.findFirst({
                where: { name: customerName },
              });
              if (c) {
                resolvedCustomerId = c.id;
                linkedCustomer++;
              } else missingCustomer++;
            }

            const existing = await prisma.product.findUnique({
              where: { id: idNum },
            });
            const uniqueSku = await getUniqueSku(sku, existing?.id ?? null);
            if (uniqueSku !== (sku ?? null)) skuRenamed++;
            if (existing) {
              await prisma.product.update({
                where: { id: existing.id },
                data: {
                  sku: uniqueSku,
                  name,
                  type: type as any,
                  costPrice,
                  manualSalePrice,
                  autoSalePrice,
                  stockTrackingEnabled,
                  batchTrackingEnabled,
                  ...(resolvedVariantSetId != null
                    ? { variantSetId: resolvedVariantSetId }
                    : {}),
                  ...(resolvedCustomerId != null
                    ? { customerId: resolvedCustomerId }
                    : {}),
                } as any,
              });
              updated++;
            } else {
              await prisma.product.create({
                data: {
                  id: idNum,
                  sku: uniqueSku,
                  name,
                  type: type as any,
                  costPrice,
                  manualSalePrice,
                  autoSalePrice,
                  stockTrackingEnabled,
                  batchTrackingEnabled,
                  ...(resolvedVariantSetId != null
                    ? { variantSetId: resolvedVariantSetId }
                    : {}),
                  ...(resolvedCustomerId != null
                    ? { customerId: resolvedCustomerId }
                    : {}),
                } as any,
              });
              created++;
            }
            imported++;
          },
          // Process sequentially to avoid SKU unique races across concurrent rows
          { batchSize: 1, label: "products" }
        );

        console.log(
          `[import] done products file="${file.name}" imported=${imported} created=${created} updated=${updated} skippedNoId=${skippedNoId}`
        );
        batchResults.push({
          file: file.name,
          target: "products",
          sheet: chosenSheet,
          total,
          imported,
          created,
          updated,
          skippedNoId,
          skuRenamed,
          missingVariantSet,
          linkedVariantSet,
          linkedCustomer,
          missingCustomer,
        });
        continue;
      }

      // COMPANIES
      if (finalMode === "import:companies") {
        let total = rows.length,
          created = 0,
          updated = 0,
          skipped = 0;
        await processRowsInBatches(
          rows,
          async (r, i) => {
            const idNum = asNum(pick(r, ["a__Serial"])) as number | null;
            const name = (pick(r, ["Company"]) ?? "").toString().trim();
            if (!name && idNum == null) {
              skipped++;
              return;
            }
            const email = (pick(r, ["Email"]) ?? "").toString().trim() || null;
            const phone = (pick(r, ["Phone"]) ?? "").toString().trim() || null;
            const category =
              (pick(r, ["Category"]) ?? "").toString().trim() || null;
            const customerPricingCategory =
              (pick(r, ["CustomerPricingCategory"]) ?? "").toString().trim() ||
              null;
            const customerPricingDiscount = asNum(
              pick(r, ["CustomerPricingDiscount"])
            ) as number | null;
            const ourRep =
              (pick(r, ["OurRep"]) ?? "").toString().trim() || null;
            const flagCarrier = !!pick(r, ["Flag_Carrier"]);
            const flagCustomer = !!pick(r, ["Flag_Customer"]);
            const flagInactive = !!pick(r, ["Flag_Inactive"]);
            const flagSupplier = !!pick(r, ["Flag_Supplier"]);
            const createdBy =
              (pick(r, ["Record_CreatedBy"]) ?? "").toString().trim() || null;
            const createdAt = asDate(
              pick(r, ["Record_CreatedTimestamp"])
            ) as Date | null;
            const modifiedBy =
              (pick(r, ["Record_ModifiedBy"]) ?? "").toString().trim() || null;
            const updatedAt = asDate(
              pick(r, ["Record_ModifiedTimestamp"])
            ) as Date | null;
            const type = flagSupplier
              ? "vendor"
              : flagCustomer
              ? "customer"
              : "other";
            const isActive = flagInactive ? false : true;
            // Prefer matching by explicit id when provided; else by name
            let existing =
              idNum != null
                ? await prisma.company.findUnique({ where: { id: idNum } })
                : null;
            if (!existing && name) {
              existing = await prisma.company.findFirst({ where: { name } });
            }
            const data: any = {
              name,
              email,
              phone,
              notes:
                [
                  type ? `Type: ${type}` : null,
                  category ? `Category: ${category}` : null,
                  customerPricingCategory
                    ? `CustPricingCat: ${customerPricingCategory}`
                    : null,
                  customerPricingDiscount != null
                    ? `CustPricingDisc: ${customerPricingDiscount}`
                    : null,
                  ourRep ? `OurRep: ${ourRep}` : null,
                  flagCarrier ? `Carrier: yes` : null,
                ]
                  .filter(Boolean)
                  .join(" | ") || null,
              isActive,
              isCarrier: flagCarrier || null,
              isCustomer: flagCustomer || null,
              isSupplier: flagSupplier || null,
              isInactive: flagInactive || null,
              createdBy,
              modifiedBy,
            };
            if (createdAt) (data as any).createdAt = createdAt;
            if (updatedAt) (data as any).updatedAt = updatedAt;
            if (existing) {
              await prisma.company.update({
                where: { id: existing.id },
                data: data as any,
              });
              updated++;
            } else {
              await prisma.company.create({
                data:
                  idNum != null
                    ? ({ id: idNum, ...data } as any)
                    : (data as any),
              });
              created++;
            }
          },
          { batchSize: 200, label: "companies" }
        );
        console.log(
          `[import] done companies file="${file.name}" created=${created} updated=${updated} skipped=${skipped}`
        );
        batchResults.push({
          file: file.name,
          target: "companies",
          sheet: chosenSheet,
          total,
          imported: created + updated,
          created,
          updated,
          skipped,
        });
        continue;
      }

      // JOBS
      if (finalMode === "import:jobs") {
        let total = rows.length,
          created = 0,
          updated = 0,
          skipped = 0,
          missingCompany = 0,
          missingLocIn = 0,
          missingLocOut = 0;
        // No unique enforcement for projectCode; duplicates allowed
        await processRowsInBatches(
          rows,
          async (r, i) => {
            // Job number must become Job.id
            const jobIdNum = asNum(
              pick(r, [
                "a__JobNo",
                "a_JobNo",
                "JobNo",
                "job_no",
                "jobno",
                "job_num",
                "jobnum",
              ]) as any
            ) as number | null;
            const jobNoRaw = (pick(r, ["a__JobNo", "JobNo"]) ?? "")
              .toString()
              .trim();
            const projectCodeRaw = (pick(r, ["ProjectCode"]) ?? "")
              .toString()
              .trim();
            // Keep empty if missing; do not backfill from job number
            const projectCode = (projectCodeRaw || "").trim();
            const name = (pick(r, ["JobName"]) ?? "").toString().trim();
            if (jobIdNum == null) {
              skipped++;
              return;
            }
            const companyId = asNum(pick(r, ["a_CompanyID"])) as number | null;
            const locInId = asNum(pick(r, ["a_LocationID|In"])) as
              | number
              | null;
            const locOutId = asNum(pick(r, ["a_LocationID|Out"])) as
              | number
              | null;
            const status =
              (pick(r, ["JobType"]) ?? "").toString().trim() || null;
            const endCustomerName =
              (pick(r, ["EndCustomerName"]) ?? "").toString().trim() || null;
            const customerOrderDate = asDate(
              pick(r, ["Date|CustomerOrder", "Date|CustomerOrder|Manual"])
            ) as Date | null;
            const cutSubmissionDate = asDate(
              pick(r, ["Date|CutSubmission"])
            ) as Date | null;
            const dropDeadDate = asDate(
              pick(r, ["Date|DropDead"])
            ) as Date | null;
            const finishDate = asDate(
              pick(r, ["Date|Finish", "Date|Finish|Manual"])
            ) as Date | null;
            const firstInvoiceDate = asDate(
              pick(r, ["Date|FirstInvoice"])
            ) as Date | null;
            const targetDate = asDate(pick(r, ["Date|Target"])) as Date | null;
            let resolvedCompanyId: number | null = null;
            if (companyId != null) {
              const c = await prisma.company.findUnique({
                where: { id: companyId },
              });
              if (c) resolvedCompanyId = c.id;
              else missingCompany++;
            }
            let resolvedLocInId: number | null = null;
            if (locInId != null) {
              const li = await prisma.location.findUnique({
                where: { id: locInId },
              });
              if (li) resolvedLocInId = li.id;
              else missingLocIn++;
            }
            let resolvedLocOutId: number | null = null;
            if (locOutId != null) {
              const lo = await prisma.location.findUnique({
                where: { id: locOutId },
              });
              if (lo) resolvedLocOutId = lo.id;
              else missingLocOut++;
            }
            const existing = await prisma.job.findUnique({
              where: { id: jobIdNum },
            });
            const data: any = {
              // projectCode can be duplicate or null; keep as-is
              projectCode: projectCode || null,
              name: name || null,
              endCustomerName,
              status,
              customerOrderDate,
              cutSubmissionDate,
              dropDeadDate,
              finishDate,
              firstInvoiceDate,
              targetDate,
            };
            if (resolvedCompanyId != null) data.companyId = resolvedCompanyId;
            if (resolvedLocInId != null) data.locationInId = resolvedLocInId;
            if (resolvedLocOutId != null) data.locationOutId = resolvedLocOutId;
            if (existing) {
              await (prisma as any).job.update({
                where: { id: existing.id },
                data,
              });
              updated++;
            } else {
              await (prisma as any).job.create({
                data: { id: jobIdNum, ...data },
              });
              created++;
            }
          },
          { batchSize: 200, label: "jobs" }
        );
        console.log(
          `[import] done jobs file="${file.name}" created=${created} updated=${updated} skipped=${skipped}`
        );
        batchResults.push({
          file: file.name,
          target: "jobs",
          sheet: chosenSheet,
          total,
          imported: created + updated,
          created,
          updated,
          skipped,
          missingCompany,
          missingLocIn,
          missingLocOut,
        });
        continue;
      }

      // ASSEMBLIES
      if (finalMode === "import:assemblies") {
        let total = rows.length,
          created = 0,
          updated = 0,
          skipped = 0,
          missingJob = 0,
          missingProduct = 0;
        await processRowsInBatches(
          rows,
          async (r, i) => {
            // Assembly ID from FileMaker serial
            const idNum = asNum(pick(r, ["a__Serial"])) as number | null;
            const name = (pick(r, ["NameOverride"]) ?? "").toString().trim();
            const jobIdNum = asNum(
              pick(r, ["a__JobNo", "a_JobNo", "JobNo", "jobno"]) as any
            ) as number | null;
            const productIdNum = asNum(
              pick(r, [
                "a__ProductCode",
                "a_ProductCode",
                "ProductCode",
                "product_code",
                "product code",
                "productcode",
              ]) as any
            ) as number | null;
            const status =
              (pick(r, ["Status"]) ?? "").toString().trim() || null;
            const notes = (pick(r, ["Notes"]) ?? "").toString().trim() || null;
            // Qty breakdown like "0,0,11,12,7,1,0" -> [0,0,11,12,7,1,0]
            const qtyListRaw = (
              pick(r, ["Qty_Ordered_List_c", "Qty_List", "QtyBreakdown"]) ?? ""
            ).toString();
            const qtyOrderedBreakdown = parseIntListPreserveGaps(qtyListRaw);
            if (idNum == null && !name && jobIdNum == null) {
              skipped++;
              return;
            }
            let jobId: number | null = null;
            if (jobIdNum != null) {
              const job = await prisma.job.findUnique({
                where: { id: jobIdNum },
              });
              if (job) jobId = job.id;
              else missingJob++;
            }
            let productId: number | null = null;
            let productVariantSetId: number | null = null;
            if (productIdNum != null) {
              const product = await prisma.product.findUnique({
                where: { id: productIdNum },
                include: { variantSet: { select: { id: true } } },
              });
              if (product) {
                productId = product.id;
                productVariantSetId = (product as any).variantSet?.id ?? null;
              } else missingProduct++;
            }
            const existing =
              idNum != null
                ? await prisma.assembly.findUnique({ where: { id: idNum } })
                : name
                ? await prisma.assembly.findFirst({ where: { name } })
                : null;
            const data: any = {
              name: name || null,
              jobId,
              productId: productId ?? undefined,
              status,
              notes,
              qtyOrderedBreakdown,
              // prefer assembly-sourced variant set when present; fallback to product's
              variantSetId:
                (asNum(pick(r, ["a_VariantSetID", "a__VariantSetID"])) as
                  | number
                  | null) ??
                productVariantSetId ??
                undefined,
            };
            if (existing) {
              await (prisma as any).assembly.update({
                where: { id: existing.id },
                data,
              });
              updated++;
            } else {
              // If we have a FileMaker ID, create with explicit id
              if (idNum != null) {
                await (prisma as any).assembly.create({
                  data: { id: idNum, ...data },
                });
              } else {
                await (prisma as any).assembly.create({ data });
              }
              created++;
            }
          },
          { batchSize: 200, label: "assemblies" }
        );
        console.log(
          `[import] done assemblies file="${file.name}" created=${created} updated=${updated} skipped=${skipped}`
        );
        batchResults.push({
          file: file.name,
          target: "assemblies",
          sheet: chosenSheet,
          total,
          imported: created + updated,
          created,
          updated,
          skipped,
          missingJob,
          missingProduct,
        });
        continue;
      }

      // COSTINGS
      if (finalMode === "import:costings") {
        let total = rows.length,
          created = 0,
          updated = 0,
          skipped = 0,
          missingAssembly = 0,
          missingComponent = 0;
        await processRowsInBatches(
          rows,
          async (r, i) => {
            const costingId = asNum(
              pick(r, ["a__Serial", "a_Serial", "id"])
            ) as number | null;
            const assemblyIdVal = asNum(pick(r, ["a_AssemblyID"])) as
              | number
              | null;
            const assemblyName = (pick(r, ["AssemblyName"]) ?? "")
              .toString()
              .trim();
            const productIdNum = asNum(
              pick(r, [
                "a__ProductCode",
                "a_ProductCode",
                "ProductCode",
                "product_code",
                "product code",
                "productcode",
              ])
            ) as number | null;
            const usageRaw = (pick(r, ["ActivityUsed", "UsageType"]) ?? "")
              .toString()
              .trim();
            const quantityPerUnit = asNum(
              pick(r, [
                "QtyRequiredPerUnit",
                "QuantityPerUnit",
                "QtyPerUnit",
                "Quantity",
              ])
            ) as number | null;
            const unitCost = asNum(
              pick(r, ["Price|Cost_PerUnit", "UnitCost"])
            ) as number | null;
            const salePricePerItem = asNum(pick(r, ["Price|Sale_PerItem"])) as
              | number
              | null;
            const salePricePerUnit = asNum(pick(r, ["Price|Sale_PerUnit"])) as
              | number
              | null;
            const notes =
              (pick(r, ["Label_Notes", "Notes"]) ?? "").toString() || null;
            let assembly: any = null;
            if (assemblyIdVal)
              assembly = await prisma.assembly.findFirst({
                where: { id: assemblyIdVal },
              });
            if (!assembly && assemblyName)
              assembly = await prisma.assembly.findFirst({
                where: { name: assemblyName },
              });
            if (!assembly) {
              missingAssembly++;
              skipped++;
              return;
            }
            const component =
              productIdNum != null
                ? await prisma.product.findUnique({
                    where: { id: productIdNum },
                  })
                : null;
            if (!component) {
              missingComponent++;
              skipped++;
              return;
            }
            const usageType = usageRaw.toLowerCase().startsWith("cut")
              ? "cut"
              : usageRaw.toLowerCase().startsWith("make")
              ? "make"
              : null;
            if (costingId != null) {
              const existing = await prisma.costing.findUnique({
                where: { id: costingId },
              });
              const data: any = {
                assemblyId: assembly.id,
                componentId: component.id,
                usageType: usageType as any,
                componentType: component.type as any,
                quantityPerUnit,
                unitCost,
                salePricePerItem,
                salePricePerUnit,
                notes,
              };
              if (existing) {
                await prisma.costing.update({ where: { id: costingId }, data });
                updated++;
              } else {
                await prisma.costing.create({
                  data: { id: costingId, ...data },
                });
                created++;
              }
            } else {
              await prisma.costing.create({
                data: {
                  assemblyId: assembly.id,
                  componentId: component.id,
                  usageType: usageType as any,
                  componentType: component.type as any,
                  quantityPerUnit,
                  unitCost,
                  salePricePerItem,
                  salePricePerUnit,
                  notes,
                } as any,
              });
              created++;
            }
          },
          { batchSize: 200, label: "costings" }
        );
        console.log(
          `[import] done costings file="${file.name}" created=${created} updated=${updated} skipped=${skipped}`
        );
        batchResults.push({
          file: file.name,
          target: "costings",
          sheet: chosenSheet,
          total,
          imported: created + updated,
          created,
          updated,
          skipped,
          missingAssembly,
          missingComponent,
        });
        continue;
      }

      // ASSEMBLY ACTIVITIES
      if (finalMode === "import:assembly_activities") {
        let total = rows.length,
          created = 0,
          updated = 0,
          skipped = 0,
          missingAssembly = 0,
          missingJob = 0,
          missingProduct = 0,
          missingLocIn = 0,
          missingLocOut = 0;
        await processRowsInBatches(
          rows,
          async (r, i) => {
            // Prefer FileMaker serial as primary key for AssemblyActivity.id
            const activityId = asNum(
              pick(r, ["a__Serial", "a_Serial", "id"])
            ) as number | null;
            const assemblyIdVal = asNum(pick(r, ["a_AssemblyID"])) as
              | number
              | null;
            const jobIdNum = asNum(pick(r, ["a_JobNo"])) as number | null;
            const productIdNum = asNum(
              pick(r, [
                "a__ProductCode",
                "a_ProductCode",
                "ProductCode",
                "product_code",
                "product code",
                "productcode",
              ]) as any
            ) as number | null;
            const name =
              (pick(r, ["AssemblyActivityType"]) ?? "").toString().trim() ||
              null;
            const notes = (pick(r, ["Notes"]) ?? "").toString().trim() || null;
            const activityDate = asDate(
              pick(r, ["ActivityDate"])
            ) as Date | null;
            const quantity = asNum(pick(r, ["Quantity"])) as number | null;
            const qtyBreakdownRaw = (
              pick(r, [
                "QtyBreakdown_List_c",
                "Qty_Breakdown_List",
                "QtyBreakdown",
                "Qty_List",
                "QtyList",
              ]) ?? ""
            ).toString();
            const qtyBreakdown = parseIntListPreserveGaps(qtyBreakdownRaw);
            const qtyFabricConsumed = asNum(pick(r, ["QtyFabricConsumed"])) as
              | number
              | null;
            const qtyFabricConsumedPerUnit = asNum(
              pick(r, ["QtyFabricConsumedPerUnit"])
            ) as number | null;
            const locationInId = asNum(pick(r, ["a_LocationID_In"])) as
              | number
              | null;
            const locationOutId = asNum(pick(r, ["a_LocationID_Out"])) as
              | number
              | null;
            if (!assemblyIdVal && jobIdNum == null && !name) {
              skipped++;
              return;
            }
            const assembly = assemblyIdVal
              ? await prisma.assembly.findFirst({
                  where: { id: assemblyIdVal },
                })
              : null;
            if (!assembly) {
              missingAssembly++;
              return;
            }
            let jobId: number | null = null;
            if (jobIdNum != null) {
              const job = await prisma.job.findUnique({
                where: { id: jobIdNum },
              });
              if (job) jobId = job.id;
              else missingJob++;
            }
            let productId: number | null = null;
            if (productIdNum != null) {
              const product = await prisma.product.findUnique({
                where: { id: productIdNum },
              });
              if (product) productId = product.id;
              else missingProduct++;
            }
            if (locationInId != null) {
              const loc = await prisma.location.findFirst({
                where: { id: locationInId },
              });
              if (!loc) missingLocIn++;
            }
            if (locationOutId != null) {
              const loc = await prisma.location.findFirst({
                where: { id: locationOutId },
              });
              if (!loc) missingLocOut++;
            }

            const dataCreate: any = {
              assemblyId: assembly.id,
              jobId: jobId ?? undefined,
              name,
              notes,
              activityDate,
              productId: productId ?? undefined,
              locationInId: locationInId ?? undefined,
              locationOutId: locationOutId ?? undefined,
              quantity,
              qtyFabricConsumed,
              qtyFabricConsumedPerUnit,
              qtyBreakdown,
            };
            const dataUpdate: any = {
              assemblyId: assembly.id,
              jobId: jobId ?? undefined,
              name,
              notes,
              activityDate,
              productId: productId ?? undefined,
              locationInId: locationInId ?? undefined,
              locationOutId: locationOutId ?? undefined,
              quantity,
              qtyFabricConsumed,
              qtyFabricConsumedPerUnit,
              qtyBreakdown,
            };

            if (activityId != null) {
              const existing = await prisma.assemblyActivity.findUnique({
                where: { id: activityId },
              });
              if (existing) {
                await prisma.assemblyActivity.update({
                  where: { id: activityId },
                  data: dataUpdate,
                });
                updated++;
              } else {
                await prisma.assemblyActivity.create({
                  data: { id: activityId, ...dataCreate } as any,
                });
                created++;
              }
            } else {
              await prisma.assemblyActivity.create({ data: dataCreate as any });
              created++;
            }
          },
          { batchSize: 200, label: "assembly_activities" }
        );
        console.log(
          `[import] done assembly_activities file="${file.name}" created=${created} updated=${updated} skipped=${skipped}`
        );
        batchResults.push({
          file: file.name,
          target: "assembly_activities",
          sheet: chosenSheet,
          total,
          imported: created + updated,
          created,
          updated,
          skipped,
          missingAssembly,
          missingJob,
          missingProduct,
          missingLocIn,
          missingLocOut,
        });
        continue;
      }

      // LOCATIONS
      if (finalMode === "import:locations") {
        let total = rows.length,
          created = 0,
          updated = 0,
          skippedNoName = 0;
        await processRowsInBatches(
          rows,
          async (r, i) => {
            const name = (pick(r, ["name", "location", "location_name"]) ?? "")
              .toString()
              .trim();
            if (!name) {
              skippedNoName++;
              return;
            }
            const notes = pick(r, ["notes", "note"])?.toString() ?? null;
            const existing = await prisma.location.findFirst({
              where: { name },
            });
            if (existing) {
              await prisma.location.update({
                where: { id: existing.id },
                data: { notes },
              });
              updated++;
            } else {
              await prisma.location.create({ data: { name, notes } });
              created++;
            }
          },
          { batchSize: 200, label: "locations" }
        );
        console.log(
          `[import] done locations file="${file.name}" created=${created} updated=${updated} skippedNoName=${skippedNoName}`
        );
        batchResults.push({
          file: file.name,
          target: "locations",
          sheet: chosenSheet,
          total,
          imported: created + updated,
          created,
          updated,
          skippedNoName,
        });
        continue;
      }

      // PRODUCT BATCHES
      if (finalMode === "import:product_batches") {
        let total = rows.length,
          created = 0,
          updated = 0,
          skipped = 0,
          missingProduct = 0,
          missingLocation = 0;
        await processRowsInBatches(
          rows,
          async (r, i) => {
            // Mapping per provided spec
            const idNum = asNum(pick(r, ["a__Serial", "id"])) as number | null;
            const assemblyId = asNum(pick(r, ["a_AssemblyID"])) as
              | number
              | null;
            const jobId = asNum(pick(r, ["a_JobNo"])) as number | null;
            const locationId = asNum(pick(r, ["a_LocationID"])) as
              | number
              | null;
            const productIdNum = asNum(pick(r, ["a_ProductCode"])) as
              | number
              | null;
            const codeMill =
              (pick(r, ["BatchNumber|Mill"]) ?? "").toString().trim() || null;
            const codeSartor =
              (pick(r, ["BatchNumber|Sartor"]) ?? "").toString().trim() || null;
            const createdAt = asDate(pick(r, ["Date"])) as Date | null; // createdAd -> createdAt
            const name = (pick(r, ["Name"]) ?? "").toString().trim() || null;
            const notes = null; // Source -> ignore
            if (productIdNum == null) {
              skipped++;
              return;
            }
            // Verify product exists
            const product = await prisma.product.findUnique({
              where: { id: productIdNum },
            });
            if (!product) {
              missingProduct++;
              return;
            }
            // Validate locationId if provided
            let resolvedLocationId: number | null = null;
            if (locationId != null) {
              const loc = await prisma.location.findUnique({
                where: { id: locationId },
              });
              if (!loc) {
                missingLocation++;
              } else {
                resolvedLocationId = loc.id;
              }
            }
            // Idempotent match by productId + codeMill + codeSartor
            const existing = await prisma.batch.findFirst({
              where: {
                productId: product.id,
                codeMill: codeMill || undefined,
                codeSartor: codeSartor || undefined,
              } as any,
            });
            if (existing) {
              await prisma.batch.update({
                where: { id: existing.id },
                data: {
                  productId: product.id,
                  locationId: resolvedLocationId ?? undefined,
                  assemblyId: assemblyId ?? undefined,
                  jobId: jobId ?? undefined,
                  codeMill,
                  codeSartor,
                  name,
                  ...(createdAt ? { createdAt } : {}),
                } as any,
              });
              updated++;
            } else {
              await prisma.batch.create({
                data: {
                  ...(idNum != null ? { id: idNum } : {}),
                  productId: product.id,
                  locationId: resolvedLocationId ?? undefined,
                  assemblyId: assemblyId ?? undefined,
                  jobId: jobId ?? undefined,
                  codeMill,
                  codeSartor,
                  name,
                  ...(createdAt ? { createdAt } : {}),
                } as any,
              });
              created++;
            }
          },
          { batchSize: 200, label: "product_batches" }
        );
        console.log(
          `[import] done product_batches file="${file.name}" created=${created} updated=${updated} skipped=${skipped}`
        );
        batchResults.push({
          file: file.name,
          target: "product_batches",
          sheet: chosenSheet,
          total,
          imported: created + updated,
          created,
          updated,
          skipped,
          missingProduct,
          missingLocation,
        });
        continue;
      }

      // PRODUCT LOCATIONS
      if (finalMode === "import:product_locations") {
        let total = rows.length,
          created = 0,
          updated = 0,
          skipped = 0,
          missingProduct = 0,
          missingLocation = 0;
        await processRowsInBatches(
          rows,
          async (r, i) => {
            const productIdNum = asNum(
              pick(r, ["product_code", "product code", "code", "sku"]) as any
            ) as number | null;
            const locationName = (
              pick(r, ["location_name", "location", "loc"]) ?? ""
            )
              .toString()
              .trim();
            const qty = asNum(
              pick(r, ["quantity", "qty", "qty_on_hand", "on hand"])
            ) as number | null;
            if (productIdNum == null || !locationName) {
              skipped++;
              return;
            }
            const product = await prisma.product.findUnique({
              where: { id: productIdNum },
            });
            if (!product) {
              missingProduct++;
              return;
            }
            const location = await prisma.location.findFirst({
              where: { name: locationName },
            });
            if (!location) {
              missingLocation++;
              return;
            }
            // Create or update a synthetic INIT batch using codeSartor as the unique key
            const codeSartor = `INIT-${productIdNum}-${locationName}`;
            const existing = await prisma.batch.findFirst({
              where: {
                productId: product.id,
                locationId: location.id,
                codeSartor,
              } as any,
            });
            if (existing) {
              await prisma.batch.update({
                where: { id: existing.id },
                data: {
                  // We don't store quantity directly in batches anymore
                  name: existing.name ?? null,
                  notes: qty != null ? `Init qty hint: ${qty}` : existing.notes,
                } as any,
              });
              updated++;
            } else {
              await prisma.batch.create({
                data: {
                  productId: product.id,
                  locationId: location.id,
                  codeSartor,
                  name: null,
                  receivedAt: null,
                  notes:
                    qty != null
                      ? `Imported from Product_Locations (init qty hint: ${qty})`
                      : "Imported from Product_Locations",
                } as any,
              });
              created++;
            }
          },
          { batchSize: 200, label: "product_locations" }
        );
        console.log(
          `[import] done product_locations file="${file.name}" created=${created} updated=${updated} skipped=${skipped}`
        );
        batchResults.push({
          file: file.name,
          target: "product_locations",
          sheet: chosenSheet,
          total,
          imported: created + updated,
          created,
          updated,
          skipped,
          missingProduct,
          missingLocation,
        });
        continue;
      }

      // VARIANT SETS
      if (finalMode === "import:variant_sets") {
        let total = rows.length,
          created = 0,
          updated = 0,
          skipped = 0;
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const idNum = asNum(pick(r, ["a__Serial", "id"])) as number | null;
          const name = (pick(r, ["Name", "name"]) ?? "").toString().trim();
          const labelsRaw = (
            pick(r, [
              "VariantLabel_List_c",
              "VariantLabel_List",
              "VariantLabelList",
              "Variants",
              "VariantList",
              "values",
            ]) ?? ""
          ).toString();
          const variants = parseStringListPreserveGaps(labelsRaw);
          if (!name && idNum == null && variants.length === 0) {
            skipped++;
            continue;
          }
          const createdBy =
            (pick(r, ["Record_CreatedBy"]) ?? "").toString().trim() || null;
          const createdAt = asDate(
            pick(r, ["Record_CreatedTimestamp"])
          ) as Date | null;
          const modifiedBy =
            (pick(r, ["Record_ModifiedBy"]) ?? "").toString().trim() || null;
          const updatedAt = asDate(
            pick(r, ["Record_ModifiedTimestamp"])
          ) as Date | null;
          const existing =
            idNum != null
              ? await prisma.variantSet.findUnique({ where: { id: idNum } })
              : await prisma.variantSet.findFirst({ where: { name } });
          const data: any = {
            name: name || null,
            variants,
            createdBy,
            modifiedBy,
          };
          if (createdAt) data.createdAt = createdAt;
          if (updatedAt) data.updatedAt = updatedAt;
          if (existing) {
            await prisma.variantSet.update({
              where: { id: existing.id },
              data,
            });
            updated++;
          } else {
            if (idNum != null) {
              await prisma.variantSet.create({
                data: { id: idNum, ...data },
              });
            } else {
              await prisma.variantSet.create({ data });
            }
            created++;
          }
          if (i > 0 && i % 100 === 0)
            console.log(`[import] variant_sets ${i}/${total}`);
        }
        console.log(
          `[import] done variant_sets file="${file.name}" created=${created} updated=${updated} skipped=${skipped}`
        );
        batchResults.push({
          file: file.name,
          target: "variant_sets",
          sheet: chosenSheet,
          total,
          imported: created + updated,
          created,
          updated,
          skipped,
        });
        continue;
      }

      // PRODUCT MOVEMENTS
      if (finalMode === "import:product_movements") {
        let total = rows.length,
          created = 0,
          updated = 0,
          skipped = 0,
          missingProduct = 0;
        const getSkuMap = async () => {
          const bySku = new Map<string, number>();
          const all = await prisma.product.findMany({
            select: { id: true, sku: true },
          });
          for (const p of all)
            if (p.sku) bySku.set(p.sku.trim().toUpperCase(), p.id);
          return bySku;
        };
        const skuMap = await getSkuMap();

        await processRowsInBatches(
          rows,
          async (r, i) => {
            const serial = asNum(pick(r, ["a__Serial", "a_Serial", "id"])) as
              | number
              | null;
            const type =
              (pick(r, ["Type", "type"]) ?? "").toString().trim() || null;
            const createdAt = asDate(
              pick(r, ["Date", "date", "movement_date"])
            ) as Date | null;
            const fromRaw = pick(r, [
              "a_LocationID_Out",
              "Movement_From",
            ]) as any;
            const toRaw = pick(r, ["a_LocationID_In", "Movement_To"]) as any;
            const shippingType =
              (pick(r, ["ShippingType"]) ?? "").toString().trim() || null;
            const qty = asNum(pick(r, ["Quantity", "Qty", "quantity"])) as
              | number
              | null;
            const productCodeRaw = (
              pick(r, ["a_ProductCode", "ProductCode", "product_code"]) ?? ""
            )
              .toString()
              .trim();
            // resolve productId from SKU or numeric id
            let productId: number | null = null;
            if (/^\d+$/.test(productCodeRaw)) {
              const pid = Number(productCodeRaw);
              const p = await prisma.product.findUnique({ where: { id: pid } });
              if (p) productId = p.id;
            } else if (productCodeRaw) {
              const key = productCodeRaw.toUpperCase();
              productId = skuMap.get(key) ?? null;
            }
            // resolve direction
            const t = (type || "").toLowerCase();
            const outTypes = new Set([
              "out",
              "issue",
              "consume",
              "ship",
              "sale",
              "deliver",
              "adjust_out",
              "transfer_out",
              "shipping (out)",
              "po (return)",
              "assembly",
              "expense",
            ]);
            const isOut = outTypes.has(t);
            const locationOutId = isOut
              ? (asNum(fromRaw) as number | null)
              : null;
            const locationInId = !isOut
              ? (asNum(toRaw) as number | null)
              : null;
            if (!type && !createdAt && productId == null && qty == null) {
              skipped++;
              return;
            }
            if (productId == null) {
              missingProduct++;
              return;
            }
            const data: any = {
              id: serial ?? undefined,
              movementType: type,
              date: createdAt,
              shippingType,
              productId,
              quantity: qty,
              locationInId,
              locationOutId,
            };
            const existing = serial
              ? await prisma.productMovement.findUnique({
                  where: { id: serial },
                })
              : null;
            if (existing) {
              await prisma.productMovement.update({
                where: { id: existing.id },
                data,
              });
              updated++;
            } else {
              await prisma.productMovement.create({ data });
              created++;
            }
          },
          { batchSize: 200, label: "product_movements" }
        );
        console.log(
          `[import] done product_movements file="${file.name}" created=${created} updated=${updated} skipped=${skipped} missingProduct=${missingProduct}`
        );
        batchResults.push({
          file: file.name,
          target: "product_movements",
          sheet: chosenSheet,
          total,
          imported: created + updated,
          created,
          updated,
          skipped,
          missingProduct,
        });
        continue;
      }

      // PRODUCT MOVEMENT LINES
      if (finalMode === "import:product_movement_lines") {
        let total = rows.length,
          created = 0,
          updated = 0,
          skipped = 0,
          missingMovement = 0,
          missingProduct = 0,
          missingBatch = 0;
        // Track foreign key errors for debugging (e.g., invalid batchId)
        let missingBatchFK = 0;
        const fkErrorSamples: any[] = [];
        // Auto-regeneration counters
        let regenBatchesCreated = 0;
        let regenRetrySucceeded = 0;
        // Cache regen batch ids per product to avoid repeated creates
        const regenCache = new Map<number, number>();
        const getOrCreateRegenBatch = async (productIdNonNull: number) => {
          if (regenCache.has(productIdNonNull)) {
            const id = regenCache.get(productIdNonNull)!;
            return await prisma.batch.findUnique({ where: { id } });
          }
          const prod = await prisma.product.findUnique({
            where: { id: productIdNonNull },
            select: { name: true },
          });
          const codeSartor = `REGEN-${productIdNonNull}`;
          const name = `Regen [${productIdNonNull}] ${prod?.name ?? ""}`.trim();
          // First try to find an existing regen batch for this product
          const existing = await prisma.batch.findFirst({
            where: {
              productId: productIdNonNull,
              OR: [
                { codeSartor },
                { name: { startsWith: `Regen [${productIdNonNull}]` } as any },
              ],
            } as any,
            orderBy: { id: "desc" as const },
          });
          if (existing) {
            regenCache.set(productIdNonNull, existing.id);
            return existing;
          }
          // Create with retries, handling possible sequence drift on id
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const created = await prisma.batch.create({
                data: {
                  productId: productIdNonNull,
                  name,
                  codeSartor,
                  notes:
                    "Auto-created during import due to missing referenced batch",
                } as any,
              });
              regenBatchesCreated++;
              regenCache.set(productIdNonNull, created.id);
              return created;
            } catch (ce: any) {
              // Handle identity/sequence drift on id
              if (
                ce?.code === "P2002" &&
                Array.isArray(ce?.meta?.target) &&
                ce.meta.target.includes("id")
              ) {
                const agg = await prisma.batch.aggregate({
                  _max: { id: true },
                });
                const nextId = ((agg as any)?._max?.id ?? 0) + 1 + attempt;
                const created = await prisma.batch.create({
                  data: {
                    id: nextId,
                    productId: productIdNonNull,
                    name,
                    codeSartor,
                    notes:
                      "Auto-created during import due to missing referenced batch (sequence drift)",
                  } as any,
                });
                regenBatchesCreated++;
                regenCache.set(productIdNonNull, created.id);
                return created;
              }
              // If codeSartor/name conflict or other race, try to find again
              const again = await prisma.batch.findFirst({
                where: { productId: productIdNonNull, codeSartor } as any,
                orderBy: { id: "desc" as const },
              });
              if (again) {
                regenCache.set(productIdNonNull, again.id);
                return again;
              }
              if (attempt === 2) throw ce;
            }
          }
          // Fallback (should not happen due to returns above)
          throw new Error("Failed to create regen batch after retries");
        };
        const getSkuMap = async () => {
          const bySku = new Map<string, number>();
          const all = await prisma.product.findMany({
            select: { id: true, sku: true },
          });
          for (const p of all)
            if (p.sku) bySku.set(p.sku.trim().toUpperCase(), p.id);
          return bySku;
        };
        const skuMap = await getSkuMap();
        // Pre-scan: determine which products will need a regen batch because their provided batchId is missing
        // and align the Batch.id sequence to avoid unique id collisions under concurrency.
        try {
          // Align sequence/identity to max(id) so auto-increment won't reuse existing ids.
          const agg = await prisma.batch.aggregate({ _max: { id: true } });
          const maxId = (agg as any)?._max?.id ?? 0;
          // Try via pg_get_serial_sequence (works for serial/identity); fallback to ALTER TABLE RESTART
          try {
            await prisma.$executeRawUnsafe(
              `SELECT setval(pg_get_serial_sequence('"Batch"','id'), ${Number(
                maxId
              )})`
            );
          } catch (_) {
            try {
              await prisma.$executeRawUnsafe(
                `ALTER TABLE "Batch" ALTER COLUMN id RESTART WITH ${
                  Number(maxId) + 1
                }`
              );
            } catch {
              // ignore if not supported
            }
          }
        } catch {
          // ignore sequence alignment errors
        }

        try {
          // Collect distinct candidate batchIds from the file
          const distinctBatchIds: number[] = Array.from(
            new Set(
              rows
                .map((r: any) => asNum(pick(r, ["a_BatchID"])) as number | null)
                .filter(
                  (n): n is number =>
                    typeof n === "number" && Number.isFinite(n)
                )
            )
          );
          const existing = distinctBatchIds.length
            ? await prisma.batch.findMany({
                select: { id: true },
                where: { id: { in: distinctBatchIds } },
              })
            : [];
          const existingBatchIdSet = new Set(existing.map((b) => b.id));

          // Resolve productIds per row and collect those needing regen (invalid/missing batchId)
          const needsRegen = new Set<number>();
          for (const r of rows as any[]) {
            const productCodeRaw = (
              pick(r, ["a_ProductCode", "ProductCode", "product_code"]) ?? ""
            )
              .toString()
              .trim();
            if (!productCodeRaw) continue;
            let productId: number | null = null;
            if (/^\d+$/.test(productCodeRaw)) {
              const pid = Number(productCodeRaw);
              const p = await prisma.product.findUnique({
                where: { id: pid },
                select: { id: true },
              });
              if (p) productId = p.id;
            } else {
              productId = skuMap.get(productCodeRaw.toUpperCase()) ?? null;
            }
            if (productId == null) continue;
            const batchId = asNum(pick(r, ["a_BatchID"])) as number | null;
            if (batchId != null && !existingBatchIdSet.has(batchId)) {
              needsRegen.add(productId);
            }
          }
          if (needsRegen.size > 0) {
            console.log(
              `[import] product_movement_lines pre-scan: precreating regen batches for ${needsRegen.size} product(s)`
            );
            // Create sequentially to avoid cross-product create races
            for (const pid of needsRegen) {
              try {
                await getOrCreateRegenBatch(pid);
              } catch (e) {
                console.error(
                  "[import] pre-scan regen create failed",
                  { productId: pid },
                  e
                );
              }
            }
          }
        } catch (e) {
          console.warn(
            "[import] product_movement_lines pre-scan step skipped due to error",
            e
          );
        }
        await processRowsInBatches(
          rows,
          async (r, i) => {
            // ID of this movement line
            const lineId = asNum(pick(r, ["a__Serial", "a_Serial", "id"])) as
              | number
              | null;
            // FK to the movement header
            const movementIdVal = asNum(
              pick(r, ["a_ProductMovementID", "product_movement_id"])
            ) as number | null;
            // Product code (SKU or numeric Product.id)
            const productCodeRaw = (
              pick(r, ["a_ProductCode", "ProductCode", "product_code"]) ?? ""
            )
              .toString()
              .trim();
            const qty = asNum(pick(r, ["Quantity", "quantity", "qty"])) as
              | number
              | null;
            const notes = pick(r, ["notes", "note"])?.toString() ?? null;
            const createdAt = asDate(pick(r, ["Date", "date"])) as Date | null;
            const costingId = asNum(pick(r, ["a_AssemblyLineID"])) as
              | number
              | null;
            const batchId = asNum(pick(r, ["a_BatchID"])) as number | null;
            const purchaseOrderLineId = asNum(
              pick(r, ["a_PurchaseOrderLineID"])
            ) as number | null;

            // Ignore MovementQty, MovementType, QtyBatchBalance_* as per spec

            if (movementIdVal == null || !productCodeRaw || qty == null) {
              skipped++;
              return;
            }
            const movement = await prisma.productMovement.findUnique({
              where: { id: movementIdVal },
            });
            if (!movement) {
              missingMovement++;
              return;
            }
            // resolve product from code
            let productId: number | null = null;
            if (/^\d+$/.test(productCodeRaw)) {
              const pid = Number(productCodeRaw);
              const p = await prisma.product.findUnique({ where: { id: pid } });
              if (p) productId = p.id;
            } else if (productCodeRaw) {
              productId = skuMap.get(productCodeRaw.toUpperCase()) ?? null;
            }
            if (productId == null) {
              missingProduct++;
              return;
            }

            const data: any = {
              movementId: movement.id,
              productId,
              quantity: qty,
              notes,
              // scalar mirror fields for reference/auditing
              productMovementId: movement.id,
              costingId: costingId ?? undefined,
              batchId: batchId ?? undefined,
              purchaseOrderLineId: purchaseOrderLineId ?? undefined,
            } as any;
            if (createdAt) data.createdAt = createdAt;

            // Preflight: resolve invalid/missing batch references before attempting write
            let desiredBatchId: number | undefined = (batchId ?? undefined) as
              | number
              | undefined;
            // If provided batchId doesn't exist, generate/lookup regen batch for this product
            if (desiredBatchId != null) {
              const b = await prisma.batch.findUnique({
                where: { id: desiredBatchId },
              });
              if (!b) {
                const regen = await getOrCreateRegenBatch(productId);
                if (regen) desiredBatchId = regen.id;
                else desiredBatchId = undefined;
              }
            }
            // If updating an existing line with a stale/missing batchId, repair it as well
            let existing: any = null;
            if (lineId != null) {
              existing = await prisma.productMovementLine.findUnique({
                where: { id: lineId },
              });
              if (existing && existing.batchId != null) {
                const eb = await prisma.batch.findUnique({
                  where: { id: existing.batchId },
                });
                if (!eb) {
                  const regen = await getOrCreateRegenBatch(productId);
                  if (regen) desiredBatchId = desiredBatchId ?? regen.id;
                }
              }
            }
            if (desiredBatchId != null) data.batchId = desiredBatchId;

            try {
              if (lineId != null) {
                if (existing) {
                  await prisma.productMovementLine.update({
                    where: { id: lineId },
                    data,
                  });
                  updated++;
                } else {
                  await prisma.productMovementLine.create({
                    data: { id: lineId, ...data },
                  });
                  created++;
                }
              } else {
                await prisma.productMovementLine.create({ data });
                created++;
              }
            } catch (e: any) {
              // Catch FK constraint violations (e.g., invalid batchId)
              if (e && e.code === "P2003") {
                const field = String(e?.meta?.field_name || "");
                // Only handle missing batch FK by creating a regen batch
                if (
                  field.includes("ProductMovementLine_batchId_fkey") &&
                  productId != null
                ) {
                  missingBatchFK++;
                  try {
                    const regen = await getOrCreateRegenBatch(productId);
                    if (!regen) throw new Error("regen batch not created");
                    // Retry with new batchId
                    const retryData = { ...data, batchId: regen.id } as any;
                    if (lineId != null) {
                      const exists2 =
                        await prisma.productMovementLine.findUnique({
                          where: { id: lineId },
                        });
                      if (exists2) {
                        await prisma.productMovementLine.update({
                          where: { id: lineId },
                          data: retryData,
                        });
                        updated++;
                      } else {
                        await prisma.productMovementLine.create({
                          data: { id: lineId, ...retryData },
                        });
                        created++;
                      }
                    } else {
                      await prisma.productMovementLine.create({
                        data: retryData,
                      });
                      created++;
                    }
                    regenRetrySucceeded++;
                    return; // proceed to next row
                  } catch (regenErr) {
                    const sample = {
                      rowIndex: i,
                      lineId,
                      movementId: movement.id,
                      productId,
                      originalBatchId: batchId,
                      qty,
                      notes,
                      meta: (regenErr as any)?.meta,
                    };
                    if (fkErrorSamples.length < 5) fkErrorSamples.push(sample);
                    console.error(
                      "[import] product_movement_lines regen failed",
                      sample,
                      regenErr
                    );
                    skipped++;
                    return;
                  }
                } else {
                  const sample = {
                    rowIndex: i,
                    lineId,
                    movementId: movement.id,
                    productId,
                    batchId,
                    qty,
                    notes,
                    meta: e.meta,
                  };
                  if (fkErrorSamples.length < 5) fkErrorSamples.push(sample);
                  console.error(
                    "[import] product_movement_lines FK error (P2003)",
                    sample
                  );
                  skipped++;
                  return;
                }
              }
              console.error(
                "[import] product_movement_lines unexpected error",
                e
              );
              skipped++;
              return;
            }
          },
          { batchSize: 200, label: "product_movement_lines" }
        );
        console.log(
          `[import] done product_movement_lines file="${file.name}" created=${created} updated=${updated} skipped=${skipped} missingBatchFK=${missingBatchFK} regenBatches=${regenBatchesCreated} regenSuccess=${regenRetrySucceeded}`
        );
        batchResults.push({
          file: file.name,
          target: "product_movement_lines",
          sheet: chosenSheet,
          total,
          imported: created + updated,
          created,
          updated,
          skipped,
          missingMovement,
          missingProduct,
          missingBatch,
          // surfaced for UI notes (keys starting with 'missing' are shown)
          missingBatchFK,
          regenBatchesCreated,
          regenRetrySucceeded,
          // raw samples for debugging (not shown in UI table but present in payload)
          fkErrorSamples,
        });
        continue;
      }

      // PRODUCT LINES
      if (finalMode === "import:product_lines") {
        let total = rows.length,
          created = 0,
          updated = 0,
          skipped = 0,
          missingParent = 0,
          missingChild = 0;
        await processRowsInBatches(
          rows,
          async (r, i) => {
            // Explicit id
            const idNum = asNum(pick(r, ["a__Serial", "a_Serial", "id"])) as
              | number
              | null;
            // Parent id mapping
            const parentIdNum = asNum(
              pick(r, [
                "a_ProductCode|Parent",
                "parent_id",
                "parent_code",
                "parent",
                "parent product",
              ]) as any
            ) as number | null;
            // Child id mapping
            const childIdNum = asNum(
              pick(r, [
                "a_ProductCode",
                "child_id",
                "child_code",
                "child",
                "component_code",
                "component",
              ]) as any
            ) as number | null;
            const quantity = asNum(pick(r, ["Quantity", "quantity", "qty"])) as
              | number
              | null;
            const unitCost = asNum(
              pick(r, ["UnitCost", "unit_cost", "cost", "unit cost"])
            ) as number | null;
            const unitCostManual = asNum(
              pick(r, ["UnitCost_Manual", "unit_cost_manual"])
            ) as number | null;
            const flagAssemblyOmit = asBool(
              pick(r, ["Flag_AssemblyOmit", "flag_assembly_omit"])
            ) as boolean | null;
            const activityUsed =
              (pick(r, ["ActivityUsed", "activity_used"]) ?? "")
                .toString()
                .trim() || null;

            if (parentIdNum == null || childIdNum == null) {
              skipped++;
              return;
            }
            const parent = await prisma.product.findUnique({
              where: { id: parentIdNum },
            });
            if (!parent) {
              missingParent++;
              return;
            }
            const child = await prisma.product.findUnique({
              where: { id: childIdNum },
            });
            if (!child) {
              missingChild++;
              return;
            }

            const data: any = {
              parentId: parent.id,
              childId: child.id,
              quantity,
              unitCost,
              unitCostManual,
              activityUsed,
              flagAssemblyOmit: flagAssemblyOmit ?? undefined,
            };

            if (idNum != null) {
              const existing = await prisma.productLine.findUnique({
                where: { id: idNum },
              });
              if (existing) {
                await prisma.productLine.update({ where: { id: idNum }, data });
                updated++;
              } else {
                await prisma.productLine.create({
                  data: { id: idNum, ...data },
                });
                created++;
              }
            } else {
              await prisma.productLine.create({ data });
              created++;
            }
          },
          { batchSize: 200, label: "product_lines" }
        );
        console.log(
          `[import] done product_lines file="${file.name}" created=${created} updated=${updated} skipped=${skipped}`
        );
        batchResults.push({
          file: file.name,
          target: "product_lines",
          sheet: chosenSheet,
          total,
          imported: created + updated,
          created,
          updated,
          skipped,
          missingParent,
          missingChild,
        });
        continue;
      }

      batchResults.push({
        file: file.name,
        error: `Import mode not implemented: ${finalMode}`,
      });
    }

    return json({ batchImport: batchResults });
  }
  // Non-multipart fallback for value list deletes
  const form = await request.formData();
  const intent = form.get("_intent");
  if (intent === "valueList.delete") {
    const id = Number(form.get("id"));
    if (id) await prisma.valueList.delete({ where: { id } });
    const values = await prisma.valueList.findMany({
      orderBy: [{ type: "asc" }, { label: "asc" }],
    });
    return json({ values, message: "Value deleted" });
  }

  return json({});
}

export default function AdminRoute() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as any;
  const submit = useSubmit();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  const valueForm = useForm<{
    code: string | null;
    label: string | null;
    type: string | null;
    value: number | null;
  }>({
    defaultValues: { code: "", label: "", type: "", value: null },
  });

  const values: any[] = actionData?.values ?? loaderData.values ?? [];

  return (
    <Stack gap="xl">
      <Title order={2}>Admin</Title>

      <section>
        <Title order={4} mb="sm">
          Value Lists
        </Title>
        <form
          onSubmit={valueForm.handleSubmit((v) => {
            const fd = new FormData();
            fd.set("_intent", "valueList.create");
            if (v.code) fd.set("code", v.code);
            if (v.label) fd.set("label", v.label);
            if (v.type) fd.set("type", v.type);
            if (v.value != null) fd.set("value", String(v.value));
            submit(fd, { method: "post", encType: "multipart/form-data" });
          })}
        >
          <Group align="flex-end" wrap="wrap">
            <TextInput label="Code" w={140} {...valueForm.register("code")} />
            <TextInput label="Label" w={180} {...valueForm.register("label")} />
            <TextInput label="Type" w={160} {...valueForm.register("type")} />
            <Controller
              name="value"
              control={valueForm.control}
              render={({ field }) => (
                <NumberInput
                  label="Value"
                  w={140}
                  value={field.value ?? undefined}
                  onChange={(v) => field.onChange(v === "" ? null : Number(v))}
                  allowDecimal
                />
              )}
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Add"}
            </Button>
          </Group>
        </form>

        <Table
          striped
          withTableBorder
          withColumnBorders
          highlightOnHover
          mt="md"
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Code</Table.Th>
              <Table.Th>Label</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Value</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {values.map((vl) => (
              <Table.Tr key={vl.id}>
                <Table.Td>{vl.id}</Table.Td>
                <Table.Td>{vl.code}</Table.Td>
                <Table.Td>{vl.label}</Table.Td>
                <Table.Td>{vl.type}</Table.Td>
                <Table.Td>{vl.value}</Table.Td>
                <Table.Td>
                  <Button
                    variant="light"
                    color="red"
                    disabled={busy}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("_intent", "valueList.delete");
                      fd.set("id", String(vl.id));
                      submit(fd, { method: "post" });
                    }}
                  >
                    Delete
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </section>

      <Divider my="md" />

      <section>
        <Title order={4} mb="sm">
          Excel Import (Batch)
        </Title>
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
                <option value="import:variant_sets">
                  Import: Variant Sets
                </option>
                <option value="import:locations">Import: Locations</option>
                <option value="import:product_batches">
                  Import: Product Batches
                </option>
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
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Updated</Table.Th>
                  <Table.Th>Notes</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {actionData.batchImport.map((r: any, idx: number) => (
                  <Table.Tr key={idx}>
                    <Table.Td>{r.file}</Table.Td>
                    <Table.Td>{r.target || (r.error ? "-" : "?")}</Table.Td>
                    <Table.Td>{r.sheet || "-"}</Table.Td>
                    <Table.Td>{r.total ?? "-"}</Table.Td>
                    <Table.Td>{r.imported ?? "-"}</Table.Td>
                    <Table.Td>{r.created ?? "-"}</Table.Td>
                    <Table.Td>{r.updated ?? "-"}</Table.Td>
                    <Table.Td>
                      {r.error ||
                        Object.entries(r)
                          .filter(
                            ([k]) =>
                              k.startsWith("missing") || k.startsWith("skipped")
                          )
                          .map(([k, v]) => `${k}:${v}`)
                          .join(", ")}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        )}
      </section>
    </Stack>
  );
}
