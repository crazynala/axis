import type { ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { ProductStage, ValueListType } from "@prisma/client";
import { requireUserId } from "~/utils/auth.server";
import { buildWhereFromConfig } from "~/utils/buildWhereFromConfig.server";
import {
  productAssocFields,
  productBomFindFields,
  productIdentityFields,
  productPricingFields,
} from "~/modules/product/forms/productDetail";
import { loadOptions } from "~/utils/options.server";
import { invalidateAllOptions } from "~/utils/options.server";
import { deriveExternalStepTypeFromCategoryCode } from "~/modules/product/rules/productTypeRules";

const PRODUCT_DELETE_PHRASE = "LET'S DO IT";
const META_PREFIX = "meta__";
const NEW_ENUM_PREFIX = "NEW:";

function slugifyEnumLabel(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseMetadataValue(
  raw: FormDataEntryValue | null,
  dataType: string
): { hasValue: boolean; data: Record<string, any> } {
  const data = {
    valueString: null,
    valueNumber: null,
    valueBool: null,
    valueJson: null,
  } as Record<string, any>;
  if (raw == null) return { hasValue: false, data };
  const trimmed = String(raw).trim();
  if (!trimmed) return { hasValue: false, data };
  switch (dataType) {
    case "NUMBER": {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return { hasValue: false, data };
      data.valueNumber = n;
      return { hasValue: true, data };
    }
    case "BOOLEAN": {
      if (trimmed !== "true" && trimmed !== "false")
        return { hasValue: false, data };
      data.valueBool = trimmed === "true";
      return { hasValue: true, data };
    }
    case "JSON": {
      try {
        data.valueJson = JSON.parse(trimmed);
      } catch {
        data.valueString = trimmed;
      }
      return { hasValue: true, data };
    }
    case "ENUM":
    case "STRING":
    default: {
      data.valueString = trimmed;
      return { hasValue: true, data };
    }
  }
}

async function applyProductMetadataValues({
  prisma,
  productId,
  form,
  productType,
  categoryId,
  subCategoryId,
  useTransaction = true,
}: {
  prisma: any;
  productId: number;
  form: FormData;
  productType: string | null;
  categoryId?: number | null;
  subCategoryId?: number | null;
  useTransaction?: boolean;
}) {
  const keys = Array.from(form.keys())
    .filter(
      (key) =>
        key.startsWith(META_PREFIX) &&
        !key.endsWith("Min") &&
        !key.endsWith("Max")
    )
    .map((key) => key.slice(META_PREFIX.length));
  if (!keys.length) return;
  const definitions = keys.length
    ? await prisma.productAttributeDefinition.findMany({
        where: { key: { in: keys } },
        select: {
          id: true,
          key: true,
          label: true,
          dataType: true,
          enumOptions: true,
          isRequired: true,
          appliesToProductTypes: true,
          appliesToCategoryIds: true,
          appliesToSubcategoryIds: true,
          options: {
            select: {
              id: true,
              label: true,
              slug: true,
              isArchived: true,
              mergedIntoId: true,
            },
          },
        },
      })
    : [];
  const defByKey = new Map(definitions.map((def: any) => [def.key, def]));
  const ops: any[] = [];
  const errors: string[] = [];
  let optionsTouched = false;
  const normalizedType = productType ? String(productType).toLowerCase() : "";
  const normalizedCategoryId =
    categoryId != null && Number.isFinite(Number(categoryId))
      ? Number(categoryId)
      : null;
  const normalizedSubCategoryId =
    subCategoryId != null && Number.isFinite(Number(subCategoryId))
      ? Number(subCategoryId)
      : null;
  const appliesToDef = (def: any) => {
    const typeList = Array.isArray(def.appliesToProductTypes)
      ? def.appliesToProductTypes
      : [];
    const typeMatch = !typeList.length
      ? true
      : normalizedType
      ? typeList.some(
          (entry: string) => String(entry).toLowerCase() === normalizedType
        )
      : false;
    if (!typeMatch) return false;
    const categoryList = Array.isArray(def.appliesToCategoryIds)
      ? def.appliesToCategoryIds
      : [];
    if (categoryList.length) {
      if (!normalizedCategoryId) return false;
      if (!categoryList.includes(normalizedCategoryId)) return false;
    }
    const subcategoryList = Array.isArray(def.appliesToSubcategoryIds)
      ? def.appliesToSubcategoryIds
      : [];
    if (subcategoryList.length) {
      if (!normalizedSubCategoryId) return false;
      if (!subcategoryList.includes(normalizedSubCategoryId)) return false;
    }
    return true;
  };
  const parsedByKey = new Map<
    string,
    { hasValue: boolean; data: Record<string, any> }
  >();
  for (const key of keys) {
    const def = defByKey.get(key);
    if (!def) continue;
    if (!appliesToDef(def)) continue;
    const fieldName = `${META_PREFIX}${key}`;
    if (!form.has(fieldName)) continue;
    const parsed = parseMetadataValue(form.get(fieldName), def.dataType);
    parsedByKey.set(key, parsed);
    if (!parsed.hasValue) {
      if (def.isRequired) {
        errors.push(`${def.label || def.key} is required.`);
        continue;
      }
      ops.push(
        prisma.productAttributeValue.deleteMany({
          where: { productId, definitionId: def.id },
        })
      );
      continue;
    }
    if (def.dataType === "ENUM") {
      const rawValue = String(parsed.data.valueString ?? "");
      let optionId: number | null = null;
      if (rawValue.startsWith(NEW_ENUM_PREFIX)) {
        const label = rawValue.slice(NEW_ENUM_PREFIX.length).trim();
        const slug = slugifyEnumLabel(label);
        if (!slug) {
          errors.push(`${def.label || def.key} value is invalid.`);
          continue;
        }
        const created = await prisma.productAttributeOption.upsert({
          where: {
            definitionId_slug: { definitionId: def.id, slug },
          },
          create: { definitionId: def.id, label, slug },
          update: { label },
        });
        optionsTouched = true;
        optionId = created.mergedIntoId ?? created.id;
      } else if (/^\d+$/.test(rawValue)) {
        optionId = Number(rawValue);
        const matched = Array.isArray(def.options)
          ? def.options.find((opt: any) => opt.id === optionId)
          : null;
        if (matched?.mergedIntoId) {
          optionId = matched.mergedIntoId;
        }
      } else {
        const label = rawValue.trim();
        const slug = slugifyEnumLabel(label);
        if (!slug) {
          errors.push(`${def.label || def.key} value is invalid.`);
          continue;
        }
        const created = await prisma.productAttributeOption.upsert({
          where: {
            definitionId_slug: { definitionId: def.id, slug },
          },
          create: { definitionId: def.id, label, slug },
          update: { label },
        });
        optionsTouched = true;
        optionId = created.mergedIntoId ?? created.id;
      }
      if (!optionId) {
        errors.push(`${def.label || def.key} value is invalid.`);
        continue;
      }
      ops.push(
        prisma.productAttributeValue.upsert({
          where: {
            productId_definitionId: { productId, definitionId: def.id },
          },
          create: { productId, definitionId: def.id, optionId },
          update: { optionId, valueString: null },
        })
      );
      continue;
    }
    ops.push(
      prisma.productAttributeValue.upsert({
        where: {
          productId_definitionId: { productId, definitionId: def.id },
        },
        create: { productId, definitionId: def.id, ...parsed.data },
        update: parsed.data,
      })
    );
  }
  if (normalizedType || keys.length) {
    const requiredDefs = await prisma.productAttributeDefinition.findMany({
      where: {
        isRequired: true,
      },
      select: {
        id: true,
        key: true,
        label: true,
        appliesToProductTypes: true,
        appliesToCategoryIds: true,
        appliesToSubcategoryIds: true,
      },
    });
    if (requiredDefs.length) {
      const requiredIds = requiredDefs.map((def: any) => def.id);
      const existingValues = await prisma.productAttributeValue.findMany({
        where: { productId, definitionId: { in: requiredIds } },
        select: { definitionId: true },
      });
      const existingSet = new Set(existingValues.map((v: any) => v.definitionId));
      for (const def of requiredDefs) {
        if (!appliesToDef(def)) continue;
        const parsed = parsedByKey.get(def.key);
        if (parsed?.hasValue) continue;
        if (!parsed && existingSet.has(def.id)) continue;
        errors.push(`${def.label || def.key} is required.`);
        break;
      }
    }
  }
  if (errors.length) {
    return { ok: false, error: errors[0] };
  }
  if (ops.length) {
    if (useTransaction) {
      await prisma.$transaction(ops);
    } else {
      for (const op of ops) {
        await op;
      }
    }
  }
  return { ok: true, optionsTouched };
}

export async function handleProductDetailAction({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  const { prismaBase, refreshProductStockSnapshot } = await import("~/utils/prisma.server");
  const idRaw = params.id;
  const isNew = idRaw === "new";
  const id = !isNew && idRaw && !Number.isNaN(Number(idRaw)) ? Number(idRaw) : NaN;

  let intent = "";
  let form: FormData | null = null;
  const ct = request.headers.get("content-type") || "";
  let jsonBody: any = null;
  if (ct.includes("application/json")) {
    try {
      jsonBody = await request.json();
      intent = String(jsonBody?._intent || "");
    } catch {
      // fall back to form parsing
    }
  }
  if (!intent) {
    form = await request.formData();
    intent = String(form.get("_intent") || "");
  }

  if (intent === "movement.lookupShipment") {
    const movementId = Number((form || (await request.formData())).get("movementId"));
    if (!Number.isFinite(movementId)) {
      return json({ error: "Invalid movement id", intent }, { status: 400 });
    }
    const movement = await prismaBase.productMovement.findUnique({
      where: { id: movementId },
      select: { shippingLineId: true },
    });
    const shippingLineId = Number(movement?.shippingLineId);
    if (!Number.isFinite(shippingLineId)) {
      return json({ shipmentLine: null, intent });
    }
    const sl = await prismaBase.shipmentLine.findUnique({
      where: { id: shippingLineId },
      select: {
        id: true,
        shipmentId: true,
        shipment: {
          select: {
            id: true,
            trackingNo: true,
            packingSlipCode: true,
            type: true,
          },
        },
      },
    });
    return json({ shipmentLine: sl, intent });
  }

  if (intent === "movement.delete") {
    if (!Number.isFinite(id)) return json({ error: "Invalid product id" }, { status: 400 });
    const f = form || (await request.formData());
    const movementId = Number(f.get("movementId"));
    if (!Number.isFinite(movementId))
      return json({ error: "Invalid movement id" }, { status: 400 });
    const userId = await requireUserId(request);
    const user = await prismaBase.user.findUnique({
      where: { id: userId },
      select: { userLevel: true },
    });
    if ((user?.userLevel as string | null) !== "Admin") {
      return json({ error: "Forbidden", intent: "movement.delete" }, { status: 403 });
    }
    await prismaBase.$transaction(async (tx) => {
      await tx.productMovementLine.deleteMany({ where: { movementId } });
      await tx.productMovement.deleteMany({ where: { id: movementId } });
    });
    const isFetcher = !!request.headers.get("x-remix-fetch");
    if (isFetcher) return json({ ok: true, intent: "movement.delete" });
    return redirect(`/products/${id}`);
  }

  if (intent === "product.updateStage") {
    if (!Number.isFinite(id)) {
      return json({ error: "Invalid product id" }, { status: 400 });
    }
    if (!form) form = await request.formData();
    const rawStage = String(form.get("productStage") ?? "")
      .trim()
      .toUpperCase();
    if (!Object.values(ProductStage).includes(rawStage as ProductStage)) {
      return json({ error: "Invalid product stage" }, { status: 400 });
    }
    const userId = await requireUserId(request);
    await prismaBase.product.update({
      where: { id },
      data: {
        productStage: rawStage as ProductStage,
        modifiedBy: String(userId),
      },
    });
    return redirect(`/products/${id}`);
  }

  const { buildProductData } = await import("~/modules/product/services/productForm.server");
  if (isNew || intent === "create") {
    if (!form) form = await request.formData();
    const data = buildProductData(form);
    const typeUpper = String((data as any).type || "").toUpperCase();
    const needsDefaultTax =
      typeUpper === "FABRIC" || typeUpper === "TRIM" || typeUpper === "PACKAGING";
    if (needsDefaultTax && (data as any).purchaseTaxId == null) {
      let kdvTax = await prismaBase.valueList.findFirst({
        where: {
          type: ValueListType.Tax,
          OR: [
            { label: { equals: "KDV-10", mode: "insensitive" } },
            { label: { equals: "KDV 10", mode: "insensitive" } },
            { label: { contains: "KDV-10", mode: "insensitive" } },
            { label: { contains: "KDV 10", mode: "insensitive" } },
            { code: { equals: "KDV-10", mode: "insensitive" } },
            { code: { equals: "KDV10", mode: "insensitive" } },
            { code: { contains: "KDV-10", mode: "insensitive" } },
            { code: { contains: "KDV 10", mode: "insensitive" } },
          ],
        },
        select: { id: true, label: true, code: true, value: true },
      });
      if (!kdvTax) {
        kdvTax = await prismaBase.valueList.findFirst({
          where: {
            type: ValueListType.Tax,
            OR: [{ value: 0.1 as any }, { value: 10 as any }],
          },
          select: { id: true, label: true, code: true, value: true },
        });
      }
      if (kdvTax?.id != null) {
        (data as any).purchaseTaxId = kdvTax.id;
      } else {
        console.warn(
          "[product create] KDV-10 tax not found; leaving purchaseTaxId empty",
          { type: typeUpper }
        );
      }
    }
    let optionsTouched = false;
    try {
      const created = await prismaBase.$transaction(async (tx: any) => {
        const next = await tx.product.create({ data });
        const metaResult = await applyProductMetadataValues({
          prisma: tx,
          productId: next.id,
          form,
          productType: String((data as any).type || "") || null,
          categoryId: (data as any).categoryId ?? null,
          subCategoryId: (data as any).subCategoryId ?? null,
          useTransaction: false,
        });
        if (metaResult && !metaResult.ok) {
          throw new Error(metaResult.error);
        }
        optionsTouched = Boolean(metaResult?.optionsTouched);
        return next;
      });
      if (optionsTouched) {
        invalidateAllOptions();
      }
      return redirect(`/products/${created.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Create failed.";
      return json({ intent: "create", error: message }, { status: 400 });
    }
  }

  if (intent === "find") {
    if (!form) form = await request.formData();
    const raw = Object.fromEntries(form.entries());
    const values: any = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith("_")) continue;
      values[k] = v === "" ? null : v;
    }
    const where = buildWhereFromConfig(values, [
      ...productIdentityFields,
      ...productAssocFields,
      ...productPricingFields,
      ...productBomFindFields,
    ]);
    const first = await prismaBase.product.findFirst({
      where,
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const sp = new URLSearchParams();
    sp.set("find", "1");
    const push = (k: string, v: any) => {
      if (v === undefined || v === null || v === "") return;
      sp.set(k, String(v));
    };
    push("sku", values.sku);
    push("name", values.name);
    push("description", values.description);
    push("type", values.type);
    push("costPriceMin", values.costPriceMin);
    push("costPriceMax", values.costPriceMax);
    push("manualSalePriceMin", values.manualSalePriceMin);
    push("manualSalePriceMax", values.manualSalePriceMax);
    push("purchaseTaxId", values.purchaseTaxId);
    push("categoryId", values.categoryId);
    push("customerId", values.customerId);
    push("supplierId", values.supplierId);
    if (values.stockTrackingEnabled === true || values.stockTrackingEnabled === "true")
      push("stockTrackingEnabled", "true");
    if (values.stockTrackingEnabled === false || values.stockTrackingEnabled === "false")
      push("stockTrackingEnabled", "false");
    if (values.batchTrackingEnabled === true || values.batchTrackingEnabled === "true")
      push("batchTrackingEnabled", "true");
    if (values.batchTrackingEnabled === false || values.batchTrackingEnabled === "false")
      push("batchTrackingEnabled", "false");
    push("componentChildSku", values.componentChildSku);
    push("componentChildName", values.componentChildName);
    push("componentChildSupplierId", values.componentChildSupplierId);
    push("componentChildType", values.componentChildType);
    const qs = sp.toString();
    if (first?.id != null) return redirect(`/products/${first.id}?${qs}`);
    return redirect(`/products?${qs}`);
  }

  if (intent === "update") {
    if (!Number.isFinite(id)) return json({ error: "Invalid product id" }, { status: 400 });
    if (!form) form = await request.formData();
    const data = buildProductData(form);
    try {
      const options = await loadOptions();
      const meta = options.categoryMetaById?.[String((data as any).categoryId)];
      const derived = deriveExternalStepTypeFromCategoryCode(meta?.code);
      if (String((data as any).type || "").toUpperCase() === "SERVICE") {
        if (derived && !(data as any).externalStepType) {
          (data as any).externalStepType = derived;
        } else if (!derived && !(data as any).externalStepType) {
          (data as any).externalStepType = null;
        }
      } else {
        (data as any).externalStepType = null;
      }
      console.log("[product update] resolved external step", {
        id,
        type: (data as any).type,
        categoryId: (data as any).categoryId,
        derived,
        externalStepType: (data as any).externalStepType,
      });
    } catch (err) {
      console.warn("[product update] failed to derive external step", err);
    }
    console.log("[product update] payload", {
      id,
      type: (data as any).type,
      categoryId: (data as any).categoryId,
      externalStepType: (data as any).externalStepType,
    });
    let optionsTouched = false;
    try {
      await prismaBase.$transaction(async (tx: any) => {
        await tx.product.update({ where: { id }, data });
        const metaResult = await applyProductMetadataValues({
          prisma: tx,
          productId: id,
          form,
          productType: String((data as any).type || "") || null,
          categoryId: (data as any).categoryId ?? null,
          subCategoryId: (data as any).subCategoryId ?? null,
          useTransaction: false,
        });
        if (metaResult && !metaResult.ok) {
          throw new Error(metaResult.error);
        }
        optionsTouched = Boolean(metaResult?.optionsTouched);
      });
      if (optionsTouched) {
        invalidateAllOptions();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed.";
      return json({ intent: "update", error: message }, { status: 400 });
    }
    try {
      const raw = form.get("tagNames") as string | null;
      if (raw != null) {
        let names: string[] = [];
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) names = parsed.map((s) => String(s));
        } catch {}
        const userId = await requireUserId(request);
        const { replaceProductTagsByNames } = await import(
          "~/modules/product/services/productTags.server"
        );
        await replaceProductTagsByNames(id, names, userId as any);
      }
    } catch (e) {
      console.warn("Failed to update product tags from form", e);
    }

    try {
      const rawUpdates = form.get("bomUpdates") as string | null;
      const rawCreates = form.get("bomCreates") as string | null;
      const rawDeletes = form.get("bomDeletes") as string | null;
      const updates = rawUpdates ? JSON.parse(rawUpdates) : [];
      const creates = rawCreates ? JSON.parse(rawCreates) : [];
      const deletes = rawDeletes ? JSON.parse(rawDeletes) : [];
      if (
        Array.isArray(updates) ||
        Array.isArray(creates) ||
        Array.isArray(deletes)
      ) {
        const safeUpdates = Array.isArray(updates) ? updates : [];
        const safeCreates = Array.isArray(creates) ? creates : [];
        const safeDeletes = Array.isArray(deletes) ? deletes : [];
        if (
          safeUpdates.length ||
          safeCreates.length ||
          safeDeletes.length
        ) {
          const { applyBomBatch } = await import(
            "~/modules/product/services/productBom.server"
          );
          await applyBomBatch(id, safeUpdates, safeCreates, safeDeletes);
        }
      }
    } catch (e) {
      console.warn("Failed to apply BOM changes from form", e);
    }

    return redirect(`/products/${id}`);
  }

  if (intent === "price.preview") {
    if (!Number.isFinite(id)) return json({ error: "Invalid product id" }, { status: 400 });
    const qty = Number((form || (await request.formData())).get("qty"));
    const customerIdRaw = (form || (await request.formData())).get("customerId") as string | null;
    const customerId = customerIdRaw ? Number(customerIdRaw) : null;
    const { priceProduct } = await import("~/modules/product/pricing/pricingService.server");
    const result = await priceProduct({
      productId: id,
      qty: Number.isFinite(qty) ? qty : 60,
      customerId,
    });
    return json(result);
  }

  if (intent === "stock.refresh") {
    const { refreshStockSnapshotSafe } = await import("~/modules/product/services/productStock.server");
    const res = await refreshStockSnapshotSafe();
    if (!res.ok) return json(res, { status: 500 });
    return json(res);
  }

  if (intent === "product.tags.replace") {
    if (!Number.isFinite(id)) return json({ error: "Invalid product id" }, { status: 400 });
    const userId = await requireUserId(request);
    const names: string[] = Array.isArray(jsonBody?.names)
      ? jsonBody.names.map((n: any) => String(n))
      : Array.isArray((await request.formData()).getAll("names"))
      ? (await request.formData()).getAll("names").map((n) => String(n))
      : [];
    const { replaceProductTagsByNames } = await import("~/modules/product/services/productTags.server");
    await replaceProductTagsByNames(id, names, userId as any);
    return json({ ok: true });
  }

  if (intent === "product.addComponent") {
    if (!Number.isFinite(id)) return json({ error: "Invalid product id" }, { status: 400 });
    if (!form) form = await request.formData();
    const childId = Number(form.get("childId"));
    if (Number.isFinite(childId)) {
      await prismaBase.productLine.create({
        data: { parentId: id, childId, quantity: 1 },
      });
    }
    return redirect(`/products/${id}`);
  }

  if (intent === "product.duplicate") {
    if (!Number.isFinite(id)) return json({ error: "Invalid product id" }, { status: 400 });
    const source = await prismaBase.product.findUnique({
      where: { id },
      include: {
        productTags: { select: { tagId: true } },
        Costing: true,
      },
    });
    if (!source) return redirect("/products");
    const baseSku = source.sku ? `${source.sku}-COPY` : `${source.id}-COPY`;
    let candidateSku = baseSku;
    let counter = 2;
    while (
      await prismaBase.product.findUnique({
        where: { sku: candidateSku },
        select: { id: true },
      })
    ) {
      candidateSku = `${baseSku}-${counter++}`;
    }
    const newProduct = await prismaBase.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          sku: candidateSku,
          name: (source as any).name,
          description: (source as any).description,
          type: (source as any).type,
          supplierId: (source as any).supplierId,
          customerId: (source as any).customerId,
          costPrice: (source as any).costPrice,
          costCurrency: (source as any).costCurrency,
          purchaseTaxId: (source as any).purchaseTaxId,
          categoryId: (source as any).categoryId,
          subCategory: (source as any).subCategory,
          pricingGroupId: (source as any).pricingGroupId,
          manualSalePrice: (source as any).manualSalePrice,
          manualMargin: (source as any).manualMargin,
          pricingModel: (source as any).pricingModel,
          pricingSpecId: (source as any).pricingSpecId,
          baselinePriceAtMoq: (source as any).baselinePriceAtMoq,
          transferPercent: (source as any).transferPercent,
          defaultCostQty: (source as any).defaultCostQty,
          variantSetId: (source as any).variantSetId,
          stockTrackingEnabled: (source as any).stockTrackingEnabled,
          batchTrackingEnabled: (source as any).batchTrackingEnabled,
          isActive: (source as any).isActive,
          notes: (source as any).notes,
          whiteboard: (source as any).whiteboard,
          costGroupId: (source as any).costGroupId,
          salePriceGroupId: (source as any).salePriceGroupId,
          flagIsDisabled: false,
        },
      });
      const tagRows = ((source as any).productTags || [])
        .map((pt: any) => pt?.tagId)
        .filter((id: any) => Number.isFinite(Number(id)))
        .map((tagId: any) => ({ productId: created.id, tagId: Number(tagId) }));
      if (tagRows.length) {
        await tx.productTag.createMany({ data: tagRows });
      }
      const costings = (source as any).Costing || [];
      if (Array.isArray(costings) && costings.length) {
        await tx.costing.createMany({
          data: costings.map((c: any) => ({
            assemblyId: null,
            productId: created.id,
            quantityPerUnit: c.quantityPerUnit,
            unitCost: c.unitCost,
            notes: c.notes,
            activityUsed: c.activityUsed,
            costPricePerItem: c.costPricePerItem,
            salePricePerItem: c.salePricePerItem,
            salePriceGroupId: c.salePriceGroupId,
            manualSalePrice: c.manualSalePrice,
            manualMargin: c.manualMargin,
            flagAssembly: c.flagAssembly,
            flagDefinedInProduct: c.flagDefinedInProduct,
            flagIsBillableManual: c.flagIsBillableManual,
            flagIsInvoiceableManual: c.flagIsInvoiceableManual,
            flagIsDisabled: c.flagIsDisabled,
            flagStockTracked: c.flagStockTracked,
          })),
        });
      }
      return created;
    });
    return redirect(`/products/${newProduct.id}`);
  }

  if (intent === "batch.editMeta") {
    if (!Number.isFinite(id))
      return json({ intent: "batch.editMeta", error: "Invalid product id" }, { status: 400 });
    const f = form || (await request.formData());
    const batchId = Number(f.get("batchId"));
    if (!Number.isFinite(batchId))
      return json({ intent: "batch.editMeta", error: "Invalid batch id" }, { status: 400 });
    const normalize = (value: unknown) => {
      if (value == null) return null;
      const trimmed = String(value).trim();
      return trimmed === "" ? null : trimmed;
    };
    const data: { name: string | null; codeMill: string | null; codeSartor: string | null } = {
      name: normalize(f.get("name")),
      codeMill: normalize(f.get("codeMill")),
      codeSartor: normalize(f.get("codeSartor")),
    };
    const result = await prismaBase.batch.updateMany({
      where: { id: batchId, productId: id },
      data,
    });
    if (result.count === 0) {
      return json(
        { intent: "batch.editMeta", error: "Batch not found for this product." },
        { status: 404 }
      );
    }
    try {
      await refreshProductStockSnapshot(false);
    } catch (err) {
      console.warn("Failed to refresh stock snapshot", err);
    }
    return json({ ok: true });
  }

  if (intent === "delete") {
    if (!Number.isFinite(id))
      return json({ error: "Invalid product id", intent: "delete" }, { status: 400 });
    const f = form || (await request.formData());
    const confirmationRaw = String(f.get("confirmDelete") || "");
    const normalized = confirmationRaw.replace(/\u2019/g, "'").trim();
    if (normalized !== PRODUCT_DELETE_PHRASE) {
      return json(
        { intent: "delete", error: `Type ${PRODUCT_DELETE_PHRASE} to confirm deletion.` },
        { status: 400 }
      );
    }
    await prismaBase.product.delete({ where: { id } });
    return redirect("/products");
  }

  if (intent === "inventory.amend.batch") {
    const f = form || (await request.formData());
    const productId = Number(f.get("productId"));
    const batchId = Number(f.get("batchId"));
    const locationIdRaw = f.get("locationId") as string | null;
    const locationId = locationIdRaw ? Number(locationIdRaw) : null;
    const dateStr = String(f.get("date") || "");
    const delta = Number(f.get("delta"));
    const date = dateStr ? new Date(dateStr) : new Date();
    const { amendBatch } = await import("~/modules/product/services/productInventory.server");
    await amendBatch(Number.isFinite(productId) ? productId : null, batchId, locationId, date, delta);
    return redirect(`/products/${params.id}`);
  }

  if (intent === "inventory.amend.product") {
    const f = form || (await request.formData());
    const productId = Number(params.id);
    const dateStr = String(f.get("date") || "");
    const date = dateStr ? new Date(dateStr) : new Date();
    let changes: Array<{ batchId: number; locationId: number | null; delta: number }> = [];
    let creates: Array<{
      name?: string | null;
      codeMill?: string | null;
      codeSartor?: string | null;
      locationId: number | null;
      qty: number;
    }> = [];
    try {
      const cStr = String(f.get("changes") || "[]");
      const parsed = JSON.parse(cStr);
      if (Array.isArray(parsed)) changes = parsed;
    } catch {}
    try {
      const cStr = String(f.get("creates") || "[]");
      const parsed = JSON.parse(cStr);
      if (Array.isArray(parsed)) creates = parsed;
    } catch {}
    const { amendProductBulk } = await import("~/modules/product/services/productInventory.server");
    await amendProductBulk(productId, date, changes, creates);
    return redirect(`/products/${params.id}`);
  }

  if (intent === "inventory.transfer.batch") {
    const productId = Number(params.id);
    const f = form || (await request.formData());
    const sourceBatchId = Number(f.get("sourceBatchId"));
    const qty = Number(f.get("qty"));
    const dateStr = String(f.get("date") || "");
    const date = dateStr ? new Date(dateStr) : new Date();
    const mode = String(f.get("mode") || "existing");
    const { transferBetweenBatches } = await import("~/modules/product/services/productInventory.server");
    if (mode === "existing") {
      await transferBetweenBatches(productId, sourceBatchId, qty, date, {
        mode: "existing",
        targetBatchId: Number(f.get("targetBatchId")),
      });
    } else {
      await transferBetweenBatches(productId, sourceBatchId, qty, date, {
        mode: "new",
        name: (f.get("targetName") as string) || null,
        codeMill: (f.get("targetCodeMill") as string) || null,
        codeSartor: (f.get("targetCodeSartor") as string) || null,
        locationId: (() => {
          const raw = f.get("targetLocationId") as string | null;
          return raw ? Number(raw) : null;
        })(),
      });
    }
    return redirect(`/products/${params.id}`);
  }

  if (intent === "bom.batch") {
    if (!Number.isFinite(id)) return json({ error: "Invalid product id" }, { status: 400 });
    if (!jsonBody) return json({ error: "Expected JSON body" }, { status: 400 });
    const updates = Array.isArray(jsonBody.updates) ? jsonBody.updates : [];
    const creates = Array.isArray(jsonBody.creates) ? jsonBody.creates : [];
    const deletes: number[] = Array.isArray(jsonBody.deletes)
      ? jsonBody.deletes.filter((n: any) => Number.isFinite(Number(n))).map(Number)
      : [];
    const { applyBomBatch } = await import("~/modules/product/services/productBom.server");
    const result = await applyBomBatch(id, updates, creates, deletes);
    return json(result);
  }

  return redirect(`/products/${id}`);
}
