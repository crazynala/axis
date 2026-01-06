import { json, redirect } from "@remix-run/node";
import type { Params } from "@remix-run/react";
import { requireUserId } from "~/utils/auth.server";
import { getDebugAccessForUser } from "~/modules/debug/debugAccess.server";
import type { ProductDetailVM } from "~/modules/product/types/productDetailVM";
import { ValueListType } from "@prisma/client";
import {
  inferPricingModelFromData,
  PRODUCT_PRICING_MODEL_LABELS,
  type ProductPricingModel,
} from "~/modules/product/services/pricingModel.server";

export async function loadProductDetailVM(opts: {
  params: Params;
  request: Request;
}): Promise<Response> {
  const { runWithDbActivity, prismaBase } = await import("~/utils/prisma.server");
  const { getProductStockSnapshots } = await import("~/utils/prisma.server");
  return runWithDbActivity("products.detail", async () => {
    const idStr = opts.params.id;
    const id = Number(idStr);
    if (!idStr || Number.isNaN(id)) {
      throw new Response("Invalid product id", { status: 400 });
    }
    const t0 = Date.now();
    const marks: Array<{ label: string; ms: number }> = [];
    const mark = (label: string) => marks.push({ label, ms: Date.now() - t0 });

    const productPromise = prismaBase.product.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, priceMultiplier: true } },
        costGroup: { include: { costRanges: true } },
        pricingSpec: {
          select: { id: true, name: true, code: true, curveFamily: true },
        },
        salePriceGroup: { include: { saleRanges: true } },
        salePriceRanges: true,
      productLines: {
          select: {
            id: true,
            quantity: true,
            activityUsed: true,
            flagAssemblyOmit: true,
            child: {
              select: {
                id: true,
                sku: true,
                name: true,
                type: true,
                supplier: { select: { id: true, name: true } },
              },
            },
          },
        },
        productTags: { include: { tag: true } },
        assemblies: {
          select: {
            id: true,
            name: true,
            jobId: true,
            job: { select: { id: true, projectCode: true, name: true } },
          },
        },
      },
    });
    const productChoicesPromise = prismaBase.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        type: true,
        supplier: { select: { id: true, name: true } },
        _count: { select: { productLines: true } },
      },
      where: { flagIsDisabled: false },
      orderBy: { id: "asc" },
      take: 1000,
    });
    const movementLinesPromise = prismaBase.productMovementLine.findMany({
      where: { productId: id },
      include: {
        movement: {
          select: {
            id: true,
            movementType: true,
            date: true,
            locationId: true,
            locationInId: true,
            locationOutId: true,
            location: { select: { id: true, name: true } },
            shippingLineId: true,
          },
        },
        batch: { select: { id: true, codeMill: true, codeSartor: true } },
      },
      orderBy: [{ movement: { date: "desc" } }, { id: "desc" }],
      take: 500,
    });
    const movementHeadersPromise = prismaBase.productMovement.findMany({
      where: { productId: id },
      select: {
        id: true,
        movementType: true,
        date: true,
        locationInId: true,
        locationOutId: true,
        quantity: true,
        notes: true,
        shippingLineId: true,
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: 500,
    });
    const salePriceGroupsPromise = prismaBase.salePriceGroup.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const metadataDefsPromise = prismaBase.productAttributeDefinition.findMany({
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });
    const metadataValuesPromise = prismaBase.productAttributeValue.findMany({
      where: { productId: id },
      include: {
        definition: { select: { key: true, dataType: true } },
        option: { select: { mergedIntoId: true, isArchived: true } },
      },
    });
    const [
      product,
      productChoices,
      movements,
      movementHeaders,
      salePriceGroups,
      usedInProducts,
      costingAssemblies,
      shipmentLines,
      metadataDefinitions,
      metadataValues,
    ] = await Promise.all([
      productPromise.then((r) => {
        mark("product");
        return r;
      }),
      productChoicesPromise.then((r) => {
        mark("productChoices");
        return r;
      }),
      movementLinesPromise.then((r) => {
        mark("movementLines");
        return r;
      }),
      movementHeadersPromise.then((r) => {
        mark("movementHeaders");
        return r;
      }),
      salePriceGroupsPromise.then((r) => r),
      prismaBase.productLine.findMany({
        where: { childId: id },
        select: {
          id: true,
          parent: { select: { id: true, sku: true, name: true, type: true } },
        },
      }),
      prismaBase.costing.findMany({
        where: {
          productId: id,
          OR: [{ flagIsDisabled: false }, { flagIsDisabled: null }],
        },
        select: {
          assembly: {
            select: {
              id: true,
              name: true,
              jobId: true,
              job: { select: { id: true, projectCode: true, name: true } },
            },
          },
        },
      }),
      (async () => {
        const ids = new Set<number>();
        for (const ml of await movementLinesPromise) {
          const sid = Number((ml as any)?.movement?.shippingLineId);
          if (Number.isFinite(sid)) ids.add(sid);
        }
        for (const mh of await movementHeadersPromise) {
          const sid = Number((mh as any)?.shippingLineId);
          if (Number.isFinite(sid)) ids.add(sid);
        }
        if (!ids.size) return [];
        return prismaBase.shipmentLine.findMany({
          where: { id: { in: Array.from(ids) } },
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
      })(),
      metadataDefsPromise,
      metadataValuesPromise,
    ]);
    if (!product) return redirect("/products");
    const hasCmtLine = (product.productLines || []).some(
      (pl: any) => pl.child?.type === "CMT" && !pl.flagAssemblyOmit
    );
    const categoryId = (product as any)?.categoryId ?? null;
    const subCategoryId = (product as any)?.subCategoryId ?? null;
    const [category, subCategory, subCategoryOptions, pricingSpecs] =
      await Promise.all([
        categoryId
          ? prismaBase.valueList.findUnique({
              where: { id: categoryId },
              select: { id: true, label: true, code: true },
            })
          : Promise.resolve(null),
        subCategoryId
          ? prismaBase.valueList.findUnique({
              where: { id: subCategoryId },
              select: { id: true, label: true, code: true },
            })
          : Promise.resolve(null),
        categoryId
          ? prismaBase.valueList.findMany({
              where: { type: ValueListType.Category, parentId: categoryId },
              orderBy: { label: "asc" },
              select: { id: true, label: true, code: true },
            })
          : Promise.resolve([]),
        prismaBase.pricingSpec.findMany({
          where: {
            target: "SELL",
          },
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
        }),
      ]);
    const pricingSpecOptions = pricingSpecs.map((spec) => ({
      value: String(spec.id),
      label: spec.name || spec.code || spec.curveFamily || `#${spec.id}`,
    }));
    const pricingSpecRangesById = pricingSpecs.reduce<
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
    }, {});
    const subCategorySelect = subCategoryOptions.map((opt) => ({
      value: String(opt.id),
      label: opt.label || opt.code || `#${opt.id}`,
    }));
    const metadataValuesByKey: Record<string, any> = {};
    for (const row of metadataValues || []) {
      const key = (row as any)?.definition?.key;
      if (!key) continue;
      const dt = (row as any)?.definition?.dataType;
      if (dt === "NUMBER") metadataValuesByKey[key] = row.valueNumber;
      else if (dt === "BOOLEAN") metadataValuesByKey[key] = row.valueBool;
      else if (dt === "JSON")
        metadataValuesByKey[key] = row.valueJson ?? row.valueString;
      else if (dt === "ENUM") {
        const mergedIntoId = (row as any)?.option?.mergedIntoId ?? null;
        const isArchived = Boolean((row as any)?.option?.isArchived);
        if (mergedIntoId) {
          metadataValuesByKey[key] = mergedIntoId;
        } else if (isArchived) {
          metadataValuesByKey[key] = null;
        } else {
          metadataValuesByKey[key] =
            (row as any).optionId ?? row.valueString ?? null;
        }
      }
      else metadataValuesByKey[key] = row.valueString ?? null;
    }
    (product as any).metadataValuesByKey = metadataValuesByKey;

    const locIdSet = new Set<number>();
    for (const ml of movements as any[]) {
      const li = (ml?.movement?.locationInId ?? null) as number | null;
      const lo = (ml?.movement?.locationOutId ?? null) as number | null;
      if (typeof li === "number" && Number.isFinite(li)) locIdSet.add(li);
      if (typeof lo === "number" && Number.isFinite(lo)) locIdSet.add(lo);
    }
    for (const mh of movementHeaders as any[]) {
      const li = (mh?.locationInId ?? null) as number | null;
      const lo = (mh?.locationOutId ?? null) as number | null;
      if (typeof li === "number" && Number.isFinite(li)) locIdSet.add(li);
      if (typeof lo === "number" && Number.isFinite(lo)) locIdSet.add(lo);
    }
    const locIds = Array.from(locIdSet);
    const locs = locIds.length
      ? await prismaBase.location.findMany({
          where: { id: { in: locIds } },
          select: { id: true, name: true },
        })
      : [];
    mark("locations");
    const locationNameById = Object.fromEntries(
      locs.map((l) => [l.id, l.name ?? String(l.id)])
    );
    if (process.env.LOG_PERF?.includes("products")) {
      console.log("[perf] products.$id loader timings", { id, marks });
    }
    const snapshot = await getProductStockSnapshots(id);
    const stockByLocation = ((snapshot as any)?.byLocation || []).map((l: any) => ({
      location_id: l.locationId ?? null,
      location_name: l.locationName ?? "",
      qty: l.qty ?? 0,
    }));
    let stockByBatch = ((snapshot as any)?.byBatch || []).map((b: any) => ({
      batch_id: b.batchId ?? null,
      code_mill: b.codeMill ?? "",
      code_sartor: b.codeSartor ?? "",
      batch_name: b.batchName ?? "",
      received_at: b.receivedAt ?? null,
      location_id: b.locationId ?? null,
      location_name: b.locationName ?? "",
      qty: b.qty ?? 0,
    }));
    if (
      (product as any)?.type === "Finished" &&
      stockByBatch.length &&
      stockByBatch.some((b: any) => b.batch_id != null)
    ) {
      const batchIds = Array.from(
        new Set(
          stockByBatch
            .map((b: any) => Number(b.batch_id))
            .filter((n) => Number.isFinite(n))
        )
      );
      const batchDetails = await prismaBase.batch.findMany({
        where: { id: { in: batchIds } },
        select: {
          id: true,
          job: { select: { id: true, projectCode: true, name: true } },
          assembly: { select: { id: true, name: true } },
        },
      });
      const byId = new Map(batchDetails.map((b: any) => [b.id, b]));
      stockByBatch = stockByBatch.map((row: any) => {
        const detail = byId.get(Number(row.batch_id));
        if (!detail) return row;
        return {
          ...row,
          job_id: detail.job?.id ?? null,
          job_project_code: detail.job?.projectCode ?? "",
          job_name: detail.job?.name ?? "",
          assembly_id: detail.assembly?.id ?? null,
          assembly_name: detail.assembly?.name ?? "",
        };
      });
    }
    let userLevel: string | null = null;
    let canDebug = false;
    try {
      const uid = await requireUserId(opts.request);
      const user = await prismaBase.user.findUnique({
        where: { id: uid },
        select: { userLevel: true },
      });
      userLevel = (user?.userLevel as string | null) ?? null;
      const debugAccess = await getDebugAccessForUser(uid);
      canDebug = debugAccess.canDebug;
    } catch {
      // best-effort; leave null if not logged in
    }
    const vm: ProductDetailVM = {
      product,
      effectivePricingModel:
        (product as any)?.pricingModel ?? inferPricingModelFromData(product),
      pricingModelLabel:
        PRODUCT_PRICING_MODEL_LABELS[
          ((product as any)?.pricingModel ??
            inferPricingModelFromData(product)) as ProductPricingModel
        ],
      metadataDefinitions: metadataDefinitions || [],
      metadataValuesByKey,
      stockByLocation,
      stockByBatch,
      productChoices,
      movements,
      movementHeaders,
      locationNameById,
      salePriceGroups,
      usedInProducts,
      costingAssemblies,
      hasCmtLine,
      pricingSpecOptions,
      pricingSpecRangesById,
      categoryLabel: category?.label || category?.code || null,
      subCategoryLabel: subCategory?.label || subCategory?.code || null,
      subCategoryOptions: subCategorySelect,
      userLevel,
      canDebug,
    };

    // Preserve legacy behavior: shipmentLines are queried but not part of loader payload.
    void shipmentLines;

    return json(vm as any);
  });
}
