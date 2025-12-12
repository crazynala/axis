import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import type { ValueListType } from "@prisma/client";
import {
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { Fragment, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { invalidateValueList } from "~/utils/options.server";
import { prisma } from "~/utils/prisma.server";
import { requireAdminUser } from "~/utils/auth.server";

type LoaderValueList = {
  id: number;
  code: string | null;
  label: string | null;
  value: string | null;
  parentId: number | null;
};

type LoaderData = {
  type: ValueListType;
  typeLabel: string;
  values: LoaderValueList[];
};

const LIST_TYPES = [
  "Tax",
  "Category",
  "ProductType",
  "JobType",
  "Currency",
  "ShippingMethod",
  "DefectReason",
] as const satisfies ValueListType[];

const listTypeLabels: Record<ValueListType, string> = {
  Tax: "Tax Codes",
  Category: "Category",
  ProductType: "Product Type",
  JobType: "Job Type",
  Currency: "Currency",
  ShippingMethod: "Shipping Method",
  DefectReason: "Defect Reasons",
};

function parseListType(raw?: string | null): ValueListType {
  if (!raw) throw redirect("/admin/value-lists");
  const normalized = raw.toLowerCase();
  const match = LIST_TYPES.find((value) => value.toLowerCase() === normalized);
  if (!match) throw redirect("/admin/value-lists");
  return match;
}

async function fetchValueLists(type: ValueListType): Promise<LoaderData> {
  const values = await prisma.valueList.findMany({
    where: { type },
    select: { id: true, code: true, label: true, value: true, parentId: true },
    orderBy:
      type === "Category"
        ? [{ parentId: "asc" }, { label: "asc" }]
        : [{ label: "asc" }],
  });

  return {
    type,
    typeLabel: listTypeLabels[type],
    values: values.map((value) => ({
      ...value,
      value: value.value ? value.value.toString() : null,
    })),
  };
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  await requireAdminUser(request);
  const type = parseListType(params.listType);
  return json(await fetchValueLists(type));
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireAdminUser(request);
  const type = parseListType(params.listType);
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "create") {
    const code = ((form.get("code") as string) || "").trim() || null;
    const label = ((form.get("label") as string) || "").trim() || null;
    const valueRaw = form.get("value") as string | null;
    const numericValue = valueRaw && valueRaw !== "" ? Number(valueRaw) : null;
    const parentIdRaw = form.get("parentId");
    const parentId =
      type === "Category" && parentIdRaw ? Number(parentIdRaw) : null;

    await prisma.valueList.create({
      data: {
        code,
        label,
        value: numericValue,
        type,
        ...(type === "Category"
          ? { parentId: Number.isFinite(parentId) ? parentId : null }
          : {}),
      },
    });
    invalidateValueList(type);
  } else if (intent === "delete") {
    const id = Number(form.get("id"));
    if (id) await prisma.valueList.delete({ where: { id } });
    invalidateValueList(type);
  }

  return json(await fetchValueLists(type));
}

export default function AdminValueListRoute() {
  const data = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const isCategory = data.type === "Category";

  const form = useForm<{
    code: string;
    label: string;
    value: number | null;
    parentId: string;
  }>({
    defaultValues: { code: "", label: "", value: null, parentId: "" },
  });

  const parentOptions = isCategory
    ? data.values
        .filter((value) => !value.parentId)
        .map((value) => ({
          value: String(value.id),
          label: value.label || `#${value.id}`,
        }))
    : [];

  const childrenByParent = useMemo(() => {
    const map = new Map<number, LoaderValueList[]>();
    data.values.forEach((value) => {
      if (!value.parentId) return;
      const children = map.get(value.parentId) || [];
      children.push(value);
      map.set(value.parentId, children);
    });
    for (const [, children] of map) {
      children.sort((a, b) => (a.label || "").localeCompare(b.label || ""));
    }
    return map;
  }, [data.values]);

  const rootValues = isCategory
    ? data.values
        .filter((value) => !value.parentId)
        .sort((a, b) => (a.label || "").localeCompare(b.label || ""))
    : data.values;

  return (
    <Stack>
      <Title order={3}>Value Lists: {data.typeLabel}</Title>
      <form
        onSubmit={form.handleSubmit((values) => {
          const fd = new FormData();
          fd.set("_intent", "create");
          if (values.code) fd.set("code", values.code);
          if (values.label) fd.set("label", values.label);
          if (values.value != null) fd.set("value", String(values.value));
          if (isCategory && values.parentId)
            fd.set("parentId", values.parentId);
          submit(fd, { method: "post" });
        })}
      >
        <Group align="flex-end" wrap="wrap">
          <TextInput label="Code" w={140} {...form.register("code")} />
          <TextInput label="Label" w={180} {...form.register("label")} />
          {isCategory ? (
            <Select
              label="Parent Category"
              placeholder="(none)"
              w={220}
              data={parentOptions}
              value={form.watch("parentId") || undefined}
              onChange={(value) => form.setValue("parentId", value || "")}
              clearable
            />
          ) : null}
          <Controller
            name="value"
            control={form.control}
            render={({ field }) => (
              <NumberInput
                label="Value"
                w={140}
                value={field.value ?? undefined}
                onChange={(value) =>
                  field.onChange(
                    value === "" || value == null ? null : Number(value)
                  )
                }
                allowDecimal
              />
            )}
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
            {isCategory ? <Table.Th>Parent</Table.Th> : null}
            <Table.Th>Value</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isCategory
            ? rootValues.map((parent) => (
                <Fragment key={parent.id}>
                  <ValueListRow
                    item={parent}
                    parentLabel={null}
                    busy={busy}
                    submit={submit}
                    isCategory
                  />
                  {(childrenByParent.get(parent.id) || []).map((child) => (
                    <ValueListRow
                      key={child.id}
                      item={child}
                      parentLabel={parent.label}
                      busy={busy}
                      submit={submit}
                      isCategory
                      isChild
                    />
                  ))}
                </Fragment>
              ))
            : data.values.map((value) => (
                <ValueListRow
                  key={value.id}
                  item={value}
                  parentLabel={null}
                  busy={busy}
                  submit={submit}
                />
              ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

type ValueListRowProps = {
  item: LoaderValueList;
  parentLabel: string | null;
  busy: boolean;
  submit: ReturnType<typeof useSubmit>;
  isCategory?: boolean;
  isChild?: boolean;
};

function ValueListRow({
  item,
  parentLabel,
  busy,
  submit,
  isCategory,
  isChild,
}: ValueListRowProps) {
  return (
    <Table.Tr>
      <Table.Td>{item.id}</Table.Td>
      <Table.Td>{item.code}</Table.Td>
      <Table.Td>
        {isChild ? (
          <Group gap={6} align="center">
            <Text c="dimmed">↳</Text>
            <Text>{item.label}</Text>
          </Group>
        ) : (
          item.label
        )}
      </Table.Td>
      {isCategory ? <Table.Td>{parentLabel || "—"}</Table.Td> : null}
      <Table.Td>{item.value ?? ""}</Table.Td>
      <Table.Td>
        <Button
          variant="light"
          color="red"
          disabled={busy}
          onClick={() => {
            const fd = new FormData();
            fd.set("_intent", "delete");
            fd.set("id", String(item.id));
            submit(fd, { method: "post" });
          }}
        >
          Delete
        </Button>
      </Table.Td>
    </Table.Tr>
  );
}
