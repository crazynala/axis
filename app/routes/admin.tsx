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
import { prisma } from "app/utils/prisma.server";
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
    if (intent === "valueList.delete") {
      const id = Number(form.get("id"));
      if (id) await prisma.valueList.delete({ where: { id } });
      const values = await prisma.valueList.findMany({
        orderBy: [{ type: "asc" }, { label: "asc" }],
      });
      return json({ values, message: "Value deleted" });
    }

    if (intent === "uploadExcel") {
      const all = form.getAll("file");
      const files = all.filter((f) => f && typeof f !== "string") as File[];
      if (!files.length)
        return json({ error: "No file(s) provided" }, { status: 400 });
      const uploadMode = ((form.get("mode") as string) || "auto").toLowerCase();
      const sheetNameOverride =
        ((form.get("sheetName") as string) || "").trim() || null;

      const inferMode = (fname: string): string | null => {
        const n = fname.toLowerCase();
        if (
          n.startsWith("variantset") ||
          n.includes("variant_set") ||
          n.includes("variant-sets") ||
          n.includes("variantsets")
        )
          return "import:variant_sets";
        if (n.includes("product_movement_lines"))
          return "import:product_movement_lines";
        if (n.includes("product_movements")) return "import:product_movements";
        if (n.includes("product_batches")) return "import:product_batches";
        if (n.includes("product_locations")) return "import:product_locations";
        if (n.includes("productlines") || n.includes("product_lines"))
          return "import:product_lines";
        if (n.includes("costings") || n.includes("costing"))
          return "import:costings";
        if (
          n.includes("assembly_activities") ||
          n.includes("assemblyactivities")
        )
          return "import:assembly_activities";
        if (n.includes("assemblies") || n.includes("assembly_"))
          return "import:assemblies";
        if (n.includes("locations") || n.includes("location"))
          return "import:locations";
        if (n.includes("jobs") || n.includes("job")) return "import:jobs";
        if (n.includes("companies") || n.includes("company"))
          return "import:companies";
        if (n.includes("product")) return "import:products";
        return null;
      };

      // Dependency-aware processing order
      const modePriority: Record<string, number> = {
        "import:companies": 10,
        "import:locations": 20,
        "import:variant_sets": 25,
        "import:products": 30,
        "import:jobs": 40,
        "import:assemblies": 50,
        "import:costings": 60,
        "import:assembly_activities": 70,
        "import:product_batches": 80,
        "import:product_locations": 90,
        "import:product_movements": 100,
        "import:product_movement_lines": 110,
        "import:product_lines": 120,
      };

      const normalizeKey = (s: any) =>
        String(s)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_");
      const truthy = new Set(["y", "yes", "true", "1", "t", "on", "x"]);
      const asBool = (v: any) =>
        typeof v === "string" ? truthy.has(v.trim().toLowerCase()) : Boolean(v);
      const asNum = (v: any) => {
        if (v === null || v === undefined || v === "") return null;
        const n =
          typeof v === "number" ? v : Number(String(v).replace(/[\s,]/g, ""));
        return Number.isFinite(n) ? n : null;
      };
      const asDate = (v: any): Date | null => {
        if (v == null || v === "") return null;
        if (v instanceof Date) return v;
        if (typeof v === "number") {
          const epoch = new Date(Date.UTC(1899, 11, 30));
          const ms = v * 24 * 60 * 60 * 1000;
          if (isFinite(ms)) return new Date(epoch.getTime() + ms);
        }
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
      };
      const pick = (row: any, names: string[]) => {
        const map: Record<string, any> = {};
        for (const key of Object.keys(row)) map[normalizeKey(key)] = row[key];
        for (const n of names) {
          const v = map[normalizeKey(n)];
          if (v !== undefined) return v;
        }
        return undefined;
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
            const variants = labelsRaw
              .split(",")
              .map((s: string) => s.trim())
              .filter((s: string) => s.length > 0);
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

        // PRODUCTS
        if (finalMode === "import:products") {
          let imported = 0,
            created = 0,
            updated = 0,
            skippedNoId = 0,
            skuRenamed = 0;
          const total = rows.length;
          // Ensure SKU remains unique; append -dup, -dup2, ... on conflicts
          const getUniqueSku = async (
            desired: string | null,
            currentId?: number | null
          ): Promise<string | null> => {
            if (!desired) return null;
            let candidate = desired.trim();
            if (!candidate) return null;
            let n = 1;
            while (true) {
              const clash = await prisma.product.findFirst({
                where: { sku: candidate },
              });
              if (!clash || (currentId != null && clash.id === currentId)) {
                return candidate;
              }
              n += 1;
              candidate = n === 2 ? `${desired}-dup` : `${desired}-dup${n - 1}`;
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
          let missingVariantSet = 0,
            linkedVariantSet = 0;
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const idNum = asNum(pick(r, idKeys)) as number | null;
            if (idNum == null) {
              skippedNoId++;
              continue;
            }
            // code (legacy) ignored; use id/sku/name instead
            const code = "";
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
              } else {
                missingVariantSet++;
              }
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
                  // Only set variantSetId when provided and valid
                  ...(resolvedVariantSetId != null
                    ? { variantSetId: resolvedVariantSetId }
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
                } as any,
              });
              created++;
            }
            imported++;
            if (i > 0 && i % 100 === 0)
              console.log(`[import] products ${i}/${total}`);
          }
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
          });
          continue;
        }

        // COMPANIES
        if (finalMode === "import:companies") {
          let total = rows.length,
            created = 0,
            updated = 0,
            skipped = 0;
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const idNum = asNum(pick(r, ["a__Serial"])) as number | null;
            const name = (pick(r, ["Company"]) ?? "").toString().trim();
            if (!name && idNum == null) {
              skipped++;
              continue;
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
            const existing = await prisma.company.findFirst({
              where: { name },
            });
            const data: any = {
              name,
              type,
              email,
              phone,
              notes:
                [
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
              await prisma.company.create({ data: data as any });
              created++;
            }
            if (i > 0 && i % 100 === 0)
              console.log(`[import] companies ${i}/${total}`);
          }
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
          const getUniqueProjectCode = async (
            desired: string | null,
            currentId?: number | null
          ): Promise<string | null> => {
            const base = (desired || "").trim();
            if (!base) return null;
            let candidate = base;
            let n = 1;
            while (true) {
              const clash = await prisma.job.findFirst({
                where: { projectCode: candidate },
              });
              if (!clash || (currentId != null && clash.id === currentId)) {
                return candidate;
              }
              n += 1;
              candidate = n === 2 ? `${base}-dup` : `${base}-dup${n - 1}`;
            }
          };
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
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
            const projectCode = (projectCodeRaw || jobNoRaw || "").trim();
            const name = (pick(r, ["JobName"]) ?? "").toString().trim();
            if (jobIdNum == null) {
              skipped++;
              continue;
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
              projectCode: await getUniqueProjectCode(projectCode, jobIdNum),
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
            if (i > 0 && i % 100 === 0)
              console.log(`[import] jobs ${i}/${total}`);
          }
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
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
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
            const qtyOrderedBreakdown = qtyListRaw
              .split(/[,|;\s]+/)
              .map((s: string) => s.trim())
              .filter((s: string) => s.length > 0)
              .map((s: string) =>
                Number.isFinite(Number(s)) ? Math.trunc(Number(s)) : 0
              );
            if (idNum == null && !name && jobIdNum == null) {
              skipped++;
              continue;
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
            if (i > 0 && i % 100 === 0)
              console.log(`[import] assemblies ${i}/${total}`);
          }
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
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
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
              continue;
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
              continue;
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
            if (i > 0 && i % 100 === 0)
              console.log(`[import] costings ${i}/${total}`);
          }
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
            skipped = 0,
            missingAssembly = 0,
            missingJob = 0,
            missingProduct = 0,
            missingLocIn = 0,
            missingLocOut = 0;
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
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
            const qtyBreakdown = qtyBreakdownRaw
              .split(/[,|;\s]+/)
              .map((s: string) => s.trim())
              .filter((s: string) => s.length > 0)
              .map((s: string) =>
                Number.isFinite(Number(s)) ? Math.trunc(Number(s)) : 0
              );
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
              continue;
            }
            const assembly = assemblyIdVal
              ? await prisma.assembly.findFirst({
                  where: { id: assemblyIdVal },
                })
              : null;
            if (!assembly) {
              missingAssembly++;
              continue;
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
            await prisma.assemblyActivity.create({
              data: {
                assembly: { connect: { id: assembly.id } },
                ...(jobId != null ? { job: { connect: { id: jobId } } } : {}),
                name,
                notes,
                activityDate,
                productId,
                ...(locationInId != null
                  ? { locationIn: { connect: { id: locationInId } } }
                  : {}),
                ...(locationOutId != null
                  ? { locationOut: { connect: { id: locationOutId } } }
                  : {}),
                quantity,
                qtyFabricConsumed,
                qtyFabricConsumedPerUnit,
                qtyBreakdown,
              },
            });
            created++;
            if (i > 0 && i % 100 === 0)
              console.log(`[import] assembly_activities ${i}/${total}`);
          }
          console.log(
            `[import] done assembly_activities file="${file.name}" created=${created} skipped=${skipped}`
          );
          batchResults.push({
            file: file.name,
            target: "assembly_activities",
            sheet: chosenSheet,
            total,
            imported: created,
            created,
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
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const name = (pick(r, ["name", "location", "location_name"]) ?? "")
              .toString()
              .trim();
            if (!name) {
              skippedNoName++;
              continue;
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
            if (i > 0 && i % 100 === 0)
              console.log(`[import] locations ${i}/${total}`);
          }
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
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const productIdNum = asNum(
              pick(r, ["product_code", "product code", "code", "sku"]) as any
            ) as number | null;
            const batchCode =
              (pick(r, ["batch_code", "batch code", "batch"]) ?? "")
                .toString()
                .trim() || null;
            const locationName =
              (pick(r, ["location_name", "location", "loc"]) ?? "")
                .toString()
                .trim() || null;
            const qty = asNum(
              pick(r, ["quantity", "qty", "qty_on_hand", "on hand"])
            ) as number | null;
            const receivedAt = asDate(
              pick(r, ["received_at", "received", "date"])
            ) as Date | null;
            const notes = pick(r, ["notes", "note"])?.toString() ?? null;
            if (productIdNum == null) {
              skipped++;
              continue;
            }
            const product = await prisma.product.findUnique({
              where: { id: productIdNum },
            });
            if (!product) {
              missingProduct++;
              continue;
            }
            let locationId: number | null = null;
            if (locationName) {
              const location = await prisma.location.findFirst({
                where: { name: locationName },
              });
              if (!location) {
                missingLocation++;
                continue;
              }
              locationId = location.id;
            }
            let existing = batchCode
              ? await prisma.batch.findFirst({
                  where: { productId: product.id, batchCode },
                })
              : null;
            if (existing) {
              await prisma.batch.update({
                where: { id: existing.id },
                data: { locationId, quantity: qty, receivedAt, notes },
              });
              updated++;
            } else {
              await prisma.batch.create({
                data: {
                  productId: product.id,
                  locationId,
                  batchCode,
                  quantity: qty,
                  receivedAt,
                  notes,
                },
              });
              created++;
            }
            if (i > 0 && i % 100 === 0)
              console.log(`[import] product_batches ${i}/${total}`);
          }
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
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
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
              continue;
            }
            const product = await prisma.product.findUnique({
              where: { id: productIdNum },
            });
            if (!product) {
              missingProduct++;
              continue;
            }
            const location = await prisma.location.findFirst({
              where: { name: locationName },
            });
            if (!location) {
              missingLocation++;
              continue;
            }
            const batchCode = `INIT-${productIdNum}-${locationName}`;
            const existing = await prisma.batch.findFirst({
              where: {
                productId: product.id,
                locationId: location.id,
                batchCode,
              },
            });
            if (existing) {
              await prisma.batch.update({
                where: { id: existing.id },
                data: { quantity: qty },
              });
              updated++;
            } else {
              await prisma.batch.create({
                data: {
                  productId: product.id,
                  locationId: location.id,
                  batchCode,
                  quantity: qty,
                  receivedAt: null,
                  notes: "Imported from Product_Locations",
                },
              });
              created++;
            }
            if (i > 0 && i % 100 === 0)
              console.log(`[import] product_locations ${i}/${total}`);
          }
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

        // PRODUCT MOVEMENTS
        if (finalMode === "import:product_movements") {
          let total = rows.length,
            created = 0,
            updated = 0,
            skipped = 0;
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const ref = (
              pick(r, ["movement_code", "movement ref", "ref", "code"]) ?? ""
            )
              .toString()
              .trim();
            const movementType =
              (pick(r, ["movement_type", "type"]) ?? "").toString().trim() ||
              null;
            const date = asDate(
              pick(r, ["date", "movement_date"])
            ) as Date | null;
            const locationName =
              (pick(r, ["location_name", "location"]) ?? "")
                .toString()
                .trim() || null;
            const notes = pick(r, ["notes", "note"])?.toString() ?? null;
            let locationId: number | null = null;
            if (locationName) {
              const loc = await prisma.location.findFirst({
                where: { name: locationName },
              });
              if (loc) locationId = loc.id;
            }
            if (!movementType && !date && !locationId && !ref) {
              skipped++;
              continue;
            }
            const existing = ref
              ? await prisma.productMovement.findFirst({
                  where: { notes: ref },
                })
              : null;
            if (existing) {
              await prisma.productMovement.update({
                where: { id: existing.id },
                data: {
                  movementType,
                  date,
                  locationId,
                  notes: ref || notes || existing.notes,
                },
              });
              updated++;
            } else {
              await prisma.productMovement.create({
                data: {
                  movementType,
                  date,
                  locationId,
                  notes: ref || notes || null,
                },
              });
              created++;
            }
            if (i > 0 && i % 100 === 0)
              console.log(`[import] product_movements ${i}/${total}`);
          }
          console.log(
            `[import] done product_movements file="${file.name}" created=${created} updated=${updated} skipped=${skipped}`
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
          });
          continue;
        }

        // PRODUCT MOVEMENT LINES
        if (finalMode === "import:product_movement_lines") {
          let total = rows.length,
            created = 0,
            skipped = 0,
            missingMovement = 0,
            missingProduct = 0,
            missingBatch = 0;
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const ref = (
              pick(r, ["movement_code", "movement ref", "ref", "code"]) ?? ""
            )
              .toString()
              .trim();
            const productIdNum = asNum(
              pick(r, ["product_code", "product code", "code", "sku"]) as any
            ) as number | null;
            const batchCode =
              (pick(r, ["batch_code", "batch code", "batch"]) ?? "")
                .toString()
                .trim() || null;
            const qty = asNum(pick(r, ["quantity", "qty"])) as number | null;
            const notes = pick(r, ["notes", "note"])?.toString() ?? null;
            if (!ref || productIdNum == null || qty == null) {
              skipped++;
              continue;
            }
            const movement = await prisma.productMovement.findFirst({
              where: { notes: ref },
            });
            if (!movement) {
              missingMovement++;
              continue;
            }
            const product = await prisma.product.findUnique({
              where: { id: productIdNum },
            });
            if (!product) {
              missingProduct++;
              continue;
            }
            let batchId: number | null = null;
            if (batchCode) {
              const batch = await prisma.batch.findFirst({
                where: { productId: product.id, batchCode },
              });
              if (batch) batchId = batch.id;
              else missingBatch++;
            }
            await prisma.productMovementLine.create({
              data: {
                movementId: movement.id,
                productId: product.id,
                batchId,
                quantity: qty,
                notes,
              },
            });
            created++;
            if (i > 0 && i % 100 === 0)
              console.log(`[import] product_movement_lines ${i}/${total}`);
          }
          console.log(
            `[import] done product_movement_lines file="${file.name}" created=${created} skipped=${skipped}`
          );
          batchResults.push({
            file: file.name,
            target: "product_movement_lines",
            sheet: chosenSheet,
            total,
            imported: created,
            created,
            skipped,
            missingMovement,
            missingProduct,
            missingBatch,
          });
          continue;
        }

        // PRODUCT LINES
        if (finalMode === "import:product_lines") {
          let total = rows.length,
            created = 0,
            skipped = 0,
            missingParent = 0,
            missingChild = 0;
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const parentIdNum = asNum(
              pick(r, ["parent_code", "parent", "parent product"]) as any
            ) as number | null;
            const childIdNum = asNum(
              pick(r, [
                "child_code",
                "child",
                "component_code",
                "component",
              ]) as any
            ) as number | null;
            const quantity = asNum(pick(r, ["quantity", "qty"])) as
              | number
              | null;
            const unitCost = asNum(
              pick(r, ["unit_cost", "cost", "unit cost"])
            ) as number | null;
            if (parentIdNum == null || childIdNum == null) {
              skipped++;
              continue;
            }
            const parent = await prisma.product.findUnique({
              where: { id: parentIdNum },
            });
            if (!parent) {
              missingParent++;
              continue;
            }
            const child = await prisma.product.findUnique({
              where: { id: childIdNum },
            });
            if (!child) {
              missingChild++;
              continue;
            }
            await prisma.productLine.create({
              data: {
                parentId: parent.id,
                childId: child.id,
                quantity,
                unitCost,
              },
            });
            created++;
            if (i > 0 && i % 100 === 0)
              console.log(`[import] product_lines ${i}/${total}`);
          }
          console.log(
            `[import] done product_lines file="${file.name}" created=${created} skipped=${skipped}`
          );
          batchResults.push({
            file: file.name,
            target: "product_lines",
            sheet: chosenSheet,
            total,
            imported: created,
            created,
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
