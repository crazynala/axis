import React from "react";
import {
  Card,
  Center,
  Grid,
  SimpleGrid,
  Group,
  Stack,
  Text,
  Tooltip,
  Accordion,
  Badge,
  Button,
  Drawer,
  Select,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import type { UseFormReturn } from "react-hook-form";
import {
  RenderField,
  RenderGroup,
} from "../../../base/forms/fieldConfigShared";
import { getGlobalOptions } from "../../../base/options/OptionsClient";
import {
  deriveExternalStepTypeFromCategoryCode,
  rulesForType,
} from "../rules/productTypeRules";
import { AxisChip } from "~/components/AxisChip";
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
  effectivePricingMode?: string | null;
  pricingModeLabel?: string | null;
  pricingSpecOptions?: Array<{ value: string; label: string }>;
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
  requiredIndicatorMode = "chips",
  hasMovements,
  requireTemplate = false,
  hideTemplateField,
  metadataDefinitions = [],
  effectivePricingMode,
  pricingModeLabel,
  pricingSpecOptions = [],
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
  const [pricingSettingsOpen, setPricingSettingsOpen] = React.useState(false);
  const [allowModeChange, setAllowModeChange] = React.useState(false);
  const templateId = form.watch("templateId");
  const template =
    templateId && templateDefs ? templateDefs[String(templateId)] : null;
  const needsTemplate = Boolean(requireTemplate && !template);
  const typeValue = form.watch("type");
  const stockTracking = form.watch("stockTrackingEnabled");
  const batchTracking = form.watch("batchTrackingEnabled");
  const costPriceValue = form.watch("costPrice");
  const purchaseTaxId = form.watch("purchaseTaxId");
  const salePriceGroupId = form.watch("salePriceGroupId");
  const costGroupId = form.watch("costGroupId");
  const manualSalePrice = form.watch("manualSalePrice");
  const manualMargin = form.watch("manualMargin");
  const pricingModeValue = form.watch("pricingMode");
  const pricingSpecId = form.watch("pricingSpecId");
  const categoryId = form.watch("categoryId");
  const externalStepValue = form.watch("externalStepType");
  const requirements = React.useMemo(
    () => getProductRequirements(typeValue || product?.type || null),
    [typeValue, product?.type]
  );
  const isNewProduct = !product?.id;
  const taxOptions =
    optionsCtx?.taxCodeOptions || getGlobalOptions()?.taxCodeOptions || [];
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
  const fieldByName = React.useMemo(() => {
    const all = [
      ...productIdentityFields,
      ...productAssocFields,
      ...productPricingFields,
    ];
    const map: Record<string, any> = {};
    for (const field of all) {
      if (!field?.name) continue;
      map[field.name] = field;
    }
    return map;
  }, []);
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
      requirements.fields[fieldName] === "required" &&
      !isFieldFilled(fieldName);
    const warnGate =
      requiredIndicatorMode === "inline" &&
      (attemptedSubmit || !!typeValue || Object.keys(touched || {}).length > 0);
    for (const name of Object.keys(requirements.fields)) {
      if (!missingRequired(name)) continue;
      if (attemptedSubmit) {
        map[name] = { state: "error", message: "" };
      } else if (warnGate) {
        map[name] = { state: "warn", message: "" };
      }
    }
    const typeUpper = String(typeValue || product?.type || "").toUpperCase();
    const needsPurchaseTax = typeUpper === "TRIM" || typeUpper === "FABRIC";
    if (needsPurchaseTax && !isFieldFilled("purchaseTaxId")) {
      if (attemptedSubmit) {
        map.purchaseTaxId = { state: "error", message: "" };
      } else if (warnGate) {
        map.purchaseTaxId = { state: "warn", message: "" };
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
    product?.type,
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
    const meta = categoryMetaById || globalOptions?.categoryMetaById || {};
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

  const setValueIfChanged = React.useCallback(
    (name: string, nextValue: any) => {
      const normalize = (value: any) => (value === "" ? null : value);
      const current = normalize(form.getValues(name as any));
      const next = normalize(nextValue);
      if (Object.is(current, next)) return;
      form.setValue(name as any, nextValue, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
    },
    [form]
  );

  React.useEffect(() => {
    if (!template || !requireTemplate) return;
    setValueIfChanged("type", template.productType);
    if (template.defaultCategoryId) {
      setValueIfChanged("categoryId", template.defaultCategoryId);
    }
    if (template.defaultSubCategoryId) {
      setValueIfChanged("subCategoryId", template.defaultSubCategoryId);
    } else {
      setValueIfChanged("subCategoryId", "");
    }
    setValueIfChanged(
      "stockTrackingEnabled",
      template.defaultStockTracking ?? false
    );
    setValueIfChanged(
      "batchTrackingEnabled",
      template.defaultBatchTracking ?? false
    );
    if (template.defaultExternalStepType) {
      setValueIfChanged("externalStepType", template.defaultExternalStepType);
    }
  }, [template, requireTemplate, setValueIfChanged]);

  React.useEffect(() => {
    if (!isNewProduct || mode === "find") return;
    const effectiveType = typeValue || template?.productType || "";
    const typeUpper = String(effectiveType || "").toUpperCase();
    if (!["FABRIC", "TRIM", "PACKAGING"].includes(typeUpper)) return;
    const current = form.getValues("purchaseTaxId");
    if (process.env.NODE_ENV !== "production") {
      console.log("[product form] purchase tax prefill check", {
        typeUpper,
        current,
        taxOptionsCount: taxOptions.length,
        taxOptionLabels: taxOptions.map((opt) => opt.label),
      });
    }
    if (current != null && String(current) !== "") return;
    const taxRateById =
      optionsCtx?.taxRateById || getGlobalOptions()?.taxRateById || {};
    const match = taxOptions.find((opt) => {
      const label = String(opt.label || "");
      const value = String(opt.value || "");
      if (/kdv[-\s]?10/i.test(label) || /kdv[-\s]?10/i.test(value)) return true;
      if (/10\s*%|%\\s*10/.test(label)) return true;
      const rateRaw = taxRateById[String(opt.value)];
      const rate = Number(rateRaw);
      return Number.isFinite(rate) && (rate === 0.1 || rate === 10);
    });
    if (process.env.NODE_ENV !== "production") {
      console.log("[product form] purchase tax prefill match", {
        found: Boolean(match),
        match,
      });
    }
    if (!match) return;
    const numericValue = Number(match.value);
    const nextValue = Number.isFinite(numericValue) ? numericValue : match.value;
    if (process.env.NODE_ENV !== "production") {
      console.log("[product form] purchase tax prefill set", { nextValue });
    }
    form.setValue("purchaseTaxId", nextValue, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [isNewProduct, mode, typeValue, template?.productType, taxOptions, form]);

  React.useEffect(() => {
    const isService = String(typeValue || "").toUpperCase() === "SERVICE";
    if (!isService) {
      setValueIfChanged("externalStepType", null);
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
      setValueIfChanged("externalStepType", implied);
    } else if (!implied && current) {
      setValueIfChanged("externalStepType", null);
    }
  }, [typeValue, categoryId, categoryMetaById, form, setValueIfChanged]);

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

  const lastMissingFieldRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!onRegisterMissingFocus) return;
    if (!attemptedSubmit) {
      if (lastMissingFieldRef.current !== null) {
        lastMissingFieldRef.current = null;
        onRegisterMissingFocus(null);
      }
      return;
    }
    if (!validation || !validation.missingRequired.length) {
      if (lastMissingFieldRef.current !== null) {
        lastMissingFieldRef.current = null;
        onRegisterMissingFocus(null);
      }
      return;
    }
    const sections = [
      "identity",
      "classification",
      "associations",
      "pricing",
      "inventory",
    ] as const;
    const firstSection = sections.find(
      (s) => validation.bySection[s]?.missingRequired.length
    );
    const firstField =
      (firstSection
        ? validation.bySection[firstSection]?.firstMissingField
        : null) || null;
    if (firstField === lastMissingFieldRef.current) return;
    lastMissingFieldRef.current = firstField;
    onRegisterMissingFocus(() => focusField(firstField));
  }, [attemptedSubmit, onRegisterMissingFocus, validation, focusField]);

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
      hideTemplateField,
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
      hideTemplateField,
    ]
  );
  const renderFieldByName = React.useCallback(
    (name: string) => {
      const field = fieldByName[name];
      if (!field) return null;
      if (hideTemplateField && name === "templateId") return null;
      if (!shouldRenderField(name)) return null;
      return (
        <RenderField form={form} field={field} mode={mode as any} ctx={ctx} />
      );
    },
    [fieldByName, form, mode, ctx, shouldRenderField, hideTemplateField]
  );
  const renderFieldCol = React.useCallback(
    (
      name: string,
      colSpan: { base: number; md?: number },
      wrapperStyle?: React.CSSProperties
    ) => {
      const fieldNode = renderFieldByName(name);
      if (!fieldNode) return null;
      return (
        <Grid.Col span={colSpan}>
          {wrapperStyle ? (
            <div style={wrapperStyle}>{fieldNode}</div>
          ) : (
            fieldNode
          )}
        </Grid.Col>
      );
    },
    [renderFieldByName]
  );
  const resolvedPricingMode =
    (pricingModeValue as string | null) ?? effectivePricingMode ?? null;
  const pricingModeLabelResolved =
    pricingModeLabel ??
    (resolvedPricingMode === "FIXED_PRICE"
      ? "Fixed Price"
      : resolvedPricingMode === "FIXED_MARGIN"
      ? "Fixed Margin"
      : resolvedPricingMode === "TIERED_COST"
      ? "Tiered Cost"
      : resolvedPricingMode === "TIERED_SELL"
      ? "Tiered Sell"
      : resolvedPricingMode === "GENERATED"
      ? "Generated"
      : "Unspecified");
  const pricingModeOptions = React.useMemo(
    () => [
      { value: "FIXED_PRICE", label: "Fixed Price" },
      { value: "FIXED_MARGIN", label: "Fixed Margin" },
      { value: "TIERED_COST", label: "Tiered Cost" },
      { value: "TIERED_SELL", label: "Tiered Sell" },
      { value: "GENERATED", label: "Generated" },
    ],
    []
  );
  const confirmPricingModeChange = React.useCallback(
    (nextMode: string) => {
      const clearMap: Record<string, string[]> = {
        FIXED_PRICE: [
          "manualMargin",
          "costGroupId",
          "salePriceGroupId",
          "pricingSpecId",
        ],
        FIXED_MARGIN: ["manualSalePrice", "salePriceGroupId", "pricingSpecId"],
        TIERED_COST: ["manualSalePrice", "salePriceGroupId", "pricingSpecId"],
        TIERED_SELL: ["manualSalePrice", "manualMargin", "pricingSpecId"],
        GENERATED: [
          "manualSalePrice",
          "manualMargin",
          "salePriceGroupId",
          "costGroupId",
        ],
      };
      const clears = clearMap[nextMode] || [];
      const label =
        pricingModeOptions.find((opt) => opt.value === nextMode)?.label ||
        nextMode;
      const body = clears.length
        ? `Changing to ${label} will clear: ${clears.join(", ")}. Continue?`
        : `Change pricing model to ${label}?`;
      modals.openConfirmModal({
        title: "Change pricing model?",
        children: <Text size="sm">{body}</Text>,
        labels: { confirm: "Change", cancel: "Cancel" },
        confirmProps: { color: "red" },
        onConfirm: () => {
          form.setValue("pricingMode", nextMode, { shouldDirty: true });
          for (const field of clears) {
            form.setValue(field as any, null, { shouldDirty: true });
          }
        },
      });
    },
    [form, pricingModeOptions]
  );
  const modeSelectorEnabled = allowModeChange || product?.pricingMode == null;
  const derivedMargin = React.useMemo(() => {
    const cost = Number(costPriceValue ?? 0);
    const sell = Number(form.getValues("manualSalePrice") ?? 0);
    if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(sell))
      return null;
    return (sell - cost) / cost;
  }, [costPriceValue, manualSalePrice, form]);
  const derivedSell = React.useMemo(() => {
    const cost = Number(costPriceValue ?? 0);
    const margin = Number(form.getValues("manualMargin") ?? 0);
    if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(margin))
      return null;
    return cost * (1 + margin);
  }, [costPriceValue, manualMargin, form]);
  const tierSummary = React.useMemo(() => {
    const productTiers = (product?.salePriceRanges || []).length;
    const groupTiers = (product?.salePriceGroup?.saleRanges || []).length;
    if (productTiers) return `Product sell tiers: ${productTiers}`;
    if (groupTiers) return `Group sell tiers: ${groupTiers}`;
    return "No sell tiers";
  }, [product]);
  const costTierSummary = React.useMemo(() => {
    const groupTiers = (product?.costGroup?.costRanges || []).length;
    if (groupTiers) return `Group cost tiers: ${groupTiers}`;
    if (product?.costPrice != null) return "Cost price on product";
    return "No cost tiers";
  }, [product]);
  const specSummary = React.useMemo(() => {
    if (pricingSpecId != null) {
      const match = pricingSpecOptions.find(
        (opt) => opt.value === String(pricingSpecId)
      );
      if (match) return match.label;
    }
    const spec = product?.pricingSpec;
    if (!spec) return "No pricing spec";
    return spec.name || spec.code || `Spec #${spec.id}`;
  }, [product, pricingSpecId, pricingSpecOptions]);
  const generatedTierSummary = React.useMemo(() => {
    const rows = (product?.salePriceRanges || []).filter(
      (r: any) => r.generatedBySpecId != null
    );
    if (!rows.length) return "No generated tiers";
    return `Generated tiers: ${rows.length}`;
  }, [product]);
  const metadataFields = React.useMemo(
    () =>
      buildProductMetadataFields(metadataDefinitions, {
        enumOptionsByDefinitionId:
          globalOptions?.productAttributeOptionsByDefinitionId || {},
      }),
    [metadataDefinitions, globalOptions?.productAttributeOptionsByDefinitionId]
  );

  return (
    <Grid>
      <input
        type="hidden"
        name="externalStepType"
        value={externalStepValue ?? ""}
        data-debug="externalStepType-hidden"
      />
      <input
        type="hidden"
        name="pricingMode"
        value={pricingModeValue ?? ""}
        data-debug="pricingMode-hidden"
      />
      <input
        type="hidden"
        name="pricingSpecId"
        value={pricingSpecId ?? ""}
        data-debug="pricingSpecId-hidden"
      />
      <Grid.Col span={{ base: 12, md: 12 }}>
        <Grid>
          <Grid.Col span={7}>
            <Card withBorder padding="md">
              <Grid gutter="md">
                {renderFieldCol("name", { base: 12, md: 6 })}
                {renderFieldCol("sku", { base: 12, md: 6 })}
                {renderFieldCol("categoryId", { base: 12, md: 6 })}
                {renderFieldCol("type", { base: 12, md: 6 }, { opacity: 0.75 })}
                {renderFieldCol("subCategoryId", { base: 12, md: 6 })}
                {renderFieldCol("templateId", { base: 12, md: 6 })}
                {renderFieldCol("supplierId", { base: 12, md: 6 })}
                {renderFieldCol("customerId", { base: 12, md: 6 })}
                {renderFieldCol("variantSetId", { base: 12, md: 6 })}
                {renderFieldCol("externalStepType", { base: 12, md: 6 })}
                {renderFieldCol("description", { base: 12 })}
                {metadataFields.length ? (
                  <Grid.Col span={{ base: 12 }}>
                    <div style={{ opacity: 0.8 }}>
                      <RenderGroup
                        form={form as any}
                        fields={metadataFields as any}
                        mode={mode as any}
                        ctx={ctx as any}
                      />
                    </div>
                  </Grid.Col>
                ) : null}
                {product?.id ? (
                  <Grid.Col span={{ base: 12 }}>
                    <Group justify="flex-end">
                      <Text size="xs" c="dimmed">
                        ID: {product?.id}
                      </Text>
                    </Group>
                  </Grid.Col>
                ) : null}
              </Grid>
            </Card>
          </Grid.Col>
          <Grid.Col span={5}>
            <Card withBorder padding="md">
              <Stack gap="sm">
                {needsTemplate ? (
                  <Text size="xs" c="dimmed">
                    Select a template to unlock template-driven defaults.
                  </Text>
                ) : null}
                <Group justify="space-between" align="center" wrap="wrap">
                  <Text size="xs" c="dimmed">
                    Pricing model: {pricingModeLabelResolved}
                  </Text>
                  <Button
                    type="button"
                    size="xs"
                    variant="subtle"
                    onClick={() => setPricingSettingsOpen(true)}
                    style={{ padding: 0 }}
                  >
                    Pricing settings...
                  </Button>
                </Group>
                {resolvedPricingMode === "FIXED_PRICE" ? (
                  <Stack gap="xs">
                    {renderFieldByName("costPrice")}
                    {renderFieldByName("manualSalePriceOverride")}
                    <Text size="xs" c="dimmed">
                      Margin (derived):{" "}
                      {derivedMargin == null
                        ? "—"
                        : `${Math.round(derivedMargin * 1000) / 10}%`}
                    </Text>
                  </Stack>
                ) : resolvedPricingMode === "FIXED_MARGIN" ? (
                  <Stack gap="xs">
                    {renderFieldByName("costPrice")}
                    {renderFieldByName("manualMargin")}
                    <Text size="xs" c="dimmed">
                      Sell (derived):{" "}
                      {derivedSell == null
                        ? "—"
                        : (Math.round(derivedSell * 100) / 100).toFixed(2)}
                    </Text>
                  </Stack>
                ) : resolvedPricingMode === "TIERED_COST" ? (
                  <Stack gap="xs">
                    {renderFieldByName("manualMargin")}
                    <Text size="xs" c="dimmed">
                      {costTierSummary}
                    </Text>
                  </Stack>
                ) : resolvedPricingMode === "TIERED_SELL" ? (
                  <Text size="xs" c="dimmed">
                    {tierSummary}
                  </Text>
                ) : resolvedPricingMode === "GENERATED" ? (
                  <Stack gap="xs">
                    <Text size="xs" c="dimmed">
                      Spec: {specSummary}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {generatedTierSummary}
                    </Text>
                  </Stack>
                ) : (
                  <Text size="xs" c="dimmed">
                    Pricing mode not set.
                  </Text>
                )}
                {renderFieldByName("purchaseTaxId")}
                <div style={{ height: 6 }} />
                {renderFieldByName("leadTimeDays")}
                <Stack gap={4} id="product-tracking-status">
                  <Text size="xs" c="dimmed">
                    Stock tracking: {stockTracking ? "ON" : "OFF"}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Batch tracking:{" "}
                    {stockTracking ? (batchTracking ? "ON" : "OFF") : "n/a"}
                  </Text>
                  <Button
                    type="button"
                    size="xs"
                    variant="subtle"
                    onClick={(e) => e.preventDefault()}
                    style={{ padding: 0, alignSelf: "flex-start" }}
                  >
                    Change tracking in settings
                  </Button>
                </Stack>
              </Stack>
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
          </Grid.Col>
        </Grid>
      </Grid.Col>
      <Drawer
        opened={pricingSettingsOpen}
        onClose={() => {
          setPricingSettingsOpen(false);
          setAllowModeChange(false);
        }}
        position="right"
        title="Pricing settings"
        size="sm"
      >
        <Stack gap="sm">
          {modeSelectorEnabled ? (
            <Select
              label="Pricing model"
              data={pricingModeOptions}
              value={resolvedPricingMode ?? ""}
              onChange={(next) => {
                if (!next || next === resolvedPricingMode) return;
                confirmPricingModeChange(next);
              }}
            />
          ) : (
            <Group justify="space-between" align="center">
              <Text size="sm" c="dimmed">
                Pricing model: {pricingModeLabelResolved}
              </Text>
              <Button
                type="button"
                size="xs"
                variant="light"
                onClick={() => setAllowModeChange(true)}
              >
                Change model
              </Button>
            </Group>
          )}
          {renderFieldByName("costGroupId")}
          {renderFieldByName("salePriceGroupId")}
          <Select
            label="Pricing Spec"
            data={pricingSpecOptions}
            value={pricingSpecId != null ? String(pricingSpecId) : ""}
            placeholder="Select spec"
            onChange={(val) => {
              const next = val ? Number(val) : null;
              form.setValue("pricingSpecId", next, { shouldDirty: true });
            }}
          />
        </Stack>
      </Drawer>
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
