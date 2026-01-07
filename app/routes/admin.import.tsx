import { useActionData, useNavigation } from "@remix-run/react";
import { Alert, Button, Group, Stack, Table, Title } from "@mantine/core";
import type { ActionFunctionArgs } from "@remix-run/node";
import { adminImportAction } from "../server/adminImportAction.server";
import { requireAdminUser } from "../utils/auth.server";

// Dynamic import of server action moved outside routes folder to avoid client bundling.
export async function action(args: ActionFunctionArgs) {
  await requireAdminUser(args.request);
  // const mod = await import("../server/adminImportAction.server");
  return adminImportAction(args);
}

export default function AdminImportRoute() {
  const actionData = useActionData<any>();
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
              <option value="import:company_address_defaults">
                Import: Company Address Defaults
              </option>
              <option value="import:contacts">Import: Contacts</option>
              <option value="import:contact_address_defaults">
                Import: Contact Address Defaults
              </option>
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
              <option value="import:supplier_invoices">
                Import: Supplier Invoices
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
