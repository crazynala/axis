import type { ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { requireUserId } from "~/utils/auth.server";
import { buildWhereFromConfig } from "~/utils/buildWhereFromConfig.server";
import {
  productAssocFields,
  productBomFindFields,
  productIdentityFields,
  productPricingFields,
} from "~/modules/product/forms/productDetail";
import { loadOptions } from "~/utils/options.server";
import { deriveExternalStepTypeFromCategoryCode } from "~/modules/product/rules/productTypeRules";

const PRODUCT_DELETE_PHRASE = "LET'S DO IT";

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

  const { buildProductData } = await import("~/modules/product/services/productForm.server");
  if (isNew || intent === "create") {
    if (!form) form = await request.formData();
    const created = await prismaBase.product.create({
      data: buildProductData(form),
    });
    return redirect(`/products/${created.id}`);
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
    await prismaBase.product.update({ where: { id }, data });
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

