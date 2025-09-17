import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prismaBase } from "../utils/prisma.server";
import {
  assertIntegrationsAuth,
  getLimitOffset,
} from "../utils/integrationsAuth.server";

// Canonical ProductType enum values as defined in prisma schema.
// Keeping an explicit list (instead of importing Prisma enums) avoids pulling prisma client into edge bundles unintentionally
const PRODUCT_TYPE_VALUES = [
  "CMT",
  "Fabric",
  "Finished",
  "Trim",
  "Service",
] as const;
type ProductTypeValue = (typeof PRODUCT_TYPE_VALUES)[number];

function normalizeProductType(
  raw: string | null
): ProductTypeValue | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  return PRODUCT_TYPE_VALUES.find((v) => v.toLowerCase() === lower);
}

function norm(s?: string | null) {
  return (s || "").toLocaleLowerCase();
}

export async function loader({ request }: LoaderFunctionArgs) {
  assertIntegrationsAuth(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const vendorName = url.searchParams.get("vendorName") || "";
  const itemNumber = url.searchParams.get("itemNumber") || "";
  const rawTypeParam = url.searchParams.get("type");
  const sort = url.searchParams.get("sort") || "best_match";
  const { limit, offset } = getLimitOffset(url);

  // Basic candidate fetch: limit breadth for performance; refine with scoring client-side
  // Heuristics: search name/sku/description contains(q tokens)
  const tokens = q
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const where: any = { AND: [] as any[] };
  if (tokens.length) {
    where.AND.push({
      OR: tokens.map((t) => ({
        OR: [
          { name: { contains: t, mode: "insensitive" } },
          { sku: { contains: t, mode: "insensitive" } },
          { description: { contains: t, mode: "insensitive" } },
        ],
      })),
    });
  }
  // --- ProductType normalization ---
  const typeFilter = normalizeProductType(rawTypeParam);
  if (rawTypeParam && !typeFilter) {
    return json(
      {
        error: "invalid_type",
        message: `Invalid product type '${rawTypeParam}'. Valid: ${PRODUCT_TYPE_VALUES.join(
          ","
        )}`,
      },
      { status: 400 }
    );
  }
  if (typeFilter) {
    where.AND.push({ type: typeFilter });
  }
  if (process.env.NODE_ENV !== "production") {
    // Debug visibility of normalization & final where snippet
    const whereType = where.AND.find((clause: any) => clause.type);
    // Use console.debug so it can be filtered easily
    console.debug("[products.search] type normalization", {
      rawTypeParam,
      typeFilter,
      whereType,
    });
  }
  // We may also bias by supplier name later in scoring

  const candidates = await prismaBase.product.findMany({
    where: where.AND.length ? where : undefined,
    select: {
      id: true,
      sku: true,
      name: true,
      description: true,
      type: true,
      supplier: { select: { name: true } },
      manualSalePrice: true,
      category: { select: { label: true, code: true } },
      // No vendor item number field in schema; will leave null
    },
    take: Math.min(500, limit * 5),
  });

  const vNorm = norm(vendorName);
  const iNorm = norm(itemNumber);
  const tNorms = tokens.map(norm);

  type Scored = {
    id: number;
    code: string | null;
    sku: string | null;
    name: string;
    type: string | null;
    vendorName: string | null;
    vendorItemNumber: string | null;
    uom: string | null;
    imageUrl: string | null;
    attributes?: Record<string, any> | null;
    score: number;
    highlights?: Record<string, string[]>;
  };

  const scored: Scored[] = candidates.map((p: any) => {
    const sku = p.sku || null;
    const name = p.name || "";
    const vendor = p.supplier?.name || null;
    let score = 0;
    const highlights: Record<string, string[]> = {};
    const pushHL = (k: string, v: string) => {
      (highlights[k] ||= []).push(v);
    };
    // Base contains on tokens
    for (const t of tNorms) {
      if (norm(name).includes(t)) {
        score += 8;
        pushHL("name", t);
      }
      if (sku && norm(sku).includes(t)) {
        score += 6;
        pushHL("sku", t);
      }
    }
    // Exact matches are stronger
    if (q && (norm(name) === norm(q) || (sku && norm(sku) === norm(q)))) {
      score += 20;
    }
    // Vendor bias
    if (vNorm && vendor && norm(vendor) === vNorm) score += 10;
    if (iNorm && sku && norm(sku) === iNorm) {
      score += 12;
      pushHL("sku", iNorm);
    }
    if (typeFilter && p.type && p.type === typeFilter) {
      score += 5;
      pushHL("type", typeFilter);
    }
    return {
      id: p.id,
      code: null,
      sku,
      name,
      type: (p.type as any) || null,
      vendorName: vendor,
      vendorItemNumber: null,
      uom: null,
      imageUrl: null,
      attributes: p.category?.label
        ? { category: p.category.label }
        : undefined,
      score,
      highlights: Object.keys(highlights).length ? highlights : undefined,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return 0;
  });

  const items = scored.slice(offset, offset + limit);
  return json({ items });
}

// NOTE: No default export -> this is now a Remix Resource Route.
// Hitting /api/v1/integrations/plm/products/search will return pure JSON (or other
// loader Response) instead of an HTML document shell.
