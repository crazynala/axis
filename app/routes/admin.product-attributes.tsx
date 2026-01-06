import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import {
  Button,
  Card,
  Checkbox,
  Badge,
  Divider,
  Drawer,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  Select,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { prisma } from "~/utils/prisma.server";
import { requireAdminUser } from "~/utils/auth.server";
import {
  formatAppliesToIdsInput,
  parseAppliesToIdsInput,
  parseAppliesToTypesInput,
  parseEnumOptionsInput,
} from "~/modules/productMetadata/utils/productMetadataFields";
import { invalidateProductAttributeCache } from "~/modules/productMetadata/services/productMetadata.server";
import { invalidateAllOptions } from "~/utils/options.server";

const DATA_TYPE_OPTIONS = [
  { value: "STRING", label: "STRING" },
  { value: "NUMBER", label: "NUMBER" },
  { value: "ENUM", label: "ENUM" },
  { value: "BOOLEAN", label: "BOOLEAN" },
  { value: "JSON", label: "JSON" },
];
const ATTRIBUTE_DISPLAY_WIDTH_OPTIONS = [
  { value: "full", label: "full" },
  { value: "half", label: "half" },
  { value: "third", label: "third" },
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

function slugifyOptionLabel(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminUser(request);
  const definitions = await prisma.productAttributeDefinition.findMany({
    include: {
      options: {
        orderBy: { label: "asc" },
        include: {
          mergedInto: { select: { id: true, label: true } },
          _count: { select: { values: true } },
        },
      },
    },
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
  const appliesToCategoryIds = parseAppliesToIdsInput(
    form.get("appliesToCategoryIds") as string | null
  );
  const appliesToSubcategoryIds = parseAppliesToIdsInput(
    form.get("appliesToSubcategoryIds") as string | null
  );
  const displayWidthRaw = String(form.get("displayWidth") || "full");
  const allowedWidths = new Set(
    ATTRIBUTE_DISPLAY_WIDTH_OPTIONS.map((opt) => opt.value)
  );
  const displayWidth = allowedWidths.has(displayWidthRaw)
    ? displayWidthRaw
    : "full";
  const validationParse = parseJsonInput(
    form.get("validation") as string | null
  );
  if (validationParse.error) {
    return json({ error: validationParse.error }, { status: 400 });
  }

  if (intent === "option.create") {
    const definitionId = Number(form.get("definitionId"));
    const label = String(form.get("label") || "").trim();
    if (!Number.isFinite(definitionId)) {
      return json({ error: "Invalid definition id." }, { status: 400 });
    }
    if (!label) {
      return json({ error: "Option label is required." }, { status: 400 });
    }
    const slug = slugifyOptionLabel(label);
    if (!slug) {
      return json({ error: "Option label is invalid." }, { status: 400 });
    }
    await prisma.productAttributeOption.upsert({
      where: { definitionId_slug: { definitionId, slug } },
      create: { definitionId, label, slug },
      update: { label, isArchived: false, mergedIntoId: null },
    });
    await invalidateProductAttributeCache();
    invalidateAllOptions();
    return redirect("/admin/product-attributes");
  }

  if (intent === "option.rename") {
    const optionId = Number(form.get("optionId"));
    const label = String(form.get("label") || "").trim();
    if (!Number.isFinite(optionId)) {
      return json({ error: "Invalid option id." }, { status: 400 });
    }
    if (!label) {
      return json({ error: "Option label is required." }, { status: 400 });
    }
    const slug = slugifyOptionLabel(label);
    if (!slug) {
      return json({ error: "Option label is invalid." }, { status: 400 });
    }
    const existing = await prisma.productAttributeOption.findUnique({
      where: { id: optionId },
      select: { definitionId: true },
    });
    if (!existing) {
      return json({ error: "Option not found." }, { status: 404 });
    }
    const collision = await prisma.productAttributeOption.findFirst({
      where: { definitionId: existing.definitionId, slug },
      select: { id: true },
    });
    if (collision && collision.id !== optionId) {
      return json(
        { error: "Another option already uses that label." },
        { status: 400 }
      );
    }
    await prisma.productAttributeOption.update({
      where: { id: optionId },
      data: { label, slug },
    });
    await invalidateProductAttributeCache();
    invalidateAllOptions();
    return redirect("/admin/product-attributes");
  }

  if (intent === "option.archive" || intent === "option.unarchive") {
    const optionId = Number(form.get("optionId"));
    if (!Number.isFinite(optionId)) {
      return json({ error: "Invalid option id." }, { status: 400 });
    }
    const isArchived = intent === "option.archive";
    await prisma.productAttributeOption.update({
      where: { id: optionId },
      data: { isArchived, mergedIntoId: null },
    });
    await invalidateProductAttributeCache();
    invalidateAllOptions();
    return redirect("/admin/product-attributes");
  }

  if (intent === "option.merge") {
    const targetId = Number(form.get("targetId"));
    const sourceRaw = String(form.get("sourceIds") || "");
    const sourceIds = sourceRaw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
      .filter((n) => n !== targetId);
    if (!Number.isFinite(targetId)) {
      return json({ error: "Target option is required." }, { status: 400 });
    }
    if (!sourceIds.length) {
      return json({ error: "Select options to merge." }, { status: 400 });
    }
    const target = await prisma.productAttributeOption.findUnique({
      where: { id: targetId },
      select: { id: true, definitionId: true },
    });
    if (!target) {
      return json({ error: "Target option not found." }, { status: 404 });
    }
    await prisma.$transaction([
      prisma.productAttributeValue.updateMany({
        where: { optionId: { in: sourceIds } },
        data: { optionId: targetId },
      }),
      prisma.productAttributeOption.updateMany({
        where: { id: { in: sourceIds }, definitionId: target.definitionId },
        data: { isArchived: true, mergedIntoId: targetId },
      }),
    ]);
    await invalidateProductAttributeCache();
    invalidateAllOptions();
    return redirect("/admin/product-attributes");
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
        appliesToCategoryIds,
        appliesToSubcategoryIds,
        displayWidth,
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
        appliesToCategoryIds,
        appliesToSubcategoryIds,
        displayWidth,
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
  const submit = useSubmit();
  const busy = nav.state !== "idle";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingDefId, setEditingDefId] = useState<number | null>(null);
  const editingDef = useMemo(
    () => definitions.find((def) => def.id === editingDefId) || null,
    [definitions, editingDefId]
  );
  const formKey = editingDef ? `edit-${editingDef.id}` : "create";
  const openCreate = () => {
    setEditingDefId(null);
    setDrawerOpen(true);
  };
  const openEdit = (id: number) => {
    setEditingDefId(id);
    setDrawerOpen(true);
  };
  const closeDrawer = () => setDrawerOpen(false);
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [selectedOptionIds, setSelectedOptionIds] = useState<number[]>([]);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");

  useEffect(() => {
    setNewOptionLabel("");
    setSelectedOptionIds([]);
    setMergeTargetId("");
  }, [editingDefId, drawerOpen]);
  const formatAppliesTo = (def: (typeof definitions)[number]) => {
    const types = Array.isArray(def.appliesToProductTypes)
      ? def.appliesToProductTypes
      : [];
    const cats = Array.isArray(def.appliesToCategoryIds)
      ? def.appliesToCategoryIds
      : [];
    const subs = Array.isArray(def.appliesToSubcategoryIds)
      ? def.appliesToSubcategoryIds
      : [];
    const parts = [];
    if (types.length) parts.push(`Types: ${types.join(", ")}`);
    if (cats.length) parts.push(`Categories: ${cats.join(", ")}`);
    if (subs.length) parts.push(`Subcategories: ${subs.join(", ")}`);
    return parts.length ? parts.join(" • ") : "All";
  };
  const activeOptions = Array.isArray(editingDef?.options)
    ? editingDef.options.filter(
        (opt: any) => !opt.isArchived && !opt.mergedIntoId
      )
    : [];
  const mergeTargetOptions = activeOptions.map((opt: any) => ({
    value: String(opt.id),
    label: opt.label ?? String(opt.id),
  }));
  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2}>Product Metadata Definitions</Title>
        <Group gap="sm">
          <Button variant="light" onClick={openCreate}>
            New Definition
          </Button>
          <Button component={Link} to="/admin">
            Back
          </Button>
        </Group>
      </Group>
      {actionData?.error && (
        <Text c="red" size="sm">
          {actionData.error}
        </Text>
      )}
      <Table stickyHeader withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID</Table.Th>
            <Table.Th>Definition</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Applies To</Table.Th>
            <Table.Th>Filterable</Table.Th>
            <Table.Th>Required</Table.Th>
            <Table.Th>Display</Table.Th>
            <Table.Th>Sort</Table.Th>
            <Table.Th>Enum</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {definitions.map((def) => (
            <Table.Tr key={def.id}>
              <Table.Td>{def.id}</Table.Td>
              <Table.Td>
                <Stack gap={2}>
                  <Text fw={600}>{def.label}</Text>
                  <Text size="xs" c="dimmed">
                    {def.key}
                  </Text>
                </Stack>
              </Table.Td>
              <Table.Td>{def.dataType}</Table.Td>
              <Table.Td>
                <Text size="xs" c="dimmed">
                  {formatAppliesTo(def)}
                </Text>
              </Table.Td>
              <Table.Td>{def.isFilterable ? "Yes" : "No"}</Table.Td>
              <Table.Td>{def.isRequired ? "Yes" : "No"}</Table.Td>
              <Table.Td>
                <Badge size="sm" variant="light">
                  {def.displayWidth ?? "full"}
                </Badge>
              </Table.Td>
              <Table.Td>{def.sortOrder ?? 0}</Table.Td>
              <Table.Td>
                {def.dataType === "ENUM" ? (() => {
                  const active = Array.isArray(def.options)
                    ? def.options.filter(
                        (opt: any) => !opt.isArchived && !opt.mergedIntoId
                      )
                    : [];
                  if (!active.length) {
                    return (
                      <Text size="xs" c="dimmed">
                        No options
                      </Text>
                    );
                  }
                  return (
                    <Text size="xs" c="dimmed">
                      {active.map((opt: any) => opt.label).join(", ")}
                    </Text>
                  );
                })() : (
                  ""
                )}
              </Table.Td>
              <Table.Td>
                <Form method="post">
                  <input type="hidden" name="_intent" value="delete" />
                  <input type="hidden" name="id" value={def.id} />
                  <Group gap="xs">
                    <Button
                      variant="light"
                      size="xs"
                      type="button"
                      onClick={() => openEdit(def.id)}
                    >
                      Edit
                    </Button>
                    <Button color="red" variant="light" type="submit" size="xs">
                      Delete
                    </Button>
                  </Group>
                </Form>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {!definitions.length && (
        <Text c="dimmed">No product metadata definitions yet.</Text>
      )}
      <Drawer
        opened={drawerOpen}
        onClose={closeDrawer}
        title={editingDef ? "Edit Definition" : "New Definition"}
        position="right"
        size="xl"
      >
        <Form method="post" key={formKey}>
          <input
            type="hidden"
            name="_intent"
            value={editingDef ? "update" : "create"}
          />
          {editingDef ? (
            <input type="hidden" name="id" value={editingDef.id} />
          ) : null}
          <Stack gap="md">
            <Card withBorder>
              <Stack gap="sm">
                <Text fw={600}>Identity</Text>
                <Group gap="sm" align="flex-end" wrap="wrap">
                  <TextInput
                    name="key"
                    label="Key"
                    required
                    defaultValue={editingDef?.key}
                  />
                  <TextInput
                    name="label"
                    label="Label"
                    required
                    defaultValue={editingDef?.label}
                  />
                  <Select
                    name="dataType"
                    label="Data Type"
                    data={DATA_TYPE_OPTIONS}
                    defaultValue={editingDef?.dataType ?? "STRING"}
                    comboboxProps={{ withinPortal: true }}
                  />
                </Group>
              </Stack>
            </Card>
            <Card withBorder>
              <Stack gap="sm">
                <Text fw={600}>Applicability</Text>
                <Textarea
                  name="appliesToProductTypes"
                  label="Applies To Product Types"
                  autosize
                  minRows={2}
                  defaultValue={
                    editingDef?.appliesToProductTypes?.join("\n") ?? ""
                  }
                />
                <Group gap="sm" align="flex-start" wrap="wrap">
                  <Textarea
                    name="appliesToCategoryIds"
                    label="Applies To Category IDs"
                    autosize
                    minRows={2}
                    defaultValue={formatAppliesToIdsInput(
                      editingDef?.appliesToCategoryIds
                    )}
                  />
                  <Textarea
                    name="appliesToSubcategoryIds"
                    label="Applies To Subcategory IDs"
                    autosize
                    minRows={2}
                    defaultValue={formatAppliesToIdsInput(
                      editingDef?.appliesToSubcategoryIds
                    )}
                  />
                </Group>
              </Stack>
            </Card>
            <Card withBorder>
              <Stack gap="sm">
                <Text fw={600}>Field Behavior</Text>
                <Group gap="sm" align="flex-end" wrap="wrap">
                  <Checkbox
                    name="isFilterable"
                    label="Filterable"
                    defaultChecked={editingDef?.isFilterable}
                  />
                  <Checkbox
                    name="isRequired"
                    label="Required"
                    defaultChecked={editingDef?.isRequired}
                  />
                </Group>
              </Stack>
            </Card>
            {editingDef?.dataType === "ENUM" && editingDef?.id ? (
              <Card withBorder>
                <Stack gap="sm">
                  <Text fw={600}>Options Manager</Text>
                  <Form method="post">
                    <input type="hidden" name="_intent" value="option.create" />
                    <input
                      type="hidden"
                      name="definitionId"
                      value={editingDef.id}
                    />
                    <Group gap="sm" align="flex-end" wrap="wrap">
                      <TextInput
                        label="Add option"
                        placeholder="New option label"
                        name="label"
                        value={newOptionLabel}
                        onChange={(event) =>
                          setNewOptionLabel(event.currentTarget.value)
                        }
                      />
                      <Button type="submit" size="xs" loading={busy}>
                        Add
                      </Button>
                    </Group>
                  </Form>
                  <Table withTableBorder withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>
                          <Checkbox
                            checked={
                              selectedOptionIds.length > 0 &&
                              selectedOptionIds.length ===
                                (editingDef?.options || []).filter(
                                  (opt: any) => !opt.mergedIntoId
                                ).length
                            }
                            indeterminate={
                              selectedOptionIds.length > 0 &&
                              selectedOptionIds.length <
                                (editingDef?.options || []).filter(
                                  (opt: any) => !opt.mergedIntoId
                                ).length
                            }
                            onChange={(event) => {
                              const checked = event.currentTarget.checked;
                              if (!checked) {
                                setSelectedOptionIds([]);
                                return;
                              }
                              const ids = (editingDef?.options || [])
                                .filter((opt: any) => !opt.mergedIntoId)
                                .map((opt: any) => opt.id);
                              setSelectedOptionIds(ids);
                            }}
                          />
                        </Table.Th>
                        <Table.Th>Label</Table.Th>
                        <Table.Th>Slug</Table.Th>
                        <Table.Th>Usage</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Actions</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {(editingDef?.options || []).map((opt: any) => {
                        const isMerged = Boolean(opt.mergedIntoId);
                        const statusLabel = isMerged
                          ? `Merged → ${opt.mergedInto?.label ?? opt.mergedIntoId}`
                          : opt.isArchived
                          ? "Archived"
                          : "Active";
                        const usageCount = opt._count?.values ?? 0;
                        const isChecked = selectedOptionIds.includes(opt.id);
                        return (
                          <Table.Tr key={opt.id}>
                            <Table.Td>
                              <Checkbox
                                checked={isChecked}
                                disabled={isMerged}
                                onChange={(event) => {
                                  const checked = event.currentTarget.checked;
                                  setSelectedOptionIds((prev) =>
                                    checked
                                      ? [...prev, opt.id]
                                      : prev.filter((id) => id !== opt.id)
                                  );
                                }}
                              />
                            </Table.Td>
                            <Table.Td>
                              <Form method="post">
                                <input
                                  type="hidden"
                                  name="_intent"
                                  value="option.rename"
                                />
                                <input
                                  type="hidden"
                                  name="optionId"
                                  value={opt.id}
                                />
                                <Group gap="xs" align="flex-end" wrap="nowrap">
                                  <TextInput
                                    name="label"
                                    size="xs"
                                    defaultValue={opt.label}
                                  />
                                  <Button type="submit" size="xs" variant="subtle">
                                    Save
                                  </Button>
                                </Group>
                              </Form>
                            </Table.Td>
                            <Table.Td>
                              <Text size="xs" c="dimmed">
                                {opt.slug}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="xs">{usageCount}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="xs" c="dimmed">
                                {statusLabel}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              {isMerged ? (
                                <Text size="xs" c="dimmed">
                                  —
                                </Text>
                              ) : (
                                <Form method="post">
                                  <input
                                    type="hidden"
                                    name="_intent"
                                    value={
                                      opt.isArchived
                                        ? "option.unarchive"
                                        : "option.archive"
                                    }
                                  />
                                  <input
                                    type="hidden"
                                    name="optionId"
                                    value={opt.id}
                                  />
                                  <Button
                                    type="submit"
                                    size="xs"
                                    variant="subtle"
                                  >
                                    {opt.isArchived ? "Unarchive" : "Archive"}
                                  </Button>
                                </Form>
                              )}
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                  <Group gap="sm" align="flex-end" wrap="wrap">
                    <Select
                      label="Merge target"
                      data={mergeTargetOptions}
                      value={mergeTargetId}
                      onChange={(value) => setMergeTargetId(value || "")}
                      placeholder="Select target"
                      comboboxProps={{ withinPortal: true }}
                    />
                    <Button
                      size="xs"
                      variant="light"
                      disabled={
                        !mergeTargetId || selectedOptionIds.length === 0
                      }
                      onClick={() => {
                        const target = mergeTargetOptions.find(
                          (opt) => opt.value === mergeTargetId
                        );
                        const selected = (editingDef?.options || []).filter(
                          (opt: any) => selectedOptionIds.includes(opt.id)
                        );
                        const usageTotal = selected.reduce(
                          (sum: number, opt: any) =>
                            sum + (opt._count?.values ?? 0),
                          0
                        );
                        const confirmText = `Merge ${selected.length} option(s) into "${target?.label}"? This will move ${usageTotal} value(s).`;
                        if (!window.confirm(confirmText)) return;
                        const data = new FormData();
                        data.set("_intent", "option.merge");
                        data.set("targetId", mergeTargetId);
                        data.set("sourceIds", selectedOptionIds.join(","));
                        submit(data, { method: "post" });
                      }}
                    >
                      Merge Selected
                    </Button>
                  </Group>
                </Stack>
              </Card>
            ) : null}
            <Card withBorder>
              <Stack gap="sm">
                <Text fw={600}>Display</Text>
                <Group gap="sm" align="flex-end" wrap="wrap">
                  <TextInput
                    name="sortOrder"
                    label="Sort"
                    placeholder="0"
                    defaultValue={editingDef?.sortOrder ?? 0}
                  />
                  <Select
                    name="displayWidth"
                    label="Display Width"
                    data={ATTRIBUTE_DISPLAY_WIDTH_OPTIONS}
                    defaultValue={editingDef?.displayWidth ?? "full"}
                    comboboxProps={{ withinPortal: true }}
                  />
                </Group>
              </Stack>
            </Card>
            <Card withBorder>
              <Stack gap="sm">
                <Text fw={600}>Validation JSON</Text>
                <Textarea
                  name="validation"
                  autosize
                  minRows={3}
                  defaultValue={
                    editingDef?.validation
                      ? JSON.stringify(editingDef.validation, null, 2)
                      : ""
                  }
                />
              </Stack>
            </Card>
            <Divider />
            <Group justify="flex-end">
              <Button variant="default" onClick={closeDrawer}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                {editingDef ? "Save" : "Create"}
              </Button>
            </Group>
          </Stack>
        </Form>
      </Drawer>
    </Stack>
  );
}
