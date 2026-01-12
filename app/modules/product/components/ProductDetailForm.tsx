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
import { Link } from "@remix-run/react";
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
import { CardChrome } from "~/base/forms/CardChrome";
import { buildProductMetadataFields } from "~/modules/productMetadata/utils/productMetadataFields";
import type { ProductAttributeDefinition } from "~/modules/productMetadata/types/productMetadata";
import { ProductCostTiersModal } from "../components/ProductCostTiersModal";
import {
  DEFAULT_PRICING_QTY,
  PricingPreviewWidget,
  usePricingPrefsFromWidget,
} from "./PricingPreviewWidget";
import { PricingValueWithMeta } from "~/components/PricingValueWithMeta";
import {
  isPricingValueDifferent,
  makePricedValue,
} from "~/utils/pricingValueMeta";
import { getProductDisplayPrice } from "../pricing/getProductDisplayPrice";
import { debugEnabled } from "~/utils/debugFlags";
import type { ProductValidationResult } from "../validation/computeProductValidation";
import {
  getProductRequirements,
  productRequirementSpec,
} from "../validation/productRequirements";

export type ProductDetailFormProps = {
  mode: "edit" | "find" | "create";
  form: UseFormReturn<any>;
  product?: any; // initial product record when editing
  fieldCtx?: Record<string, any>;
  onSave?: (values: any) => void;
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
  effectivePricingModel?: string | null;
  pricingModelLabel?: string | null;
  pricingSpecOptions?: Array<{ value: string; label: string }>;
  pricingSpecRangesById?: Record<
    string,
    Array<{
      id: number;
      rangeFrom: number | null;
      rangeTo: number | null;
      multiplier: string;
    }>
  >;
};

export function ProductDetailForm({
  mode,
  form,
  product,
  fieldCtx,
  onSave,
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
  effectivePricingModel,
  pricingModelLabel,
  pricingSpecOptions = [],
  pricingSpecRangesById = {},
}: ProductDetailFormProps) {
  const optionsCtx = useOptions();
  const [tiersOpen, setTiersOpen] = React.useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [pricingDrawerOpen, setPricingDrawerOpen] = React.useState(false);
  const isLoudMode = (fieldCtx as any)?.isLoudMode ?? true;
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
  const pricingModelValue = form.watch("pricingModel");
  const pricingSpecId = form.watch("pricingSpecId");
  const baselinePriceAtMoq = form.watch("baselinePriceAtMoq");
  const transferPercent = form.watch("transferPercent");
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
    const pricingModelUpper = String(
      pricingModelValue || effectivePricingModel || ""
    ).toUpperCase();
    if (pricingModelUpper === "CURVE_SELL_AT_MOQ") {
      if (!isFieldFilled("pricingSpecId")) {
        if (attemptedSubmit) {
          map.pricingSpecId = { state: "error", message: "" };
        } else if (warnGate) {
          map.pricingSpecId = { state: "warn", message: "" };
        }
      }
      if (!isFieldFilled("baselinePriceAtMoq")) {
        if (attemptedSubmit) {
          map.baselinePriceAtMoq = { state: "error", message: "" };
        } else if (warnGate) {
          map.baselinePriceAtMoq = { state: "warn", message: "" };
        }
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
    pricingModelValue,
    effectivePricingModel,
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
      ...(fieldCtx || {}),
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
      fieldCtx,
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
  const metadataFields = React.useMemo(
    () =>
      buildProductMetadataFields(metadataDefinitions, {
        enumOptionsByDefinitionId:
          globalOptions?.productAttributeOptionsByDefinitionId || {},
      }),
    [metadataDefinitions, globalOptions?.productAttributeOptionsByDefinitionId]
  );
  const surfaceCtx = React.useMemo(
    () => ({
      ...ctx,
      uiMode: isLoudMode ? "normal" : "quiet",
      allowEditInCalm: isLoudMode,
    }),
    [ctx, isLoudMode]
  );
  const drawerCtx = React.useMemo(
    () => ({
      ...ctx,
      uiMode: "normal",
      allowEditInCalm: true,
      markDirtyOnChange: true,
    }),
    [ctx]
  );
  const surfaceMetadataFields = React.useMemo(() => {
    if (isLoudMode) return metadataFields;
    return metadataFields.map((field) => ({
      ...field,
      readOnly: true,
      editable: false,
    }));
  }, [isLoudMode, metadataFields]);
  const drawerIdentityFields = React.useMemo(
    () => filterFields(productIdentityFields),
    [filterFields]
  );
  const drawerAssocFields = React.useMemo(
    () => filterFields(productAssocFields),
    [filterFields]
  );
  const drawerPricingFields = React.useMemo(
    () => filterFields(productPricingFields),
    [filterFields]
  );
  const drawerMetadataFields = React.useMemo(
    () => filterFields(metadataFields),
    [filterFields, metadataFields]
  );
  const detailDrawerItems = React.useMemo(
    () => [...drawerIdentityFields, ...drawerAssocFields, ...drawerMetadataFields],
    [drawerIdentityFields, drawerAssocFields, drawerMetadataFields]
  );
  const renderFieldByName = React.useCallback(
    (
      name: string,
      opts?: { ctx?: any; forceReadOnly?: boolean }
    ) => {
      const field = fieldByName[name];
      if (!field) return null;
      if (hideTemplateField && name === "templateId") return null;
      if (!shouldRenderField(name)) return null;
      const resolvedField = opts?.forceReadOnly
        ? { ...field, readOnly: true, editable: false }
        : field;
      return (
        <RenderField
          form={form}
          field={resolvedField}
          mode={mode as any}
          ctx={(opts?.ctx as any) ?? ctx}
        />
      );
    },
    [fieldByName, form, mode, ctx, shouldRenderField, hideTemplateField]
  );
  const renderFieldCol = React.useCallback(
    (
      name: string,
      colSpan: { base: number; md?: number },
      wrapperStyle?: React.CSSProperties,
      opts?: { ctx?: any; forceReadOnly?: boolean }
    ) => {
      const fieldNode = renderFieldByName(name, opts);
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
  const renderSurfaceFieldByName = React.useCallback(
    (name: string) =>
      renderFieldByName(name, {
        ctx: surfaceCtx,
        forceReadOnly: !isLoudMode,
      }),
    [renderFieldByName, surfaceCtx, isLoudMode]
  );
  const renderSurfaceFieldCol = React.useCallback(
    (
      name: string,
      colSpan: { base: number; md?: number },
      wrapperStyle?: React.CSSProperties
    ) =>
      renderFieldCol(name, colSpan, wrapperStyle, {
        ctx: surfaceCtx,
        forceReadOnly: !isLoudMode,
      }),
    [renderFieldCol, surfaceCtx, isLoudMode]
  );
  const drawerDirty = form.formState.isDirty;
  const handleDrawerSave = React.useCallback(() => {
    if (!onSave) return;
    onSave(form.getValues());
  }, [onSave, form]);
  const resolvedPricingModel =
    (pricingModelValue as string | null) ?? effectivePricingModel ?? null;
  const pricingModelLabelResolved =
    pricingModelLabel ??
    (resolvedPricingModel === "COST_PLUS_MARGIN"
      ? "Cost + Margin"
      : resolvedPricingModel === "COST_PLUS_FIXED_SELL"
      ? "Cost + Fixed Sell"
      : resolvedPricingModel === "TIERED_COST_PLUS_MARGIN"
      ? "Tiered Cost + Margin"
      : resolvedPricingModel === "TIERED_COST_PLUS_FIXED_SELL"
      ? "Tiered Cost + Fixed Sell"
      : resolvedPricingModel === "CURVE_SELL_AT_MOQ"
      ? "Curve (Sell at MOQ)"
      : "Unspecified");
  const pricingModelOptions = React.useMemo(
    () => [
      { value: "COST_PLUS_MARGIN", label: "Cost + Margin" },
      { value: "COST_PLUS_FIXED_SELL", label: "Cost + Fixed Sell" },
      { value: "TIERED_COST_PLUS_MARGIN", label: "Tiered Cost + Margin" },
      { value: "TIERED_COST_PLUS_FIXED_SELL", label: "Tiered Cost + Fixed Sell" },
      { value: "CURVE_SELL_AT_MOQ", label: "Curve (Sell at MOQ)" },
    ],
    []
  );
  const confirmPricingModelChange = React.useCallback(
    (nextModel: string) => {
      const clearMap: Record<string, string[]> = {
        COST_PLUS_MARGIN: [
          "manualSalePrice",
          "salePriceGroupId",
          "pricingSpecId",
          "baselinePriceAtMoq",
        ],
        COST_PLUS_FIXED_SELL: [
          "manualMargin",
          "salePriceGroupId",
          "pricingSpecId",
          "baselinePriceAtMoq",
        ],
        TIERED_COST_PLUS_MARGIN: [
          "manualSalePrice",
          "salePriceGroupId",
          "pricingSpecId",
          "baselinePriceAtMoq",
        ],
        TIERED_COST_PLUS_FIXED_SELL: [
          "manualMargin",
          "salePriceGroupId",
          "pricingSpecId",
          "baselinePriceAtMoq",
        ],
        CURVE_SELL_AT_MOQ: [
          "manualSalePrice",
          "manualMargin",
          "costGroupId",
          "salePriceGroupId",
        ],
      };
      const clears = clearMap[nextModel] || [];
      const label =
        pricingModelOptions.find((opt) => opt.value === nextModel)?.label ||
        nextModel;
      const body = clears.length
        ? `Changing to ${label} will clear: ${clears.join(", ")}. Continue?`
        : `Change pricing model to ${label}?`;
      modals.openConfirmModal({
        title: "Change pricing model?",
        children: <Text size="sm">{body}</Text>,
        labels: { confirm: "Change", cancel: "Cancel" },
        confirmProps: { color: "red" },
        onConfirm: () => {
          form.setValue("pricingModel", nextModel, {
            shouldDirty: true,
            shouldTouch: true,
          });
          for (const field of clears) {
            form.setValue(field as any, null, {
              shouldDirty: true,
              shouldTouch: true,
            });
          }
        },
      });
    },
    [form, pricingModelOptions]
  );
  const modeSelectorEnabled = allowModeChange || product?.pricingModel == null;
  const derivedMargin = React.useMemo(() => {
    const cost = Number(costPriceValue ?? 0);
    const sell = Number(form.getValues("manualSalePrice") ?? 0);
    if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(sell))
      return null;
    return (sell - cost) / cost;
  }, [costPriceValue, manualSalePrice, form]);
  const resolvedSaleTiers = React.useMemo(() => {
    const selectedSpgId =
      salePriceGroupId != null && salePriceGroupId !== ""
        ? String(salePriceGroupId)
        : null;
    if (selectedSpgId && salePriceGroupRangesById[selectedSpgId]) {
      return (salePriceGroupRangesById[selectedSpgId] || [])
        .map((t) => ({
          minQty: Number(t.minQty) || 0,
          unitPrice: Number(t.unitPrice) || 0,
        }))
        .sort((a, b) => a.minQty - b.minQty);
    }
    const saleGroupOnProduct =
      (product?.salePriceGroup?.saleRanges || []) as any[];
    if (saleGroupOnProduct.length) {
      return saleGroupOnProduct
        .filter((r: any) => r && r.rangeFrom != null && r.price != null)
        .map((r: any) => ({
          minQty: Number(r.rangeFrom) || 0,
          unitPrice: Number(r.price) || 0,
        }))
        .sort((a, b) => a.minQty - b.minQty);
    }
    const saleProduct = (product?.salePriceRanges || []) as any[];
    if (saleProduct.length) {
      return saleProduct
        .filter((r: any) => r && r.rangeFrom != null && r.price != null)
        .map((r: any) => ({
          minQty: Number(r.rangeFrom) || 0,
          unitPrice: Number(r.price) || 0,
        }))
        .sort((a, b) => a.minQty - b.minQty);
    }
    return [];
  }, [salePriceGroupId, salePriceGroupRangesById, product]);
  const resolvedCostTiers = React.useMemo(() => {
    const selectedCgId =
      watchedCostGroupId != null && watchedCostGroupId !== ""
        ? String(watchedCostGroupId)
        : null;
    const fromSelected = selectedCgId
      ? costGroupRangesById[selectedCgId] || []
      : [];
    if (fromSelected.length) {
      return fromSelected
        .map((r) => ({
          minQty: Number(r.minQty) || 0,
          priceCost: Number(r.unitCost ?? 0) || 0,
        }))
        .sort((a, b) => a.minQty - b.minQty);
    }
    const ranges = (product?.costGroup?.costRanges || []) as any[];
    return ranges
      .map((r: any) => ({
        minQty: Number(r.rangeFrom ?? 0) || 0,
        priceCost: Number(r.costPrice ?? 0) || 0,
      }))
      .sort((a, b) => a.minQty - b.minQty);
  }, [watchedCostGroupId, costGroupRangesById, product]);
  const derivedPricing = React.useMemo(() => {
    const cost = Number(costPriceValue ?? product?.costPrice ?? 0) || 0;
    const pricingModelUpper = String(resolvedPricingModel || "").toUpperCase();
    const requiresCost =
      pricingModelUpper === "COST_PLUS_MARGIN" ||
      pricingModelUpper === "COST_PLUS_FIXED_SELL";
    if (!Number.isFinite(cost) || (requiresCost && cost <= 0)) return null;
    let taxRate = 0;
    const taxId = purchaseTaxId ?? product?.purchaseTaxId ?? null;
    const rates = optionsCtx?.taxRateById || {};
    if (taxId != null && rates) {
      const key = String(taxId);
      const n = Number(rates[key] ?? 0);
      taxRate = Number.isFinite(n) ? n : 0;
    } else if (product?.purchaseTax?.value != null) {
      const n = Number(product.purchaseTax.value);
      taxRate = Number.isFinite(n) ? n : 0;
    }
    const specRanges =
      pricingSpecId != null
        ? pricingSpecRangesById[String(pricingSpecId)] || []
        : (product?.pricingSpec?.ranges || []);
    return getProductDisplayPrice({
      qty: pricingPrefs.qty,
      priceMultiplier: pricingPrefs.priceMultiplier,
      marginDefaults: pricingPrefs.margins,
      baseCost: cost,
      manualSalePrice: form.getValues("manualSalePrice"),
      manualMargin: form.getValues("manualMargin"),
      taxRate,
      pricingModel: resolvedPricingModel,
      baselinePriceAtMoq:
        baselinePriceAtMoq != null ? Number(baselinePriceAtMoq) : null,
      transferPercent:
        transferPercent != null ? Number(transferPercent) : null,
      pricingSpecRanges: (specRanges || []).map((range: any) => ({
        rangeFrom: range.rangeFrom ?? null,
        rangeTo: range.rangeTo ?? null,
        multiplier: Number(range.multiplier),
      })),
      costTiers: resolvedCostTiers,
      saleTiers: resolvedSaleTiers,
      debug: debugEnabled("pricing"),
      debugLabel: product?.id ? `product:${product.id}:detail` : "product:detail",
    });
  }, [
    baselinePriceAtMoq,
    costPriceValue,
    pricingPrefs,
    pricingSpecId,
    pricingSpecRangesById,
    purchaseTaxId,
    resolvedPricingModel,
    resolvedCostTiers,
    resolvedSaleTiers,
    form,
    manualSalePrice,
    manualMargin,
    product,
    optionsCtx,
    transferPercent,
  ]);
  const derivedSell =
    derivedPricing?.unitSellPrice != null ? derivedPricing.unitSellPrice : null;
  const previewActive =
    Boolean(pricingPrefs.customerId) ||
    pricingPrefs.qty !== DEFAULT_PRICING_QTY;
  const baselinePricing = React.useMemo(() => {
    if (!previewActive) return null;
    const cost = Number(costPriceValue ?? product?.costPrice ?? 0) || 0;
    if (!Number.isFinite(cost) || cost <= 0) return null;
    let taxRate = 0;
    const taxId = purchaseTaxId ?? product?.purchaseTaxId ?? null;
    const rates = optionsCtx?.taxRateById || {};
    if (taxId != null && rates) {
      const key = String(taxId);
      const n = Number(rates[key] ?? 0);
      taxRate = Number.isFinite(n) ? n : 0;
    } else if (product?.purchaseTax?.value != null) {
      const n = Number(product.purchaseTax.value);
      taxRate = Number.isFinite(n) ? n : 0;
    }
    const specRanges =
      pricingSpecId != null
        ? pricingSpecRangesById[String(pricingSpecId)] || []
        : (product?.pricingSpec?.ranges || []);
    return getProductDisplayPrice({
      qty: DEFAULT_PRICING_QTY,
      priceMultiplier: pricingPrefs.customerId ? 1 : pricingPrefs.priceMultiplier,
      marginDefaults: pricingPrefs.customerId ? null : pricingPrefs.margins,
      baseCost: cost,
      manualSalePrice: form.getValues("manualSalePrice"),
      manualMargin: form.getValues("manualMargin"),
      taxRate,
      pricingModel: resolvedPricingModel,
      baselinePriceAtMoq:
        baselinePriceAtMoq != null ? Number(baselinePriceAtMoq) : null,
      transferPercent:
        transferPercent != null ? Number(transferPercent) : null,
      pricingSpecRanges: (specRanges || []).map((range: any) => ({
        rangeFrom: range.rangeFrom ?? null,
        rangeTo: range.rangeTo ?? null,
        multiplier: Number(range.multiplier),
      })),
      costTiers: resolvedCostTiers,
      saleTiers: resolvedSaleTiers,
    });
  }, [
    previewActive,
    costPriceValue,
    product,
    purchaseTaxId,
    optionsCtx,
    pricingSpecId,
    pricingSpecRangesById,
    resolvedPricingModel,
    baselinePriceAtMoq,
    transferPercent,
    form,
    resolvedCostTiers,
    resolvedSaleTiers,
    pricingPrefs.customerId,
    pricingPrefs.priceMultiplier,
    pricingPrefs.margins,
  ]);
  const derivedSellValue = React.useMemo(() => {
    if (derivedSell == null) return null;
    const manualOverride = manualSalePrice != null && manualSalePrice !== "";
    const baselineSell = Number(baselinePricing?.unitSellPrice ?? derivedSell);
    const contextAffected =
      previewActive &&
      isPricingValueDifferent(derivedSell, baselineSell);
    return makePricedValue(derivedSell, {
      isOverridden: manualOverride,
      contextAffected: !manualOverride && contextAffected,
      context: contextAffected ? { qty: pricingPrefs.qty } : undefined,
      baseline: contextAffected ? baselineSell : undefined,
    });
  }, [
    derivedSell,
    manualSalePrice,
    previewActive,
    baselinePricing,
    pricingPrefs.qty,
  ]);
  const derivedCurveCost = React.useMemo(() => {
    if (!derivedPricing) return null;
    const tpRaw = transferPercent != null ? Number(transferPercent) : null;
    if (tpRaw == null || !Number.isFinite(tpRaw)) return null;
    const withTax = Number((derivedPricing as any)?.breakdown?.withTax ?? 0) || 0;
    if (!Number.isFinite(withTax)) return null;
    const unit = withTax * tpRaw;
    return Number.isFinite(unit) ? unit : null;
  }, [derivedPricing, transferPercent]);
  const derivedTierCost = React.useMemo(() => {
    if (!derivedPricing) return null;
    const baseUnit = Number((derivedPricing as any)?.breakdown?.baseUnit ?? 0);
    return Number.isFinite(baseUnit) ? baseUnit : null;
  }, [derivedPricing]);
  const derivedTierCostValue = React.useMemo(() => {
    if (derivedTierCost == null) return null;
    const baselineTier = Number(
      (baselinePricing as any)?.breakdown?.baseUnit ?? derivedTierCost
    );
    const contextAffected =
      previewActive &&
      isPricingValueDifferent(derivedTierCost, baselineTier);
    return makePricedValue(derivedTierCost, {
      contextAffected,
      context: contextAffected ? { qty: pricingPrefs.qty } : undefined,
      baseline: contextAffected ? baselineTier : undefined,
    });
  }, [derivedTierCost, baselinePricing, previewActive, pricingPrefs.qty]);
  const derivedCurveCostValue = React.useMemo(() => {
    if (derivedCurveCost == null) return null;
    const tpRaw = transferPercent != null ? Number(transferPercent) : null;
    const withTax =
      Number((baselinePricing as any)?.breakdown?.withTax ?? 0) || 0;
    const baselineCurve =
      tpRaw != null && Number.isFinite(tpRaw) && Number.isFinite(withTax)
        ? withTax * tpRaw
        : derivedCurveCost;
    const contextAffected =
      previewActive &&
      isPricingValueDifferent(derivedCurveCost, baselineCurve);
    return makePricedValue(derivedCurveCost, {
      contextAffected,
      context: contextAffected ? { qty: pricingPrefs.qty } : undefined,
      baseline: contextAffected ? baselineCurve : undefined,
    });
  }, [
    derivedCurveCost,
    baselinePricing,
    transferPercent,
    previewActive,
    pricingPrefs.qty,
  ]);
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
  const curvePreviewRows = React.useMemo(() => {
    if (resolvedPricingModel !== "CURVE_SELL_AT_MOQ") return [];
    if (pricingSpecId == null) return [];
    const ranges = pricingSpecRangesById[String(pricingSpecId)] || [];
    if (!ranges.length) return [];
    const base = Number(baselinePriceAtMoq);
    if (!Number.isFinite(base) || base <= 0) return [];
    const qtys = new Set<number>([1, 5, 10, 20]);
    const moqCandidates = ranges
      .filter((r) => Number(r.multiplier) === 1 && r.rangeFrom != null)
      .map((r) => Number(r.rangeFrom));
    if (moqCandidates.length) {
      qtys.add(Math.min(...moqCandidates));
    }
    for (const range of ranges) {
      if (range.rangeFrom != null) qtys.add(Number(range.rangeFrom));
      if (range.rangeTo != null) qtys.add(Number(range.rangeTo));
    }
    const sortedQtys = Array.from(qtys)
      .filter((q) => Number.isFinite(q) && q > 0)
      .sort((a, b) => a - b)
      .slice(0, 8);
    const resolveRange = (qty: number) => {
      const matches = ranges.filter((r) => {
        const min = r.rangeFrom != null ? Number(r.rangeFrom) : 1;
        const max =
          r.rangeTo != null ? Number(r.rangeTo) : Number.MAX_SAFE_INTEGER;
        return qty >= min && qty <= max;
      });
      if (!matches.length) return null;
      const width = (r: typeof matches[number]) => {
        const min = r.rangeFrom != null ? Number(r.rangeFrom) : 1;
        const max =
          r.rangeTo != null ? Number(r.rangeTo) : Number.MAX_SAFE_INTEGER;
        return max - min;
      };
      return matches.sort((a, b) => width(a) - width(b))[0];
    };
    return sortedQtys.map((qty) => {
      const match = resolveRange(qty);
      const mult = match ? Number(match.multiplier) : null;
      const price =
        match && Number.isFinite(mult) ? base * mult : Number.NaN;
      return {
        qty,
        multiplier: match ? match.multiplier : null,
        unitPrice:
          Number.isFinite(price) && price >= 0
            ? (Math.round(price * 100) / 100).toFixed(2)
            : "n/a",
      };
    });
  }, [
    resolvedPricingModel,
    pricingSpecId,
    pricingSpecRangesById,
    baselinePriceAtMoq,
  ]);
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
        name="pricingModel"
        value={pricingModelValue ?? ""}
        data-debug="pricingModel-hidden"
      />
      <input
        type="hidden"
        name="pricingSpecId"
        value={pricingSpecId ?? ""}
        data-debug="pricingSpecId-hidden"
      />
      <input type="hidden" {...form.register("productStage" as any)} />
      <Grid.Col span={{ base: 12, md: 12 }}>
        <Grid>
          <Grid.Col span={7}>
            <CardChrome
              showEdit={mode === "edit" && !isLoudMode}
              onEdit={() => setDetailDrawerOpen(true)}
              drawerOpened={detailDrawerOpen}
              onDrawerClose={() => setDetailDrawerOpen(false)}
              drawerTitle="Edit product details"
              drawerChildren={
                detailDrawerItems.length ? (
                  <Stack gap="md">
                    <RenderGroup
                      form={form as any}
                      fields={detailDrawerItems as any}
                      mode={mode as any}
                      ctx={drawerCtx as any}
                      gap={10}
                    />
                    <Group justify="flex-end">
                      <Button
                        variant="default"
                        onClick={() => setDetailDrawerOpen(false)}
                      >
                        Close
                      </Button>
                      <Button disabled={!drawerDirty} onClick={handleDrawerSave}>
                        Save changes
                      </Button>
                    </Group>
                  </Stack>
                ) : null
              }
            >
              <Grid gutter="md">
                {renderSurfaceFieldCol("name", { base: 12, md: 6 })}
                {renderSurfaceFieldCol("sku", { base: 12, md: 6 })}
                {renderSurfaceFieldCol("categoryId", { base: 12, md: 6 })}
                {renderSurfaceFieldCol("type", { base: 12, md: 6 }, { opacity: 0.75 })}
                {renderSurfaceFieldCol("subCategoryId", { base: 12, md: 6 })}
                {renderSurfaceFieldCol("templateId", { base: 12, md: 6 })}
                {renderSurfaceFieldCol("supplierId", { base: 12, md: 6 })}
                {renderSurfaceFieldCol("customerId", { base: 12, md: 6 })}
                {renderSurfaceFieldCol("variantSetId", { base: 12, md: 6 })}
                {renderSurfaceFieldCol("externalStepType", { base: 12, md: 6 })}
                {renderSurfaceFieldCol("description", { base: 12 })}
                {metadataFields.length ? (
                  <Grid.Col span={{ base: 12 }}>
                    <div style={{ opacity: 0.8 }}>
                      <RenderGroup
                        form={form as any}
                        fields={surfaceMetadataFields as any}
                        mode={mode as any}
                        ctx={surfaceCtx as any}
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
            </CardChrome>
          </Grid.Col>
          <Grid.Col span={5}>
            <CardChrome
              showEdit={mode === "edit" && !isLoudMode}
              onEdit={() => setPricingDrawerOpen(true)}
              drawerOpened={pricingDrawerOpen}
              onDrawerClose={() => setPricingDrawerOpen(false)}
              drawerTitle="Edit pricing"
              drawerChildren={
                drawerPricingFields.length ? (
                  <Stack gap="md">
                    <RenderGroup
                      form={form as any}
                      fields={drawerPricingFields as any}
                      mode={mode as any}
                      ctx={drawerCtx as any}
                      gap={10}
                    />
                    <Group justify="flex-end">
                      <Button
                        variant="default"
                        onClick={() => setPricingDrawerOpen(false)}
                      >
                        Close
                      </Button>
                      <Button disabled={!drawerDirty} onClick={handleDrawerSave}>
                        Save changes
                      </Button>
                    </Group>
                  </Stack>
                ) : null
              }
            >
              <Stack gap="sm">
                {needsTemplate ? (
                  <Text size="xs" c="dimmed">
                    Select a template to unlock template-driven defaults.
                  </Text>
                ) : null}
                <Group justify="space-between" align="center" wrap="wrap">
                  <Text size="xs" c="dimmed">
                    Pricing model: {pricingModelLabelResolved}
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
                {resolvedPricingModel === "COST_PLUS_FIXED_SELL" ? (
                  <Stack gap="xs">
                    {renderSurfaceFieldByName("costPrice")}
                    {renderSurfaceFieldByName("manualSalePriceOverride")}
                    <Text size="xs" c="dimmed">
                      Margin (derived):{" "}
                      {derivedMargin == null
                        ? "—"
                        : `${Math.round(derivedMargin * 1000) / 10}%`}
                    </Text>
                  </Stack>
                ) : resolvedPricingModel === "COST_PLUS_MARGIN" ? (
                  <Stack gap="xs">
                    {renderSurfaceFieldByName("costPrice")}
                    {renderSurfaceFieldByName("manualMargin")}
                    <Text size="xs" c="dimmed">
                      Sell (derived):{" "}
                      {derivedSellValue ? (
                        <PricingValueWithMeta priced={derivedSellValue} size="xs" />
                      ) : (
                        "—"
                      )}
                    </Text>
                  </Stack>
                ) : resolvedPricingModel === "TIERED_COST_PLUS_MARGIN" ? (
                  <Stack gap="xs">
                    {renderSurfaceFieldByName("manualMargin")}
                    <Text size="xs" c="dimmed">
                      {costTierSummary}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Cost (derived @ {pricingPrefs.qty}):{" "}
                      {derivedTierCostValue ? (
                        <PricingValueWithMeta
                          priced={derivedTierCostValue}
                          size="xs"
                        />
                      ) : (
                        "—"
                      )}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Sell (derived @ {pricingPrefs.qty}):{" "}
                      {derivedSellValue ? (
                        <PricingValueWithMeta
                          priced={derivedSellValue}
                          size="xs"
                        />
                      ) : (
                        "—"
                      )}
                    </Text>
                  </Stack>
                ) : resolvedPricingModel === "TIERED_COST_PLUS_FIXED_SELL" ? (
                  <Stack gap="xs">
                    {renderSurfaceFieldByName("manualSalePriceOverride")}
                    <Text size="xs" c="dimmed">
                      {costTierSummary}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Cost (derived @ {pricingPrefs.qty}):{" "}
                      {derivedTierCostValue ? (
                        <PricingValueWithMeta
                          priced={derivedTierCostValue}
                          size="xs"
                        />
                      ) : (
                        "—"
                      )}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Sell (derived @ {pricingPrefs.qty}):{" "}
                      {derivedSellValue ? (
                        <PricingValueWithMeta
                          priced={derivedSellValue}
                          size="xs"
                        />
                      ) : (
                        "—"
                      )}
                    </Text>
                  </Stack>
                ) : resolvedPricingModel === "CURVE_SELL_AT_MOQ" ? (
                  <Stack gap="xs">
                    <Text size="xs" c="dimmed">
                      Spec: {specSummary}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Price at MOQ:{" "}
                      {baselinePriceAtMoq != null && baselinePriceAtMoq !== ""
                        ? Number(baselinePriceAtMoq).toFixed(2)
                        : "—"}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Sell (derived @ {pricingPrefs.qty}):{" "}
                      {derivedSellValue ? (
                        <PricingValueWithMeta priced={derivedSellValue} size="xs" />
                      ) : (
                        "—"
                      )}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Cost (derived @ {pricingPrefs.qty}):{" "}
                      {derivedCurveCostValue ? (
                        <PricingValueWithMeta priced={derivedCurveCostValue} size="xs" />
                      ) : (
                        "—"
                      )}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Curve pricing ignores cost price; uses MOQ curve + transfer %.
                    </Text>
                  </Stack>
                ) : (
                  <Text size="xs" c="dimmed">
                    Pricing mode not set.
                  </Text>
                )}
                {renderSurfaceFieldByName("purchaseTaxId")}
                <div style={{ height: 6 }} />
                {renderSurfaceFieldByName("leadTimeDays")}
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
                    disabled={!isLoudMode}
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
            </CardChrome>
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
              data={pricingModelOptions}
              value={resolvedPricingModel ?? ""}
              onChange={(next) => {
                if (!next || next === resolvedPricingModel) return;
                confirmPricingModelChange(next);
              }}
            />
          ) : (
            <Group justify="space-between" align="center">
              <Text size="sm" c="dimmed">
                Pricing model: {pricingModelLabelResolved}
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
          {resolvedPricingModel === "TIERED_COST_PLUS_MARGIN" ||
          resolvedPricingModel === "TIERED_COST_PLUS_FIXED_SELL" ? (
            <Stack gap={4}>
              {renderFieldByName("costGroupId", { ctx: drawerCtx })}
              <Text size="xs" c="dimmed">
                Selects the cost tier schedule used for tiered pricing.
              </Text>
            </Stack>
          ) : null}
          {resolvedPricingModel === "CURVE_SELL_AT_MOQ" ? (
            <>
              <Stack gap={4}>
                <Select
                  label="Curve Spec"
                  data={pricingSpecOptions}
                  value={pricingSpecId != null ? String(pricingSpecId) : ""}
                  placeholder="Select curve spec"
                  onChange={(val) => {
                    const next = val ? Number(val) : null;
                    form.setValue("pricingSpecId", next, { shouldDirty: true });
                  }}
                />
                <Group justify="space-between">
                  <Button
                    component={Link}
                    to="/admin/pricing-specs"
                    size="xs"
                    variant="subtle"
                  >
                    View specs
                  </Button>
                  {pricingSpecId != null ? (
                    <Button
                      component={Link}
                      to={`/admin/pricing-specs/${pricingSpecId}/sheet`}
                      size="xs"
                      variant="light"
                    >
                      Edit spec
                    </Button>
                  ) : null}
                </Group>
              </Stack>
              {renderFieldByName("baselinePriceAtMoq", { ctx: drawerCtx })}
              {renderFieldByName("transferPercent", { ctx: drawerCtx })}
              {curvePreviewRows.length ? (
                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    Curve preview (unit sell)
                  </Text>
                  {curvePreviewRows.map((row) => (
                    <Group
                      key={row.qty}
                      justify="space-between"
                      align="center"
                      wrap="nowrap"
                    >
                      <Text size="xs">Qty {row.qty}</Text>
                      <Text size="xs" c="dimmed">
                        × {row.multiplier ?? "—"}
                      </Text>
                      <Text size="xs">{row.unitPrice}</Text>
                    </Group>
                  ))}
                </Stack>
              ) : null}
            </>
          ) : null}
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
