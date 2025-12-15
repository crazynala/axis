import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import { action as productAction } from "./products.$id._index";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { Button, Card, Group, Stack, Title } from "@mantine/core";
import { useForm } from "react-hook-form";
import { ProductDetailForm } from "../components/ProductDetailForm";
import { prismaBase } from "~/utils/prisma.server";
import { GlobalFormProvider, SaveCancelHeader } from "@aa/timber";

export const meta: MetaFunction = () => [{ title: "New Product" }];

export async function loader(_args: LoaderFunctionArgs) {
  const productTemplates = await prismaBase.productTemplate.findMany({
    where: { isActive: true },
    select: {
      id: true,
      code: true,
      label: true,
      productType: true,
      defaultCategoryId: true,
      defaultSubCategoryId: true,
      defaultExternalStepType: true,
      requiresSupplier: true,
      requiresCustomer: true,
      defaultStockTracking: true,
      defaultBatchTracking: true,
      skuSeriesKey: true,
    },
    orderBy: [{ productType: "asc" }, { code: "asc" }],
  });
  return json({
    product: {
      id: 0,
      sku: "",
      name: "",
      description: "",
      type: "",
      costPrice: null,
      manualSalePrice: null,
      stockTrackingEnabled: false,
      batchTrackingEnabled: false,
    },
    productTemplates,
  });
}

export async function action(args: ActionFunctionArgs) {
  // Delegate to products.$id action with params.id = 'new'
  return productAction({
    ...(args as any),
    params: { ...(args.params as any), id: "new" },
  } as any);
}

export default function NewProductRoute() {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const { productTemplates } = useLoaderData<typeof loader>();
  const form = useForm({
    defaultValues: {
      sku: "",
      name: "",
      type: "",
      costPrice: undefined as any,
      manualSalePrice: undefined as any,
      stockTrackingEnabled: false,
      batchTrackingEnabled: false,
      leadTimeDays: "",
      templateId: "",
      categoryId: "",
      subCategoryId: "",
    },
  });
  const pickedTemplateId = form.watch("templateId");
  const handleTemplatePick = (id: number) => {
    form.setValue("templateId", id, { shouldDirty: true });
  };
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const values = form.getValues();
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined || v === null || v === "") continue;
      if (typeof v === "boolean") {
        if (v) fd.set(k, "on");
      } else {
        fd.set(k, String(v));
      }
    }
    submit(fd, { method: "post" });
  };
  return (
    <GlobalFormProvider>
      <Stack>
        <Title order={2}>Create New Product</Title>
        <SaveCancelHeader />
        <Group gap="xs" wrap="wrap">
          {productTemplates.map((t) => {
            const active = pickedTemplateId === t.id;
            return (
              <Button
                key={t.id}
                variant={active ? "filled" : "light"}
                onClick={() => handleTemplatePick(t.id)}
              >
                {t.label || t.code}
              </Button>
            );
          })}
        </Group>
        {pickedTemplateId ? (
          <form onSubmit={onSubmit}>
            <ProductDetailForm
              mode="edit"
              form={form as any}
              requireTemplate
              hideTemplateField
              templateOptions={productTemplates.map((t) => ({
                value: String(t.id),
                label: t.label || t.code,
              }))}
              templateDefs={Object.fromEntries(
                productTemplates.map((t) => [String(t.id), t])
              )}
            />
            <Group mt="md">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving..." : "Create"}
              </Button>
            </Group>
          </form>
        ) : (
          <Card withBorder padding="md">
            Choose a template above to start a new product.
          </Card>
        )}
      </Stack>
    </GlobalFormProvider>
  );
}
