import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import { action as productAction } from "./products.$id._index";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import { Button, Card, Group, Stack, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { ProductDetailForm } from "../components/ProductDetailForm";
import { prismaBase } from "~/utils/prisma.server";
import { GlobalFormProvider, SaveCancelHeader } from "@aa/timber";
import { computeProductValidation } from "../validation/computeProductValidation";
import { getAllProductAttributeDefinitions } from "~/modules/productMetadata/services/productMetadata.server";
import { buildProductMetadataDefaults } from "~/modules/productMetadata/utils/productMetadataFields";

export const meta: MetaFunction = () => [{ title: "New Product" }];

export async function loader(_args: LoaderFunctionArgs) {
  const metadataDefinitions = await getAllProductAttributeDefinitions();
  const pricingSpecs = await prismaBase.pricingSpec.findMany({
    where: { target: "SELL" },
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      curveFamily: true,
      ranges: {
        orderBy: { rangeFrom: "desc" },
        select: {
          id: true,
          rangeFrom: true,
          rangeTo: true,
          multiplier: true,
        },
      },
    },
  });
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
    metadataDefinitions,
    pricingSpecOptions: pricingSpecs.map((spec) => ({
      value: String(spec.id),
      label: spec.name || spec.code || spec.curveFamily || `#${spec.id}`,
    })),
    pricingSpecRangesById: pricingSpecs.reduce<
      Record<
        string,
        Array<{
          id: number;
          rangeFrom: number | null;
          rangeTo: number | null;
          multiplier: string;
        }>
      >
    >((acc, spec) => {
      acc[String(spec.id)] = (spec.ranges || []).map((range) => ({
        id: range.id,
        rangeFrom: range.rangeFrom ?? null,
        rangeTo: range.rangeTo ?? null,
        multiplier: String(range.multiplier),
      }));
      return acc;
    }, {}),
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
  const actionData = useActionData<typeof action>();
  const {
    productTemplates,
    metadataDefinitions,
    pricingSpecOptions,
    pricingSpecRangesById,
  } =
    useLoaderData<typeof loader>();
  const [focusMissingRequired, setFocusMissingRequired] = useState<
    (() => void) | null
  >(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  useEffect(() => {
    if (!actionData || typeof actionData !== "object") return;
    const error = (actionData as any).error;
    if (!error) return;
    notifications.show({
      color: "red",
      title: "Create failed",
      message: String(error),
    });
  }, [actionData]);
  const metadataDefaults = useMemo(
    () => buildProductMetadataDefaults(metadataDefinitions, null),
    [metadataDefinitions]
  );
  const form = useForm({
    defaultValues: {
      sku: "",
      name: "",
      type: "",
      costPrice: undefined as any,
      manualSalePrice: undefined as any,
      pricingModel: "COST_PLUS_MARGIN",
      baselinePriceAtMoq: null,
      transferPercent: 0.75,
      stockTrackingEnabled: false,
      batchTrackingEnabled: false,
      leadTimeDays: "",
      templateId: "",
      categoryId: "",
      subCategoryId: "",
      ...(metadataDefaults as any),
    },
    shouldUnregister: false,
  });
  const watched = form.watch();
  const validation = useMemo(
    () =>
      computeProductValidation({
        type: watched.type,
        sku: watched.sku,
        name: watched.name,
        categoryId: watched.categoryId,
        templateId: watched.templateId,
        supplierId: watched.supplierId,
        customerId: watched.customerId,
        variantSetId: watched.variantSetId,
        pricingModel: watched.pricingModel,
        pricingSpecId: watched.pricingSpecId,
        baselinePriceAtMoq: watched.baselinePriceAtMoq,
        costPrice: watched.costPrice,
        leadTimeDays: watched.leadTimeDays,
        externalStepType: watched.externalStepType,
      }),
    [watched]
  );
  const typeOptions = [
    { value: "FABRIC", label: "Fabric" },
    { value: "TRIM", label: "Trim" },
    { value: "PACKAGING", label: "Packaging" },
    { value: "FINISHED", label: "Finished" },
    { value: "CMT", label: "CMT" },
    { value: "SERVICE", label: "Service" },
  ];
  const handleTypePick = (value: string) => {
    form.setValue("type", value, { shouldDirty: true });
    // Conservative clearing: do not wipe populated fields
    // Apply safe defaults for stock/batch by type
    if (value === "FABRIC") {
      form.setValue("stockTrackingEnabled", true, { shouldDirty: true });
      form.setValue("batchTrackingEnabled", true, { shouldDirty: true });
    } else if (value === "TRIM" || value === "PACKAGING") {
      form.setValue("stockTrackingEnabled", true, { shouldDirty: true });
      form.setValue("batchTrackingEnabled", false, { shouldDirty: true });
    } else {
      form.setValue("stockTrackingEnabled", false, { shouldDirty: true });
      form.setValue("batchTrackingEnabled", false, { shouldDirty: true });
    }
    setAttemptedSubmit(false);
  };
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validation?.missingRequired?.length) {
      setAttemptedSubmit(true);
      focusMissingRequired?.();
      return;
    }
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
          {typeOptions.map((t) => {
            const active = watched.type === t.value;
            return (
              <Button
                key={t.value}
                variant={active ? "filled" : "light"}
                onClick={() => handleTypePick(t.value)}
              >
                {t.label}
              </Button>
            );
          })}
        </Group>
        {watched.type ? (
          <form onSubmit={onSubmit}>
            <ProductDetailForm
              mode="edit"
              form={form as any}
              validation={validation}
              onRegisterMissingFocus={setFocusMissingRequired}
              visibilityPolicy="strict"
              attemptedSubmit={attemptedSubmit}
              showSectionRollups={false}
              requiredIndicatorMode="inline"
              templateOptions={productTemplates.map((t) => ({
                value: String(t.id),
                label: t.label || t.code,
              }))}
              templateDefs={Object.fromEntries(
                productTemplates.map((t) => [String(t.id), t])
              )}
              metadataDefinitions={metadataDefinitions}
              pricingSpecOptions={pricingSpecOptions}
              pricingSpecRangesById={pricingSpecRangesById}
            />
            <Group mt="md">
              <Button
                type="submit"
                disabled={busy}
                onClick={() => {
                  if (validation?.missingRequired?.length) {
                    setAttemptedSubmit(true);
                    focusMissingRequired();
                    return;
                  }
                }}
              >
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
