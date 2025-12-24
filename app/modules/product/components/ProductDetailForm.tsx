import React from "react";
import {
  Card,
  Grid,
  SimpleGrid,
  Center,
  Group,
  Stack,
  Text,
  Tooltip,
  Accordion,
  Badge,
  Button,
} from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import { RenderGroup } from "../../../base/forms/fieldConfigShared";
import {
  getGlobalOptions,
  type OptionsData,
} from "../../../base/options/OptionsClient";
import {
  deriveExternalStepTypeFromCategoryCode,
  rulesForType,
} from "../rules/productTypeRules";
import { AxisChip, type AxisChipTone } from "~/components/AxisChip";
import { useOptions } from "~/base/options/OptionsContext";
import {
  productIdentityFields,
  productAssocFields,
  productPricingFields,
} from "../forms/productDetail";
import { buildProductMetadataFields } from "~/modules/productMetadata/utils/productMetadataFields";
import type { ProductAttributeDefinition } from "~/modules/productMetadata/types/productMetadata";
import { ProductCostTiersModal } from "../components/ProductCostTiersModal";
import { PricingPreviewWidget } from "./PricingPreviewWidget";
import type { ProductValidationResult } from "../validation/computeProductValidation";
import {
  getProductRequirements,
  productRequirementSpec,
} from "../validation/productRequirements";

export type ProductDetailFormProps = {
  mode: "edit" | "find" | "create";
  form: UseFormReturn<any>;
  product?: any; // initial product record when editing
  categoryOptions?: { value: string; label: string }[];
  subcategoryOptions?: { value: string; label: string }[];
  taxCodeOptions?: { value: string; label: string }[];
  templateOptions?: { value: string; label: string }[];
  requireTemplate?: boolean;
  hideTemplateField?: boolean;
  validation?: ProductValidationResult;
  onRegisterMissingFocus?: (fn: (() => void) | null) => void;
  visibilityPolicy?: "strict" | "conservative";
  attemptedSubmit?: boolean;
  showSectionRollups?: boolean;
  requiredIndicatorMode?: "inline" | "chips";
  hasMovements?: boolean;
  templateDefs?: Record<
    string,
    {
      id: number;
      code: string;
      label: string | null;
      productType: string;
      defaultCategoryId: number | null;
      defaultSubCategoryId: number | null;
      defaultExternalStepType?: string | null;
      requiresSupplier?: boolean | null;
      requiresCustomer?: boolean | null;
      defaultStockTracking?: boolean | null;
      defaultBatchTracking?: boolean | null;
      skuSeriesKey?: string | null;
    }
  >;
  metadataDefinitions?: ProductAttributeDefinition[];
};

export function ProductDetailForm({
  mode,
  form,
  product,
  categoryOptions,
  subcategoryOptions,
  templateOptions,
  templateDefs,
  validation,
  onRegisterMissingFocus,
  visibilityPolicy = "conservative",
  attemptedSubmit = false,
  showSectionRollups = true,
  requiredIndicatorMode = "chips",
  hasMovements,
  requireTemplate = false,
  hideTemplateField,
  metadataDefinitions = [],
}: ProductDetailFormProps) {
  const optionsCtx = useOptions();
  const [tiersOpen, setTiersOpen] = React.useState(false);
  // Live pricing prefs from the PricingPreviewWidget (qty + customer multiplier)
  function usePricingPrefsFromWidget() {
    const [qty, setQty] = React.useState<number>(() => {
      if (typeof window === "undefined") return 60;
      const raw = window.sessionStorage.getItem("pricing.qty");
      const n = raw ? Number(raw) : 60;
      return Number.isFinite(n) ? n : 60;
    });
    const [customerId, setCustomerId] = React.useState<string | null>(() => {
      if (typeof window === "undefined") return null;
      return window.sessionStorage.getItem("pricing.customerId");
    });
    const [priceMultiplier, setPriceMultiplier] = React.useState<number>(() => {
      if (typeof window === "undefined") return 1;
      const raw = window.sessionStorage.getItem("pricing.mult");
      const n = raw ? Number(raw) : 1;
      return Number.isFinite(n) ? n : 1;
    });
    const [preview, setPreview] = React.useState<any>(() => {
      if (typeof window === "undefined") return null;
      try {
        const raw = window.sessionStorage.getItem("pricing.preview");
        return raw ? JSON.parse(raw) : null;
      } catch {}
      return null;
    });
    const [margins, setMargins] = React.useState<{
      marginOverride?: number | null;
      vendorDefaultMargin?: number | null;
      globalDefaultMargin?: number | null;
    } | null>(() => {
      if (typeof window === "undefined") return null;
      try {
        const raw = window.sessionStorage.getItem("pricing.margins");
        return raw ? JSON.parse(raw) : null;
      } catch {}
      return null;
    });
    React.useEffect(() => {
      if (typeof window === "undefined") return;
      const handler = (e: any) => {
        const det = e?.detail || {};
        if (det.qty != null) {
          const q = Number(det.qty);
          setQty(Number.isFinite(q) ? q : 60);
        }
        if (det.customerId != null) {
          setCustomerId(String(det.customerId));
        }
        if (det.priceMultiplier != null) {
          const m = Number(det.priceMultiplier);
          setPriceMultiplier(Number.isFinite(m) ? m : 1);
        }
        if (det.margins != null) {
          setMargins(det.margins);
        }
      };
      window.addEventListener("pricing:prefs", handler as any);
      const onPreview = (e: any) => setPreview(e?.detail ?? null);
      window.addEventListener("pricing:preview", onPreview as any);
      return () => {
        window.removeEventListener("pricing:prefs", handler as any);
        window.removeEventListener("pricing:preview", onPreview as any);
      };
    }, []);
    return { qty, customerId, priceMultiplier, preview, margins } as const;
  }
  // Local caches for on-demand loaded ranges keyed by group id
  const [salePriceGroupRangesById, setSalePriceGroupRangesById] =
    React.useState<
      Record<string, Array<{ minQty: number; unitPrice: number }>>
    >({});
  const [costGroupRangesById, setCostGroupRangesById] = React.useState<
    Record<
      string,
      Array<{ minQty: number; unitCost: number; unitSellManual: number }>
    >
  >({});

  // Seed caches from loaded product baseline (does not change after mount)
  React.useEffect(() => {
    const nextSale: Record<
      string,
      Array<{ minQty: number; unitPrice: number }>
    > = {};
    const spgId = product?.salePriceGroupId ?? product?.salePriceGroup?.id;
    const saleRanges = (product?.salePriceGroup?.saleRanges || []) as any[];
    if (spgId && Array.isArray(saleRanges) && saleRanges.length) {
      nextSale[String(spgId)] = saleRanges
        .filter((r: any) => r && r.rangeFrom != null && r.price != null)
        .map((r: any) => ({
          minQty: Number(r.rangeFrom) || 0,
          unitPrice: Number(r.price) || 0,
        }))
        .sort((a, b) => a.minQty - b.minQty);
    }
    const nextCost: Record<
      string,
      Array<{ minQty: number; unitCost: number; unitSellManual: number }>
    > = {};
    const cgId = product?.costGroupId ?? product?.costGroup?.id;
    const costRanges = (product?.costGroup?.costRanges || []) as any[];
    if (cgId && Array.isArray(costRanges) && costRanges.length) {
      nextCost[String(cgId)] = costRanges
        .filter((r: any) => r && r.rangeFrom != null)
        .map((r: any) => ({
          minQty: Number(r.rangeFrom) || 0,
          unitCost: Number(r.costPrice ?? 0) || 0,
          unitSellManual: Number(r.sellPriceManual ?? 0) || 0,
        }))
        .sort((a, b) => a.minQty - b.minQty);
    }
    if (Object.keys(nextSale).length)
      setSalePriceGroupRangesById((prev) => ({ ...prev, ...nextSale }));
    if (Object.keys(nextCost).length)
      setCostGroupRangesById((prev) => ({ ...prev, ...nextCost }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  // Watch form fields for changes and fetch ranges on demand
  const watchedSaleGroupId = form.watch("salePriceGroupId") as unknown as
    | number
    | string
    | undefined;
  const watchedCostGroupId = (form as any).watch?.("costGroupId") as
    | number
    | string
    | undefined;
  const costPriceLocked = React.useMemo(() => {
    if (mode === "find") return false;
    const raw =
      watchedCostGroupId != null && watchedCostGroupId !== ""
        ? watchedCostGroupId
        : product?.costGroupId;
    if (raw == null || raw === "") return false;
    const num = Number(raw);
    if (Number.isFinite(num)) return num > 0;
    return true;
  }, [mode, watchedCostGroupId, product?.costGroupId]);

  React.useEffect(() => {
    const id = watchedSaleGroupId != null ? Number(watchedSaleGroupId) : NaN;
    if (!Number.isFinite(id) || id <= 0) return;
    const key = String(id);
    if (salePriceGroupRangesById[key]) return; // already cached
    let abort = false;
    (async () => {
      try {
        const res = await fetch(`/api/sale-price-groups/${id}/ranges`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          ranges?: Array<{ minQty: number; unitPrice: number }>;
        };
        if (!abort && data?.ranges) {
          setSalePriceGroupRangesById((prev) => ({
            ...prev,
            [key]: data.ranges!,
          }));
        }
      } catch {}
    })();
    return () => {
      abort = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedSaleGroupId]);

  React.useEffect(() => {
    const id = watchedCostGroupId != null ? Number(watchedCostGroupId) : NaN;
    if (!Number.isFinite(id) || id <= 0) return;
    const key = String(id);
    if (costGroupRangesById[key]) return; // already cached
    let abort = false;
    (async () => {
      try {
        const res = await fetch(`/api/cost-groups/${id}/ranges`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          ranges?: Array<{
            minQty: number;
            unitCost: number;
            unitSellManual: number;
          }>;
        };
        if (!abort && data?.ranges) {
          setCostGroupRangesById((prev) => ({ ...prev, [key]: data.ranges! }));
        }
      } catch {}
    })();
    return () => {
      abort = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCostGroupId]);

  const hasCostTiers = React.useMemo(() => {
    const ranges = (product?.costGroup?.costRanges || []) as any[];
    if (Array.isArray(ranges) && ranges.length > 1) return true;
    const cid = watchedCostGroupId != null ? String(watchedCostGroupId) : null;
    const fetched = cid ? costGroupRangesById[cid] || [] : [];
    return fetched.length > 1;
  }, [product, watchedCostGroupId, costGroupRangesById]);
  const pricingPrefs = usePricingPrefsFromWidget();
  const templateId = form.watch("templateId");
  const template =
    templateId && templateDefs ? templateDefs[String(templateId)] : null;
  const needsTemplate = Boolean(requireTemplate && !template);
  const typeValue = form.watch("type");
  const supplierId = form.watch("supplierId");
  const customerId = form.watch("customerId");
  const variantSetId = form.watch("variantSetId");
  const stockTracking = form.watch("stockTrackingEnabled");
  const batchTracking = form.watch("batchTrackingEnabled");
  const costPriceValue = form.watch("costPrice");
  const categoryId = form.watch("categoryId");
  const externalStepValue = form.watch("externalStepType");
  const requirements = React.useMemo(
    () => getProductRequirements(typeValue || product?.type || null),
    [typeValue, product?.type]
  );
  const formValues = form.watch();
  const isFieldFilled = React.useCallback(
    (fieldName: string | undefined) => {
      if (!fieldName) return false;
      const val = (formValues as any)[fieldName];
      if (val === null || val === undefined) return false;
      if (typeof val === "string") return val.trim() !== "";
      return true;
    },
    [formValues]
  );
  const shouldRenderField = React.useCallback(
    (fieldName: string | undefined) => {
      if (!fieldName) return true;
      const level = requirements.fields[fieldName];
      const notApplicable = level === "notApplicable";
      if (visibilityPolicy === "strict") {
        return !notApplicable;
      }
      // conservative: show if applicable, or if value exists, or if required/recommended
      if (!notApplicable) return true;
      if (isFieldFilled(fieldName)) return true;
      if (level === "required" || level === "recommended") return true;
      return false;
    },
    [requirements.fields, visibilityPolicy, isFieldFilled]
  );
  const filterFields = React.useCallback(
    (fields: any[]) => fields.filter((f) => shouldRenderField(f.name)),
    [shouldRenderField]
  );
  const legacyEntries = React.useMemo(() => {
    const list: Array<{ name: string; label: string }> = [];
    for (const [name, meta] of Object.entries(productRequirementSpec)) {
      const level = requirements.fields[name];
      if (level !== "notApplicable") continue;
      if (!isFieldFilled(name)) continue;
      list.push({ name, label: meta.label });
    }
    return list;
  }, [requirements.fields, isFieldFilled]);
  const [legacyOpen, setLegacyOpen] = React.useState(false);
  const requiredStates = React.useMemo(() => {
    const map: Record<
      string,
      { state: "warn" | "error"; message: string } | undefined
    > = {};
    const touched = form.formState.touchedFields || {};
    const missingRequired = (fieldName: string) =>
      requirements.fields[fieldName] === "required" && !isFieldFilled(fieldName);
    const warnGate =
      requiredIndicatorMode === "inline" &&
      (attemptedSubmit || !!typeValue || Object.keys(touched || {}).length > 0);
    for (const name of Object.keys(requirements.fields)) {
      if (!missingRequired(name)) continue;
      if (attemptedSubmit) {
        map[name] = { state: "error", message: "Required" };
      } else if (warnGate) {
        map[name] = { state: "warn", message: "Required" };
      }
    }
    return map;
  }, [
    requirements.fields,
    isFieldFilled,
    attemptedSubmit,
    form.formState.touchedFields,
    typeValue,
    requiredIndicatorMode,
  ]);
  const globalOptions = getGlobalOptions();
  const categoryMetaById =
    categoryOptions?.length || optionsCtx?.categoryMetaById
      ? optionsCtx?.categoryMetaById || globalOptions?.categoryMetaById
      : globalOptions?.categoryMetaById;
  const filteredCategoryOptions = React.useMemo(() => {
    const rules = rulesForType(typeValue);
    const group = (rules.categoryGroupCode || "").toUpperCase();
    const grouped =
      optionsCtx?.categoryOptionsByGroupCode ||
      globalOptions?.categoryOptionsByGroupCode ||
      null;
    if (grouped && group && grouped[group]?.length) {
      return grouped[group];
    }
    const opts =
      categoryOptions ||
      optionsCtx?.categoryOptions ||
      globalOptions?.categoryOptions ||
      [];
    const meta =
      categoryMetaById ||
      globalOptions?.categoryMetaById ||
      {};
    console.log("[product form] category meta available", {
      fromCtx: !!optionsCtx?.categoryMetaById,
      fromGlobal: !!globalOptions?.categoryMetaById,
      metaKeys: Object.keys(meta || {}).length,
    });
    if (!group) return opts;
    const filtered = opts.filter((o) => {
      const m = meta[String(o.value)];
      const parent = (m?.parentCode || "").toUpperCase();
      return parent === group.toUpperCase();
    });
    console.log("[product form] category filter", {
      typeValue,
      group,
      opts: opts.length,
      filtered: filtered.length,
    });
    return filtered;
  }, [categoryOptions, categoryMetaById, typeValue]);

  React.useEffect(() => {
    if (!template || !requireTemplate) return;
    form.setValue("type", template.productType, { shouldDirty: true });
    if (template.defaultCategoryId) {
      form.setValue("categoryId", template.defaultCategoryId, {
        shouldDirty: true,
      });
    }
    if (template.defaultSubCategoryId) {
      form.setValue("subCategoryId", template.defaultSubCategoryId, {
        shouldDirty: true,
      });
    } else {
      form.setValue("subCategoryId", "", { shouldDirty: true });
    }
    form.setValue(
      "stockTrackingEnabled",
      template.defaultStockTracking ?? false,
      { shouldDirty: true }
    );
      form.setValue("batchTrackingEnabled", template.defaultBatchTracking ?? false, {
        shouldDirty: true,
      });
    if (template.defaultExternalStepType) {
      form.setValue("externalStepType", template.defaultExternalStepType, {
        shouldDirty: true,
      });
    }
  }, [template, form, requireTemplate]);

  React.useEffect(() => {
    const isService = String(typeValue || "").toUpperCase() === "SERVICE";
    if (!isService) {
      form.setValue("externalStepType", null, { shouldDirty: true });
      return;
    }
    const meta = categoryMetaById?.[String(categoryId)];
    const implied = deriveExternalStepTypeFromCategoryCode(meta?.code);
    console.log("[product form] external step derive", {
      typeValue,
      categoryId,
      meta,
      implied,
      current: form.getValues("externalStepType"),
    });
    const current = form.getValues("externalStepType");
    if (implied && current !== implied) {
      form.setValue("externalStepType", implied, { shouldDirty: true });
    } else if (!implied && current) {
      form.setValue("externalStepType", null, { shouldDirty: true });
    }
  }, [typeValue, categoryId, categoryMetaById, form]);

  type InlineChip = {
    tone: AxisChipTone;
    label: string;
    tooltip: string;
    action?: { label: string; onClick: () => void; tooltip?: string };
  };
  const assocChips = React.useMemo(() => {
    const chips: InlineChip[] = [];
    const rules = rulesForType(typeValue);
    const typeLabel =
      String(typeValue || product?.type || "Product").toUpperCase();
    const isFabric = typeLabel === "FABRIC";
    if (!categoryId) {
      chips.push({
        tone: "warning",
        label: "Category missing",
        tooltip: "Pick a category to align templates and SKU rules.",
      });
    }
    if (needsTemplate) {
      chips.push({
        tone: "warning",
        label: "Template required",
        tooltip: "Select a template to continue editing this product.",
      });
    }
    if (rules.requireSupplier && !supplierId) {
      chips.push({
        tone: "warning",
        label: "Supplier required",
        tooltip: `${typeLabel} products need a supplier.`,
      });
    }
    if (rules.requireCustomer && !customerId) {
      chips.push({
        tone: "warning",
        label: "Customer required",
        tooltip: `${typeLabel} products need a customer.`,
      });
    }
    if (!variantSetId && typeLabel === "FINISHED") {
      chips.push({
        tone: "info",
        label: "No variant set",
        tooltip: "Add a variant set to manage sizes/colors if applicable.",
      });
    }
    return chips;
  }, [
    typeValue,
    product?.type,
    categoryId,
    needsTemplate,
    supplierId,
    customerId,
    variantSetId,
  ]);

  const stockChips = React.useMemo(() => {
    const chips: InlineChip[] = [];
    const rules = rulesForType(typeValue);
    const typeLabel =
      String(typeValue || product?.type || "Product").toUpperCase();
    const isSupply =
      ["FABRIC", "TRIM", "PACKAGING"].includes(typeLabel) ||
      (rules.requireSupplier && typeLabel !== "SERVICE");
    if (typeLabel === "FABRIC") {
      if (!stockTracking) {
        chips.push({
          tone: "warning",
          label: "⚠ Stock tracking OFF for FABRIC",
        tooltip: "Fabric must track stock to manage inventory accurately.",
        action: {
          label: "Enable",
          tooltip: "Toggle on stock tracking",
          onClick: () => form.setValue("stockTrackingEnabled", true, { shouldDirty: true }),
        },
      });
    } else if (batchTracking === false) {
      chips.push({
        tone: "warning",
        label: "⚠ Batch tracking OFF for FABRIC",
        tooltip: "Fabric with stock tracking should also enable batch tracking.",
        action: {
          label: "Enable",
          tooltip: "Toggle on batch tracking",
          onClick: () => form.setValue("batchTrackingEnabled", true, { shouldDirty: true }),
        },
      });
    }
    } else {
      if (isSupply && !stockTracking) {
        chips.push({
          tone: "warning",
          label: `⚠ Stock tracking OFF for ${typeLabel}`,
          tooltip: "Enable stock tracking for supply items to maintain on-hand counts.",
        });
      }
      if (isSupply && batchTracking === false) {
        chips.push({
          tone: "info",
          label: "Batch tracking off",
          tooltip: "Turn on batch tracking when you need lot traceability.",
        });
      }
    }
    if (costPriceValue == null || costPriceValue === "") {
      chips.push({
        tone: "neutral",
        label: "Cost price empty",
        tooltip: "Enter cost to improve pricing previews and costings.",
      });
    }
    return chips;
  }, [
    typeValue,
    product?.type,
    stockTracking,
    batchTracking,
    costPriceValue,
  ]);

  const renderInlineChips = (chips: InlineChip[], keyPrefix: string) =>
    chips.map((chip, idx) => (
      <Tooltip
        key={`${keyPrefix}-${idx}-${chip.label}`}
        label={chip.tooltip}
        withArrow
        multiline
        maw={260}
      >
        <AxisChip tone={chip.tone}>
          <Group gap={6} align="center" wrap="nowrap">
            <span>{chip.label}</span>
            {chip.action ? (
              <Tooltip
                label={chip.action.tooltip || ""}
                withArrow
                position="bottom"
                maw={240}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    chip.action?.onClick();
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    color: "inherit",
                    textDecoration: "underline",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {chip.action.label}
                </button>
              </Tooltip>
            ) : null}
          </Group>
        </AxisChip>
      </Tooltip>
    ));

  const focusField = React.useCallback(
    (fieldName?: string | null) => {
      if (!fieldName) return;
      try {
        form.setFocus(fieldName as any);
        const el = document?.querySelector?.(
          `[name="${fieldName}"]`
        ) as HTMLElement | null;
        if (el?.scrollIntoView) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } catch {}
    },
    [form]
  );

  const renderSectionRollup = (
    sectionKey:
      | "identity"
      | "classification"
      | "associations"
      | "pricing"
      | "inventory",
    label: string
  ) => {
    if (!validation) return null;
    const info = validation.bySection[sectionKey];
    if (!info) return null;
    const missingReq = info.missingRequired.length;
    const missingRec = info.missingRecommended.length;
    if (!missingReq && !missingRec) return null;
    const tone: AxisChipTone = missingReq ? "warning" : "info";
    const text = missingReq
      ? `Missing required: ${missingReq}`
      : `Recommended: ${missingRec} missing`;
    const tooltipLines = [
      missingReq ? `Required: ${info.missingRequired.join(", ")}` : null,
      missingRec ? `Recommended: ${info.missingRecommended.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    return (
      <AxisChip
        tone={tone}
        onClick={() => focusField(info.firstMissingField)}
        style={{ cursor: "pointer" }}
      >
        <Tooltip label={tooltipLines || label} withArrow multiline maw={280}>
          <span>{text}</span>
        </Tooltip>
      </AxisChip>
    );
  };

  React.useEffect(() => {
    if (!onRegisterMissingFocus) return;
    if (!validation || !validation.missingRequired.length) {
      onRegisterMissingFocus(null);
      return;
    }
    const sections = ["identity", "classification", "associations", "pricing", "inventory"] as const;
    const firstSection = sections.find(
      (s) => validation.bySection[s]?.missingRequired.length
    );
    const firstField =
      (firstSection ? validation.bySection[firstSection]?.firstMissingField : null) || null;
    onRegisterMissingFocus(() => focusField(firstField));
  }, [onRegisterMissingFocus, validation, focusField]);

  const ctx = React.useMemo(
    () => ({
      hasCostTiers,
      openCostTiersModal: () => setTiersOpen(true),
      product: product || {},
      customer: product?.customer || {},
      options: globalOptions
        ? { ...globalOptions, categoryOptions: filteredCategoryOptions }
        : optionsCtx
        ? { ...optionsCtx, categoryOptions: filteredCategoryOptions }
        : undefined,
      fieldOptions: {
        category: filteredCategoryOptions,
        subcategory:
          subcategoryOptions ||
          optionsCtx?.subcategoryOptions ||
          getGlobalOptions()?.subcategoryOptions ||
          [],
        productTemplate:
          templateOptions ||
          getGlobalOptions()?.productTemplateOptions?.map((t) => ({
            value: t.value,
            label: t.label,
          })) ||
          [],
      },
      // Provide dynamic ranges caches for computeDefault and previews
      salePriceGroupRangesById,
      costGroupRangesById,
      // Live pricing prefs from widget
      pricingQty: pricingPrefs.qty,
      priceMultiplier: pricingPrefs.priceMultiplier,
      pricingPreview: pricingPrefs.preview,
      pricingCustomerId: pricingPrefs.customerId,
      pricingMarginDefaults: pricingPrefs.margins,
      costPriceLocked,
      requiredStates,
      hasMovements,
    }),
    [
      hasCostTiers,
      product,
      categoryOptions,
      subcategoryOptions,
      salePriceGroupRangesById,
      costGroupRangesById,
      pricingPrefs.qty,
      pricingPrefs.priceMultiplier,
      pricingPrefs.preview,
      pricingPrefs.customerId,
      pricingPrefs.margins,
      costPriceLocked,
      templateOptions,
      requiredStates,
    ]
  );
  const metadataFields = React.useMemo(
    () => buildProductMetadataFields(metadataDefinitions),
    [metadataDefinitions]
  );

  return (
    <Grid>
      <input
        type="hidden"
        name="externalStepType"
        value={externalStepValue ?? ""}
        data-debug="externalStepType-hidden"
      />
      <Grid.Col span={{ base: 12, md: 12 }}>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Group justify="space-between" align="center" gap="xs">
                <Text size="sm" fw={600}>
                  Identity
                </Text>
                <Group gap="xs" wrap="wrap">
                  {showSectionRollups && requiredIndicatorMode !== "inline"
                    ? renderSectionRollup("identity", "Identity")
                    : null}
                </Group>
              </Group>
            </Card.Section>
            <RenderGroup
              form={form as any}
              fields={
                hideTemplateField
                  ? (filterFields(
                      productIdentityFields.filter(
                        (f) => f.name !== "templateId"
                      )
                    ) as any)
                  : (filterFields(productIdentityFields) as any)
              }
              mode={mode as any}
              ctx={ctx as any}
            />
          </Card>
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Group justify="space-between" align="center" gap="xs">
                <Text size="sm" fw={600}>
                  Classification / Supplier / Inventory
                </Text>
                <Group gap="xs" wrap="wrap">
                  {showSectionRollups && requiredIndicatorMode !== "inline"
                    ? renderSectionRollup("classification", "Classification")
                    : null}
                  {showSectionRollups && requiredIndicatorMode !== "inline"
                    ? renderSectionRollup("associations", "Associations")
                    : null}
                  {showSectionRollups && requiredIndicatorMode !== "inline"
                    ? renderSectionRollup("inventory", "Inventory")
                    : null}
                  {renderInlineChips(assocChips, "assoc")}
                </Group>
              </Group>
            </Card.Section>
            {needsTemplate ? (
              <Center mih={120}>Please select a template to continue.</Center>
            ) : (
              <RenderGroup
                form={form as any}
                fields={filterFields(productAssocFields) as any}
                mode={mode as any}
                ctx={ctx as any}
              />
            )}
          </Card>
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Group justify="space-between" align="center" gap="xs">
                <Text size="sm" fw={600}>
                  Stock & Pricing
                </Text>
                <Group gap="xs" wrap="wrap">
                  {showSectionRollups && requiredIndicatorMode !== "inline"
                    ? renderSectionRollup("pricing", "Pricing")
                    : null}
                  {renderInlineChips(stockChips, "stock")}
                </Group>
              </Group>
            </Card.Section>
            <Card.Section inheritPadding py={4}>
              <Stack gap={4}>
                {!stockTracking ? (
                  <Text size="xs" c="yellow.8">
                    Stock tracking is disabled; movements will not be recorded.
                  </Text>
                ) : batchTracking === false &&
                  String(typeValue || product?.type || "")
                    .toUpperCase()
                    .includes("FABRIC") ? (
                  <Text size="xs" c="yellow.8">
                    Batch tracking is disabled; receipts will not be attributed to batches.
                  </Text>
                ) : null}
                {stockTracking && hasMovements === false ? (
                  <Text size="xs" c="dimmed">
                    No stock movements yet.
                  </Text>
                ) : null}
              </Stack>
            </Card.Section>
            {needsTemplate ? null : (
              <RenderGroup
                form={form as any}
                fields={filterFields(productPricingFields) as any}
                mode={mode as any}
                ctx={ctx as any}
              />
            )}
            {product?.id ? (
              <Card.Section bg="dark.6" py={5} mt="xs">
                <Center>
                  <PricingPreviewWidget
                    productId={product.id}
                    vendorId={product?.supplierId ?? null}
                  />
                </Center>
              </Card.Section>
            ) : null}
          </Card>
        </SimpleGrid>
      </Grid.Col>
      {metadataFields.length ? (
        <Grid.Col span={{ base: 12 }}>
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Group justify="space-between" align="center" gap="xs">
                <Text size="sm" fw={600}>
                  Metadata
                </Text>
              </Group>
            </Card.Section>
            <RenderGroup
              form={form as any}
              fields={metadataFields as any}
              mode={mode as any}
              ctx={ctx as any}
            />
          </Card>
        </Grid.Col>
      ) : null}
      {legacyEntries.length ? (
        <Grid.Col span={{ base: 12 }}>
          <Accordion
            chevronPosition="left"
            defaultValue={legacyOpen ? "legacy" : undefined}
            value={legacyOpen ? "legacy" : undefined}
            onChange={(v) => setLegacyOpen(v === "legacy")}
          >
            <Accordion.Item value="legacy">
              <Accordion.Control>
                <Group justify="space-between" w="100%" wrap="wrap">
                  <Text fw={600}>Legacy / Cleanup</Text>
                  <Group gap="xs">
                    <AxisChip tone="neutral">
                      {legacyEntries.length} legacy value
                      {legacyEntries.length === 1 ? "" : "s"} present
                    </AxisChip>
                  </Group>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  {legacyEntries.map((entry) => (
                    <Group
                      key={entry.name}
                      justify="space-between"
                      align="center"
                      wrap="wrap"
                    >
                      <Group gap="xs" align="center">
                        <Text size="sm">{entry.label}</Text>
                        <Tooltip
                          label="Legacy value present; not used for this type."
                          withArrow
                          maw={260}
                        >
                          <Badge color="gray" variant="light">
                            Legacy value
                          </Badge>
                        </Tooltip>
                      </Group>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="subtle"
                          onClick={() => {
                            setLegacyOpen(true);
                            focusField(entry.name);
                          }}
                        >
                          Review
                        </Button>
                        <Button
                          size="xs"
                          color="red"
                          variant="light"
                          onClick={() => {
                            const ok = window.confirm(
                              `Clear legacy value for ${entry.label}? This requires Save to persist.`
                            );
                            if (!ok) return;
                            const current = (formValues as any)[entry.name];
                            const cleared =
                              typeof current === "boolean" ? false : "";
                            form.setValue(entry.name as any, cleared, {
                              shouldDirty: true,
                            });
                          }}
                        >
                          Clear
                        </Button>
                      </Group>
                    </Group>
                  ))}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Grid.Col>
      ) : null}
      <ProductCostTiersModal
        productId={product?.id}
        opened={tiersOpen}
        onClose={() => setTiersOpen(false)}
      />
    </Grid>
  );
}
