import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import {
  Button,
  Card,
  Checkbox,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  Select,
} from "@mantine/core";
import { prisma } from "~/utils/prisma.server";
import { requireAdminUser } from "~/utils/auth.server";
import {
  formatEnumOptionsInput,
  parseAppliesToTypesInput,
  parseEnumOptionsInput,
} from "~/modules/productMetadata/utils/productMetadataFields";
import { invalidateProductAttributeCache } from "~/modules/productMetadata/services/productMetadata.server";

const DATA_TYPE_OPTIONS = [
  { value: "STRING", label: "STRING" },
  { value: "NUMBER", label: "NUMBER" },
  { value: "ENUM", label: "ENUM" },
  { value: "BOOLEAN", label: "BOOLEAN" },
  { value: "JSON", label: "JSON" },
];

function parseJsonInput(raw: string | null) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return { value: null, error: null };
  try {
    return { value: JSON.parse(trimmed), error: null };
  } catch {
    return { value: null, error: "Invalid JSON in validation field." };
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminUser(request);
  const definitions = await prisma.productAttributeDefinition.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return json({ definitions });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdminUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  const key = String(form.get("key") || "").trim();
  const label = String(form.get("label") || "").trim() || key;
  const dataTypeRaw =
    String(form.get("dataType") || "STRING").toUpperCase() || "STRING";
  const allowedTypes = new Set(DATA_TYPE_OPTIONS.map((opt) => opt.value));
  const dataType = allowedTypes.has(dataTypeRaw) ? dataTypeRaw : "STRING";
  const isRequired = form.get("isRequired") === "on";
  const isFilterable = form.get("isFilterable") === "on";
  const sortOrderRaw = String(form.get("sortOrder") || "").trim();
  const sortOrder = Number.isFinite(Number(sortOrderRaw))
    ? Number(sortOrderRaw)
    : 0;
  const enumOptions = parseEnumOptionsInput(
    form.get("enumOptions") as string | null
  );
  const appliesToProductTypes = parseAppliesToTypesInput(
    form.get("appliesToProductTypes") as string | null
  );
  const validationParse = parseJsonInput(
    form.get("validation") as string | null
  );
  if (validationParse.error) {
    return json({ error: validationParse.error }, { status: 400 });
  }

  if (intent === "create") {
    if (!key) {
      return json({ error: "Key is required." }, { status: 400 });
    }
    await prisma.productAttributeDefinition.create({
      data: {
        key,
        label,
        dataType: dataType as any,
        isRequired,
        isFilterable,
        enumOptions: enumOptions.length ? enumOptions : null,
        validation: validationParse.value,
        appliesToProductTypes,
        sortOrder,
      },
    });
    await invalidateProductAttributeCache();
    return redirect("/admin/product-attributes");
  }

  if (intent === "update") {
    const id = Number(form.get("id"));
    if (!Number.isFinite(id)) {
      return json({ error: "Invalid id." }, { status: 400 });
    }
    if (!key) {
      return json({ error: "Key is required." }, { status: 400 });
    }
    await prisma.productAttributeDefinition.update({
      where: { id },
      data: {
        key,
        label,
        dataType: dataType as any,
        isRequired,
        isFilterable,
        enumOptions: enumOptions.length ? enumOptions : null,
        validation: validationParse.value,
        appliesToProductTypes,
        sortOrder,
      },
    });
    await invalidateProductAttributeCache();
    return redirect("/admin/product-attributes");
  }

  if (intent === "delete") {
    const id = Number(form.get("id"));
    if (!Number.isFinite(id)) {
      return json({ error: "Invalid id." }, { status: 400 });
    }
    await prisma.productAttributeDefinition.delete({ where: { id } });
    await invalidateProductAttributeCache();
    return redirect("/admin/product-attributes");
  }

  return json({ error: "Unsupported intent." }, { status: 400 });
}

export default function AdminProductAttributesPage() {
  const { definitions } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2}>Product Metadata Definitions</Title>
        <Button component={Link} to="/admin">
          Back
        </Button>
      </Group>
      {actionData?.error && (
        <Text c="red" size="sm">
          {actionData.error}
        </Text>
      )}
      <Card withBorder>
        <Form method="post">
          <input type="hidden" name="_intent" value="create" />
          <Group gap="sm" align="flex-end" wrap="wrap">
            <TextInput name="key" label="Key" required />
            <TextInput name="label" label="Label" required />
            <Select
              name="dataType"
              label="Data Type"
              data={DATA_TYPE_OPTIONS}
              defaultValue="STRING"
              withinPortal
            />
            <TextInput name="sortOrder" label="Sort" placeholder="0" />
            <Checkbox name="isFilterable" label="Filterable" />
            <Checkbox name="isRequired" label="Required" />
            <Textarea
              name="enumOptions"
              label="Enum Options (one per line)"
              autosize
              minRows={2}
            />
            <Textarea
              name="appliesToProductTypes"
              label="Applies To Product Types"
              autosize
              minRows={2}
            />
            <Textarea
              name="validation"
              label="Validation JSON"
              autosize
              minRows={2}
            />
            <Button type="submit" loading={busy}>
              Create
            </Button>
          </Group>
        </Form>
      </Card>
      <Table stickyHeader withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID</Table.Th>
            <Table.Th>Definition</Table.Th>
            <Table.Th>Filterable</Table.Th>
            <Table.Th>Required</Table.Th>
            <Table.Th>Sort</Table.Th>
            <Table.Th>Enum</Table.Th>
            <Table.Th>Applies To</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {definitions.map((def) => (
            <Table.Tr key={def.id}>
              <Table.Td>{def.id}</Table.Td>
              <Table.Td>
                <Form method="post">
                  <input type="hidden" name="_intent" value="update" />
                  <input type="hidden" name="id" value={def.id} />
                  <Group gap="xs" align="flex-start" wrap="wrap">
                    <TextInput
                      name="key"
                      label="Key"
                      defaultValue={def.key}
                    />
                    <TextInput
                      name="label"
                      label="Label"
                      defaultValue={def.label}
                    />
                    <Select
                      name="dataType"
                      label="Data Type"
                      data={DATA_TYPE_OPTIONS}
                      defaultValue={def.dataType}
                      withinPortal
                    />
                    <TextInput
                      name="sortOrder"
                      label="Sort"
                      defaultValue={def.sortOrder ?? 0}
                    />
                    <Checkbox
                      name="isFilterable"
                      label="Filterable"
                      defaultChecked={def.isFilterable}
                    />
                    <Checkbox
                      name="isRequired"
                      label="Required"
                      defaultChecked={def.isRequired}
                    />
                    <Textarea
                      name="enumOptions"
                      label="Enum Options"
                      autosize
                      minRows={2}
                      defaultValue={formatEnumOptionsInput(def.enumOptions)}
                    />
                    <Textarea
                      name="appliesToProductTypes"
                      label="Applies To"
                      autosize
                      minRows={2}
                      defaultValue={(def.appliesToProductTypes || []).join("\n")}
                    />
                    <Textarea
                      name="validation"
                      label="Validation JSON"
                      autosize
                      minRows={2}
                      defaultValue={
                        def.validation ? JSON.stringify(def.validation, null, 2) : ""
                      }
                    />
                    <Button type="submit" size="xs">
                      Save
                    </Button>
                  </Group>
                </Form>
              </Table.Td>
              <Table.Td>{def.isFilterable ? "Yes" : "No"}</Table.Td>
              <Table.Td>{def.isRequired ? "Yes" : "No"}</Table.Td>
              <Table.Td>{def.sortOrder ?? 0}</Table.Td>
              <Table.Td>
                {Array.isArray(def.enumOptions)
                  ? def.enumOptions.join(", ")
                  : ""}
              </Table.Td>
              <Table.Td>
                {Array.isArray(def.appliesToProductTypes)
                  ? def.appliesToProductTypes.join(", ")
                  : ""}
              </Table.Td>
              <Table.Td>
                <Form method="post">
                  <input type="hidden" name="_intent" value="delete" />
                  <input type="hidden" name="id" value={def.id} />
                  <Button color="red" variant="light" type="submit" size="xs">
                    Delete
                  </Button>
                </Form>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {!definitions.length && (
        <Text c="dimmed">No product metadata definitions yet.</Text>
      )}
    </Stack>
  );
}
