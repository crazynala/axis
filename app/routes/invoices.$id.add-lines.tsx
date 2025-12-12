import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { Card, Group, Stack, Title, Button } from "@mantine/core";
import { prisma } from "../utils/prisma.server";
import { getCostingsPendingInvoicing } from "../modules/invoice/services/costing";
import { getShipmentsPendingInvoicing } from "../modules/invoice/services/shipment";
import { getPOLinesPendingInvoicing } from "../modules/invoice/services/po";
import { getExpensesPendingInvoicing } from "../modules/invoice/services/expense";
import { InvoiceInvoicingTabs } from "../modules/invoice/components/InvoiceInvoicingTabs";
import { createInvoiceLines } from "../modules/invoice/services/invoicing";

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Invalid id", { status: 400 });
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, companyId: true, invoiceCode: true },
  });
  if (!invoice) return redirect("/invoices");

  const costings = await getCostingsPendingInvoicing(invoice.companyId);
  const pendingShipments = await getShipmentsPendingInvoicing(invoice.companyId);
  const pendingPoLines = await getPOLinesPendingInvoicing(invoice.id);
  const pendingExpenses = await getExpensesPendingInvoicing(invoice.companyId);

  return json({
    invoice,
    costings,
    shipments: pendingShipments,
    poLines: pendingPoLines,
    expenses: pendingExpenses,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const idRaw = params.id;
  const id = idRaw ? Number(idRaw) : NaN;
  if (!Number.isFinite(id)) return redirect("/invoices");
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (intent.startsWith("costing.")) {
    const costingId = Number(form.get("costingId"));
    if (!Number.isFinite(costingId)) return redirect(`/invoices/${id}`);
    if (intent === "costing.enable") {
      await prisma.costing.update({
        where: { id: costingId },
        data: { flagIsDisabled: false },
      });
    } else if (intent === "costing.disable") {
      const costing = await prisma.costing.findUnique({
        where: { id: costingId },
        select: { flagDefinedInProduct: true },
      });
      if (costing?.flagDefinedInProduct) {
        await prisma.costing.update({
          where: { id: costingId },
          data: { flagIsDisabled: true },
        });
      }
    } else if (intent === "costing.delete") {
      const costing = await prisma.costing.findUnique({
        where: { id: costingId },
        select: { flagDefinedInProduct: true },
      });
      if (costing && !costing.flagDefinedInProduct) {
        await prisma.costing.delete({ where: { id: costingId } });
      }
    }
    return redirect(`/invoices/${id}/add-lines`);
  }
  if (intent === "invoice.addLines") {
    const itemsRaw = form.get("items") as string | null;
    const items = itemsRaw ? JSON.parse(itemsRaw) : [];
    await createInvoiceLines(id, Array.isArray(items) ? items : []);
    return redirect(`/invoices/${id}`);
  }
  return redirect(`/invoices/${id}`);
}

export default function InvoiceAddLinesRoute() {
  const { invoice, costings, shipments, poLines, expenses } =
    useLoaderData<typeof loader>();

  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={3}>
          Add charges — Invoice {invoice.invoiceCode ?? invoice.id}
        </Title>
        <Button component={Link} to={`/invoices/${invoice.id}`} variant="default">
          Back to invoice
        </Button>
      </Group>
      <Card withBorder padding="md">
        <InvoiceInvoicingTabs
          costings={costings as any}
          shipments={shipments as any}
          poLines={poLines as any}
          expenses={expenses as any}
        />
      </Card>
    </Stack>
  );
}
