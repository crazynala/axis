import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { BreadcrumbSet, useInitGlobalFormContext } from "@aa/timber";
import { useRecordContext } from "../base/record/RecordContext";
import { Card, Divider, Group, Stack, Title, Button } from "@mantine/core";
import { ExpenseDetailForm } from "~/modules/expense/forms/ExpenseDetailForm";
import { useForm } from "react-hook-form";
import { useEffect } from "react";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.expense ? `Expense ${data.expense.id}` : "Expense" },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Invalid id", { status: 400 });
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) return redirect("/expenses");
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
  const { setCurrentId } = useRecordContext();
  const submit = useSubmit();
  // Register current id for global prev/next navigation
  useEffect(() => {
    setCurrentId(expense.id);
  }, [expense.id, setCurrentId]);
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
  // Prev/Next hotkeys handled globally in RecordProvider

  return (
    <Stack>
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Expenses", href: "/expenses" },
            { label: String(expense.id), href: `/expenses/${expense.id}` },
          ]}
        />
        <Group gap="xs"></Group>
      </Group>
      <ExpenseDetailForm mode="edit" form={form as any} expense={expense} />
    </Stack>
  );
}
