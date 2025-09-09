import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import {
  BreadcrumbSet,
  useRecordBrowser,
  useMasterTable,
  useRecordBrowserShortcuts,
  useInitGlobalFormContext,
} from "@aa/timber";
import {
  Card,
  Divider,
  Group,
  Stack,
  TextInput,
  Title,
  Textarea,
  NumberInput,
} from "@mantine/core";
import { useForm } from "react-hook-form";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.expense ? `Expense ${data.expense.id}` : "Expense" },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Invalid id", { status: 400 });
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) throw new Response("Not found", { status: 404 });
  return json({ expense });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  if (form.get("_intent") === "expense.update") {
    const category = (form.get("category") as string) || null;
    const details = (form.get("details") as string) || null;
    const memo = (form.get("memo") as string) || null;
    const priceCost = form.get("priceCost")
      ? Number(form.get("priceCost"))
      : null;
    const priceSell = form.get("priceSell")
      ? Number(form.get("priceSell"))
      : null;
    const dateRaw = form.get("date") as string | null;
    const date = dateRaw ? new Date(dateRaw) : null;
    await prisma.expense.update({
      where: { id },
      data: { category, details, memo, priceCost, priceSell, date },
    });
    return redirect(`/expenses/${id}`);
  }
  return redirect(`/expenses/${id}`);
}

export default function ExpenseDetailRoute() {
  const { expense } = useLoaderData<typeof loader>();
  useRecordBrowserShortcuts(expense.id);
  const { records: masterRecords } = useMasterTable();
  const submit = useSubmit();
  const form = useForm({
    defaultValues: {
      id: expense.id,
      category: expense.category || "",
      details: expense.details || "",
      memo: expense.memo || "",
      priceCost: expense.priceCost ?? 0,
      priceSell: expense.priceSell ?? 0,
      date: expense.date
        ? new Date(expense.date).toISOString().slice(0, 10)
        : "",
    },
  });
  useInitGlobalFormContext(form as any, (values: any) => {
    const fd = new FormData();
    fd.set("_intent", "expense.update");
    fd.set("category", values.category || "");
    fd.set("details", values.details || "");
    fd.set("memo", values.memo || "");
    fd.set("priceCost", String(values.priceCost ?? ""));
    fd.set("priceSell", String(values.priceSell ?? ""));
    fd.set("date", values.date || "");
    submit(fd, { method: "post" });
  });
  const recordBrowser = useRecordBrowser(expense.id, masterRecords);
  return (
    <Stack>
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Expenses", href: "/expenses" },
            { label: String(expense.id), href: `/expenses/${expense.id}` },
          ]}
        />
      </Group>

      <Card withBorder padding="md">
        <Card.Section inheritPadding py="xs">
          <Title order={4}>Expense</Title>
        </Card.Section>
        <Divider my="xs" />
        <Stack gap={6}>
          <TextInput
            label="ID"
            value={String(expense.id)}
            readOnly
            mod="data-autoSize"
          />
          <TextInput
            label="Date"
            {...form.register("date")}
            placeholder="YYYY-MM-DD"
            mod="data-autoSize"
          />
          <TextInput
            label="Category"
            {...form.register("category")}
            mod="data-autoSize"
          />
          <TextInput
            label="Details"
            {...form.register("details")}
            mod="data-autoSize"
          />
          <TextInput
            label="Memo"
            {...form.register("memo")}
            mod="data-autoSize"
          />
          <TextInput
            label="Cost"
            {...form.register("priceCost")}
            mod="data-autoSize"
          />
          <TextInput
            label="Sell"
            {...form.register("priceSell")}
            mod="data-autoSize"
          />
        </Stack>
      </Card>
    </Stack>
  );
}
