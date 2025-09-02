import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { unstable_composeUploadHandlers, unstable_createMemoryUploadHandler, unstable_parseMultipartFormData } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { Button, Group, Stack, Table, TextInput, Title, NumberInput, Select, Divider, Alert } from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import * as XLSX from "xlsx";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "Admin" }];

export async function loader(_args: LoaderFunctionArgs) {
  const values = await prisma.valueList.findMany({ orderBy: [{ type: "asc" }, { label: "asc" }] });
  return json({ values });
}

type UploadPreview = {
  filename: string;
  sheets: Array<{
    name: string;
    rows: any[];
    columns: string[];
    totalRows: number;
  }>;
};

export async function action({ request }: ActionFunctionArgs) {
  const contentType = request.headers.get("content-type") || "";
  const isMultipart = contentType.includes("multipart/form-data");

  if (isMultipart) {
    const uploadHandler = unstable_composeUploadHandlers(unstable_createMemoryUploadHandler({ maxPartSize: 15_000_000 }));
    const form = await unstable_parseMultipartFormData(request, uploadHandler);
    const intent = form.get("_intent");

    if (intent === "uploadExcel") {
      const file = form.get("file");
      if (!file || typeof file === "string") return json({ error: "No file provided" }, { status: 400 });
      const mode = (form.get("mode") as string) || "preview";
      const sheetNameOverride = ((form.get("sheetName") as string) || "").trim() || null;
      const ab = await (file as File).arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });
      const sheets: UploadPreview["sheets"] = wb.SheetNames.map((name: string) => {
        const ws = wb.Sheets[name];
        const json = XLSX.utils.sheet_to_json(ws, { defval: null });
        const columns = json.length ? Object.keys(json[0] as any) : [];
        return {
          name,
          rows: (json as any[]).slice(0, 5),
          columns,
          totalRows: (json as any[]).length,
        };
      });
      if (!mode || mode === "preview") {
        const preview: UploadPreview = { filename: (file as File).name, sheets };
        return json({ preview });
      }

      // Helpers for field mapping
      const normalizeKey = (k: string) => k.trim().toLowerCase();
      const truthy = new Set(["true", "1", "yes", "y"]);
      const asBool = (v: any) => (typeof v === "string" ? truthy.has(v.trim().toLowerCase()) : Boolean(v));
      const asNum = (v: any) => (v === null || v === undefined || v === "" ? null : Number(v));
      const asDate = (v: any): Date | null => {
        if (v == null || v === "") return null;
        if (v instanceof Date) return v;
        if (typeof v === "number") {
          // Try Excel serial date (days since 1899-12-30)
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

      // Choose sheet: explicit name if provided, else first sheet
      const chosenSheet = sheetNameOverride && wb.SheetNames.includes(sheetNameOverride) ? sheetNameOverride : wb.SheetNames[0];
      const ws = wb.Sheets[chosenSheet];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as any[];

      if (mode === "import:products") {
        let imported = 0;
        let created = 0;
        let updated = 0;
        let skippedNoCode = 0;
        let total = rows.length;

        const codeKeys = ["code", "product_code", "product code", "productcode", "item code", "sku", "sku code"];
        const nameKeys = ["name", "product_name", "product name", "item name", "description", "product description"];
        const typeKeys = ["type", "product_type", "product type"];
        const costKeys = ["costprice", "cost price", "cost_price", "cost", "unit cost"];
        const manualKeys = ["manualsaleprice", "manual sale price", "manual_sale_price", "manual", "manual price"];
        const autoKeys = ["autosaleprice", "auto sale price", "auto_sale_price", "auto", "auto price"];
        const stockKeys = ["stocktrackingenabled", "stock tracking enabled", "stock_tracking_enabled", "stock tracking", "stock"];
        const batchKeys = ["batchtrackingenabled", "batch tracking enabled", "batch_tracking_enabled", "batch tracking", "batch"];

        for (const r of rows) {
          const code = (pick(r, codeKeys) ?? "").toString().trim();
          if (!code) {
            skippedNoCode++;
            continue;
          }
          const sku = pick(r, ["sku", "sku code"])?.toString().trim() || null;
          const name = pick(r, nameKeys)?.toString().trim() || null;
          const typeRaw = pick(r, typeKeys)?.toString().trim() || null;
          const allowedTypes = ["CMT", "Fabric", "Finished", "Trim", "Service"]; // Prisma enum
          const canonicalizeType = (s: string | null): any => {
            if (!s) return null;
            const low = s.toLowerCase();
            if (low === "finished goods" || low === "finished") return "Finished";
            const match = allowedTypes.find((t) => t.toLowerCase() === low);
            return (match as any) ?? null;
          };
          const type = canonicalizeType(typeRaw);
          const costPrice = asNum(pick(r, costKeys)) as number | null;
          const manualSalePrice = asNum(pick(r, manualKeys)) as number | null;
          const autoSalePrice = asNum(pick(r, autoKeys)) as number | null;
          const stockTrackingEnabled = asBool(pick(r, stockKeys)) as boolean;
          const batchTrackingEnabled = asBool(pick(r, batchKeys)) as boolean;

          const existing = await prisma.product.findUnique({ where: { code } });
          if (existing) {
            await prisma.product.update({ where: { id: existing.id }, data: { sku, name, type, costPrice, manualSalePrice, autoSalePrice, stockTrackingEnabled, batchTrackingEnabled } as any });
            updated++;
          } else {
            await prisma.product.create({ data: { code, sku, name, type, costPrice, manualSalePrice, autoSalePrice, stockTrackingEnabled, batchTrackingEnabled } as any });
            created++;
          }
          imported++;
        }
        const result = { target: "products", sheet: chosenSheet, total, imported, created, updated, skippedNoCode };
        return json({ importResult: result });
      }

      if (mode === "import:locations") {
        let total = rows.length;
        let created = 0;
        let updated = 0;
        let skippedNoName = 0;
        for (const r of rows) {
          const name = (pick(r, ["name", "location", "location_name"]) ?? "").toString().trim();
          if (!name) {
            skippedNoName++;
            continue;
          }
          const notes = pick(r, ["notes", "note"])?.toString() ?? null;
          const existing = await prisma.location.findFirst({ where: { name } });
          if (existing) {
            await prisma.location.update({ where: { id: existing.id }, data: { notes } });
            updated++;
          } else {
            await prisma.location.create({ data: { name, notes } });
            created++;
          }
        }
        return json({ importResult: { target: "locations", sheet: chosenSheet, total, imported: created + updated, created, updated, skippedNoName } });
      }

      if (mode === "import:product_batches") {
        let total = rows.length;
        let created = 0;
        let updated = 0; // we don't really update batches; treat duplicates as update
        let skipped = 0;
        let missingProduct = 0;
        let missingLocation = 0;
        for (const r of rows) {
          const productCode = (pick(r, ["product_code", "product code", "code", "sku"]) ?? "").toString().trim();
          const batchCode = (pick(r, ["batch_code", "batch code", "batch"]) ?? "").toString().trim() || null;
          const locationName = (pick(r, ["location_name", "location", "loc"]) ?? "").toString().trim() || null;
          const qty = asNum(pick(r, ["quantity", "qty", "qty_on_hand", "on hand"])) as number | null;
          const receivedAt = asDate(pick(r, ["received_at", "received", "date"])) as Date | null;
          const notes = pick(r, ["notes", "note"])?.toString() ?? null;
          if (!productCode) {
            skipped++;
            continue;
          }
          const product = await prisma.product.findUnique({ where: { code: productCode } });
          if (!product) {
            missingProduct++;
            continue;
          }
          let locationId: number | null = null;
          if (locationName) {
            const location = await prisma.location.findFirst({ where: { name: locationName } });
            if (!location) {
              missingLocation++;
              continue;
            }
            locationId = location.id;
          }
          // Try to find existing batch by productId + batchCode (if batchCode provided)
          let existing = batchCode ? await prisma.batch.findFirst({ where: { productId: product.id, batchCode } }) : null;
          if (existing) {
            await prisma.batch.update({ where: { id: existing.id }, data: { locationId, quantity: qty, receivedAt, notes } });
            updated++;
          } else {
            await prisma.batch.create({ data: { productId: product.id, locationId, assemblyId: null, batchCode, quantity: qty, receivedAt, notes } });
            created++;
          }
        }
        return json({ importResult: { target: "product_batches", sheet: chosenSheet, total, imported: created + updated, created, updated, skipped, missingProduct, missingLocation } });
      }

      if (mode === "import:product_locations") {
        // Interpret as on-hand quantities per product/location; create synthetic batches if needed
        let total = rows.length;
        let created = 0;
        let updated = 0;
        let skipped = 0;
        let missingProduct = 0;
        let missingLocation = 0;
        for (const r of rows) {
          const productCode = (pick(r, ["product_code", "product code", "code", "sku"]) ?? "").toString().trim();
          const locationName = (pick(r, ["location_name", "location", "loc"]) ?? "").toString().trim();
          const qty = asNum(pick(r, ["quantity", "qty", "qty_on_hand", "on hand"])) as number | null;
          if (!productCode || !locationName) {
            skipped++;
            continue;
          }
          const product = await prisma.product.findUnique({ where: { code: productCode } });
          if (!product) {
            missingProduct++;
            continue;
          }
          const location = await prisma.location.findFirst({ where: { name: locationName } });
          if (!location) {
            missingLocation++;
            continue;
          }
          const batchCode = `INIT-${productCode}-${locationName}`;
          const existing = await prisma.batch.findFirst({ where: { productId: product.id, locationId: location.id, batchCode } });
          if (existing) {
            await prisma.batch.update({ where: { id: existing.id }, data: { quantity: qty } });
            updated++;
          } else {
            await prisma.batch.create({ data: { productId: product.id, locationId: location.id, batchCode, quantity: qty, receivedAt: null, notes: "Imported from Product_Locations" } });
            created++;
          }
        }
        return json({ importResult: { target: "product_locations", sheet: chosenSheet, total, imported: created + updated, created, updated, skipped, missingProduct, missingLocation } });
      }

      if (mode === "import:product_movements") {
        // Create movements; use notes to store an external ref/code to link lines later
        let total = rows.length;
        let created = 0;
        let updated = 0;
        let skipped = 0;
        for (const r of rows) {
          const ref = (pick(r, ["movement_code", "movement ref", "ref", "code"]) ?? "").toString().trim();
          const movementType = (pick(r, ["movement_type", "type"]) ?? "").toString().trim() || null;
          const date = asDate(pick(r, ["date", "movement_date"])) as Date | null;
          const locationName = (pick(r, ["location_name", "location"]) ?? "").toString().trim() || null;
          const notes = pick(r, ["notes", "note"])?.toString() ?? null;
          let locationId: number | null = null;
          if (locationName) {
            const loc = await prisma.location.findFirst({ where: { name: locationName } });
            if (loc) locationId = loc.id;
          }
          if (!movementType && !date && !locationId && !ref) {
            skipped++;
            continue;
          }
          // Try to find existing by notes matching ref
          const existing = ref ? await prisma.productMovement.findFirst({ where: { notes: ref } }) : null;
          if (existing) {
            await prisma.productMovement.update({ where: { id: existing.id }, data: { movementType, date, locationId, notes: ref || notes || existing.notes } });
            updated++;
          } else {
            await prisma.productMovement.create({ data: { movementType, date, locationId, notes: ref || notes || null } });
            created++;
          }
        }
        return json({ importResult: { target: "product_movements", sheet: chosenSheet, total, imported: created + updated, created, updated, skipped } });
      }

      if (mode === "import:product_movement_lines") {
        let total = rows.length;
        let created = 0;
        let skipped = 0;
        let missingMovement = 0;
        let missingProduct = 0;
        for (const r of rows) {
          const ref = (pick(r, ["movement_code", "movement ref", "ref", "code"]) ?? "").toString().trim();
          const productCode = (pick(r, ["product_code", "product code", "code", "sku"]) ?? "").toString().trim();
          const batchCode = (pick(r, ["batch_code", "batch code", "batch"]) ?? "").toString().trim() || null;
          const qty = asNum(pick(r, ["quantity", "qty"])) as number | null;
          const notes = pick(r, ["notes", "note"])?.toString() ?? null;
          if (!ref || !productCode || qty == null) {
            skipped++;
            continue;
          }
          const movement = await prisma.productMovement.findFirst({ where: { notes: ref } });
          if (!movement) {
            missingMovement++;
            continue;
          }
          const product = await prisma.product.findUnique({ where: { code: productCode } });
          if (!product) {
            missingProduct++;
            continue;
          }
          let batchId: number | null = null;
          if (batchCode) {
            const batch = await prisma.batch.findFirst({ where: { productId: product.id, batchCode } });
            if (batch) batchId = batch.id;
          }
          await prisma.productMovementLine.create({ data: { movementId: movement.id, productId: product.id, batchId, quantity: qty, notes } });
          created++;
        }
        return json({ importResult: { target: "product_movement_lines", sheet: chosenSheet, total, imported: created, created, skipped, missingMovement, missingProduct } });
      }

      if (mode === "import:product_lines") {
        let total = rows.length;
        let created = 0;
        let skipped = 0;
        let missingParent = 0;
        let missingChild = 0;
        for (const r of rows) {
          const parentCode = (pick(r, ["parent_code", "parent", "parent product"]) ?? "").toString().trim();
          const childCode = (pick(r, ["child_code", "child", "component_code", "component"]) ?? "").toString().trim();
          const quantity = asNum(pick(r, ["quantity", "qty"])) as number | null;
          const unitCost = asNum(pick(r, ["unit_cost", "cost", "unit cost"])) as number | null;
          if (!parentCode || !childCode) {
            skipped++;
            continue;
          }
          const parent = await prisma.product.findUnique({ where: { code: parentCode } });
          if (!parent) {
            missingParent++;
            continue;
          }
          const child = await prisma.product.findUnique({ where: { code: childCode } });
          if (!child) {
            missingChild++;
            continue;
          }
          await prisma.productLine.create({ data: { parentId: parent.id, childId: child.id, quantity, unitCost } });
          created++;
        }
        return json({ importResult: { target: "product_lines", sheet: chosenSheet, total, imported: created, created, skipped, missingParent, missingChild } });
      }

      if (mode === "import:costings") {
        let total = rows.length;
        let created = 0;
        let skipped = 0;
        let missingAssembly = 0;
        let missingComponent = 0;
        for (const r of rows) {
          const assemblyName = (pick(r, ["assembly_name", "assembly", "bom"]) ?? "").toString().trim();
          const componentCode = (pick(r, ["component_code", "component", "product_code", "code"]) ?? "").toString().trim();
          const usageRaw = (pick(r, ["usage_type", "usage", "type"]) ?? "").toString().trim();
          const quantityPerUnit = asNum(pick(r, ["quantity_per_unit", "qty_per", "qty", "quantity"])) as number | null;
          const unitCost = asNum(pick(r, ["unit_cost", "cost", "unit cost"])) as number | null;
          const notes = pick(r, ["notes", "note"])?.toString() ?? null;
          if (!assemblyName || !componentCode) {
            skipped++;
            continue;
          }
          // Get or create assembly
          let assembly = await prisma.assembly.findFirst({ where: { name: assemblyName } });
          if (!assembly) {
            assembly = await prisma.assembly.create({ data: { name: assemblyName } });
          }
          const component = await prisma.product.findUnique({ where: { code: componentCode } });
          if (!component) {
            missingComponent++;
            continue;
          }
          const usageType = (() => {
            const v = usageRaw.toLowerCase();
            if (v.startsWith("cut")) return "cut" as any;
            if (v.startsWith("make")) return "make" as any;
            return null;
          })();
          await prisma.costing.create({
            data: { assemblyId: assembly.id, componentId: component.id, usageType: usageType as any, componentType: component.type as any, quantityPerUnit, unitCost, notes },
          });
          created++;
        }
        return json({ importResult: { target: "costings", sheet: chosenSheet, total, imported: created, created, skipped, missingAssembly, missingComponent } });
      }

      // Unknown mode
      return json({ error: `Import mode not implemented: ${mode}` }, { status: 400 });
    }

    if (intent === "valueList.create") {
      const code = (form.get("code") as string) || null;
      const label = (form.get("label") as string) || null;
      const type = (form.get("type") as string) || null;
      const valueRaw = form.get("value") as string | null;
      const value = valueRaw != null && valueRaw !== "" ? Number(valueRaw) : null;
      await prisma.valueList.create({ data: { code, label, type, value } as any });
      const values = await prisma.valueList.findMany({ orderBy: [{ type: "asc" }, { label: "asc" }] });
      return json({ values, message: "Value created" });
    }

    if (intent === "valueList.delete") {
      const id = Number(form.get("id"));
      if (id) await prisma.valueList.delete({ where: { id } });
      const values = await prisma.valueList.findMany({ orderBy: [{ type: "asc" }, { label: "asc" }] });
      return json({ values, message: "Value deleted" });
    }
  }

  // Non-multipart (e.g., simple deletes can still arrive this way)
  const form = await request.formData();
  const intent = form.get("_intent");
  if (intent === "valueList.delete") {
    const id = Number(form.get("id"));
    if (id) await prisma.valueList.delete({ where: { id } });
    const values = await prisma.valueList.findMany({ orderBy: [{ type: "asc" }, { label: "asc" }] });
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

  const valueForm = useForm<{ code: string | null; label: string | null; type: string | null; value: number | null }>({
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
              render={({ field }) => <NumberInput label="Value" w={140} value={field.value ?? undefined} onChange={(v) => field.onChange(v === "" ? null : Number(v))} allowDecimal />}
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Add"}
            </Button>
          </Group>
        </form>

        <Table striped withTableBorder withColumnBorders highlightOnHover mt="md">
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
          Excel Import (Preview)
        </Title>
        <form method="post" encType="multipart/form-data">
          <input type="hidden" name="_intent" value="uploadExcel" />
          <Group align="center" wrap="wrap">
            <input name="file" type="file" accept=".xlsx" />
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--mantine-color-dimmed)" }}>Sheet (optional)</label>
              <input name="sheetName" type="text" placeholder="Default: first sheet" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--mantine-color-dimmed)" }}>Mode</label>
              <select name="mode" defaultValue="preview">
                <option value="preview">Preview only</option>
                <option value="import:products">Import: Products</option>
                <option value="import:locations">Import: Locations</option>
                <option value="import:product_batches">Import: Product Batches</option>
                <option value="import:product_locations">Import: Product Locations</option>
                <option value="import:product_movements">Import: Product Movements</option>
                <option value="import:product_movement_lines">Import: Product Movement Lines</option>
                <option value="import:product_lines">Import: Product Lines</option>
                <option value="import:costings">Import: Costings</option>
              </select>
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Uploading..." : "Upload & Preview"}
            </Button>
          </Group>
        </form>

        {actionData?.error && (
          <Alert color="red" mt="md">
            {actionData.error}
          </Alert>
        )}

        {actionData?.importResult && (
          <Alert color="green" mt="md">
            Sheet: {actionData.importResult.sheet} — Total: {actionData.importResult.total}, Imported: {actionData.importResult.imported}, Created: {actionData.importResult.created}, Updated:{" "}
            {actionData.importResult.updated}, Skipped (no code): {actionData.importResult.skippedNoCode}
          </Alert>
        )}

        {actionData?.preview && (
          <Stack mt="md">
            <Title order={5}>File: {actionData.preview.filename}</Title>
            {actionData.preview.sheets.map((s: any) => (
              <Stack key={s.name} gap="xs">
                <Title order={6}>
                  {s.name} ({s.totalRows} rows)
                </Title>
                <Table withTableBorder withColumnBorders>
                  <Table.Thead>
                    <Table.Tr>
                      {s.columns.map((c: string) => (
                        <Table.Th key={c}>{c}</Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {s.rows.map((r: any, idx: number) => (
                      <Table.Tr key={idx}>
                        {s.columns.map((c: string) => (
                          <Table.Td key={c}>{String(r[c] ?? "")}</Table.Td>
                        ))}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Stack>
            ))}
          </Stack>
        )}
      </section>
    </Stack>
  );
}
