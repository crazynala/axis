# Axis Pricing Architecture

## 1) Goals / Non-goals

### Goals
- Reduce CMT/service SKU boilerplate while keeping everything a `Product` and BOM line (findable, consistent).
- Preserve existing tier and margin logic that already works for fabrics and other supply items.
- Keep pricing resolution deterministic and snapshot-friendly for downstream flows.
- Make PricingSpec an authoring/maintenance tool, not a runtime pricing dependency.

### Non-goals
- Replace or refactor existing tier tables or margin precedence.
- Move runtime pricing resolution to spec evaluation.
- Introduce a new pricing domain outside the existing Product/BOM model.

## 2) Data model (with schema snippets)

### Product pricing fields
Source: `prisma/schema.prisma` (model `Product`).

```prisma
model Product {
  id               Int      @id @default(autoincrement())
  costPrice        Decimal? @db.Decimal(14, 4)
  manualSalePrice  Decimal? @db.Decimal(14, 4)
  manualMargin     Decimal? @db.Decimal(14, 4)
  costGroupId      Int?
  salePriceGroupId Int?
  pricingSpecId    Int?
  // ...
}
```
Refs: `prisma/schema.prisma` (Product fields).

### Tier tables and group linkage
Source: `prisma/schema.prisma` (models `ProductCostRange`, `SalePriceRange`).

```prisma
model ProductCostRange {
  productId         Int?
  costGroupId       Int?
  costPrice         Decimal? @db.Decimal(14, 4)
  sellPriceManual   Decimal? @db.Decimal(14, 4)
  rangeFrom         Int?
  rangeTo           Int?
  generatedBySpecId Int?
  generatedAt       DateTime?
  generatedHash     String?
}

model SalePriceRange {
  productId         Int?
  saleGroupId       Int?
  price             Decimal? @db.Decimal(14, 4)
  rangeFrom         Int?
  rangeTo           Int?
  generatedBySpecId Int?
  generatedAt       DateTime?
  generatedHash     String?
}
```
Refs: `prisma/schema.prisma` (ProductCostRange/SalePriceRange).

**Linkage patterns**
- Exactly one of `productId` or `costGroupId` is set for cost tiers. Importer enforces the invariant.
  - Evidence: `app/importers/importProductCostRanges.ts` (invariant check).
- For sale tiers, runtime selection prefers product-level ranges, then group-level ranges.
  - Evidence: `app/modules/product/pricing/pricingService.server.ts` (product ranges then group ranges).

### Vendor/customer and company overrides
Source: `prisma/schema.prisma` (model `VendorCustomerPricing`), and pricing resolver.

```prisma
model VendorCustomerPricing {
  vendorId       Int
  customerId     Int
  marginOverride Decimal? @db.Decimal(14, 4)
}
```
Refs: `prisma/schema.prisma` (VendorCustomerPricing), `app/modules/product/pricing/pricingService.server.ts` (override precedence).

### New: PricingSpec + Product.pricingSpecId
Source: `prisma/schema.prisma` (model `PricingSpec`, `Product.pricingSpecId`).

```prisma
model PricingSpec {
  id                 Int                @id @default(autoincrement())
  code               String             @unique
  name               String
  target             PricingSpecTarget
  curveFamily        PricingCurveFamily
  defaultBreakpoints Int[]              @default([1, 5, 10, 15, 20, 25, 50, 75, 100, 125, 150, 175, 200, 250])
  params             Json?
  salePriceRanges    SalePriceRange[]
  productCostRanges  ProductCostRange[]
}
```
Refs: `prisma/schema.prisma` (PricingSpec, PricingSpecTarget, PricingCurveFamily).

### Provenance columns on tiers
Source: `prisma/schema.prisma` (ProductCostRange, SalePriceRange).

- `generatedBySpecId`, `generatedAt`, `generatedHash` track spec generation.
- These fields allow regeneration without losing manual tiers from other sources.

## 3) Pricing resolution rules (authoritative)

### Runtime resolution order (SELL)
Source: `app/modules/product/pricing/pricingService.server.ts`.

1) **Manual sale price wins** (`Product.manualSalePrice`).
2) **Sale price tiers** from `SalePriceRange`, preferring product-level ranges, then `SalePriceGroup` ranges.
3) **Cost + margin fallback** if no sell tiers exist.

Evidence:
- Manual sale price short-circuit: `computePrice` in `app/modules/product/pricing/pricingService.server.ts`.
- Tier selection: `priceProduct` in `app/modules/product/pricing/pricingService.server.ts`.

### Runtime resolution order (COST)
Source: `app/modules/product/pricing/pricingService.server.ts`.

- If cost tiers exist, choose the highest `rangeFrom` ≤ qty.
- Otherwise fall back to `Product.costPrice` or group cost price.

Evidence:
- Cost tier selection and fallback: `computePrice` in `app/modules/product/pricing/pricingService.server.ts`.

### Margin override precedence
Source: `app/modules/product/pricing/pricingService.server.ts`.

Precedence for margin:
1) Vendor/customer override (`VendorCustomerPricing.marginOverride`)
2) Vendor default margin (`Company.defaultMarginOverride`)
3) Global default margin (`Setting.defaultMargin`)

Manual product margin overrides the hierarchy.

Evidence:
- `computeEffectiveMargin` and `computePrice` in `app/modules/product/pricing/pricingService.server.ts`.

### Manual overrides precedence
Source: `app/modules/product/pricing/pricingService.server.ts`, `app/modules/product/pricing/validation.ts`.

- `manualSalePrice` and `manualMargin` are mutually exclusive.
- Manual sale price always wins for SELL.

Evidence:
- Mutual exclusivity: `app/modules/product/pricing/validation.ts` and `app/modules/product/services/productForm.server.ts`.
- Manual precedence: `computePrice` in `app/modules/product/pricing/pricingService.server.ts`.

**Important: specs do not resolve runtime pricing; stored tiers do.**
- Generation writes `SalePriceRange` rows; runtime selects from those tiers.
- Evidence: `app/modules/pricing/services/generateSaleTiers.server.ts` and `app/modules/product/pricing/pricingService.server.ts`.

## 4) PricingSpec generation

### Supported curve families
Source: `prisma/schema.prisma` enum `PricingCurveFamily`.

- `CMT_MOQ_50`
- `CMT_MOQ_100`
- `OUTSIDE_ASYMPTOTIC_LOGISTICS`

### Inputs
Source: `app/modules/pricing/services/generateSaleTiers.server.ts`.

- `pricingSpecId`, `productId`
- Breakpoints (override or default)
- Parameters: `anchorQty`, `anchorPrice`, `lowQtyFloor`, `lowQtyMultiplier`, `steepness`, `rounding`

### Output
Source: `app/modules/pricing/services/generateSaleTiers.server.ts`.

- Generates **SalePriceRange** rows (product-level), sets provenance fields.
- Deletes only rows previously generated by the same spec (`generatedBySpecId`).
- Idempotent via deterministic hash (`generatedHash`).

Notes:
- COST generation is supported at the schema level (PricingSpec.target includes `COST`), but this repo currently contains only sale tier generation.

## 5) CMT/service workflow & guardrails

### Category/subcategory guardrails
Source: `app/modules/product/services/productDetailActions.server.ts` (intent `bom.createCmt`).

- CMT product is created with parent `categoryId` and optional `subCategoryId` (defaults to parent).
- Ensures parent is `Finished` and has a category.
- Prevents multiple CMT lines on a BOM.

### “Create CMT from BOM” helper
Source: `app/modules/product/components/CreateCmtFromBomHelper.tsx`.

- UI collects `PricingSpec` and `anchorPrice`.
- Posts intent `bom.createCmt` and shows immediate confirmation.
- Includes copy warning that it bypasses staged edits.

## 6) Snapshot behavior & auditability

### Existing snapshot-like fields
Source: `prisma/schema.prisma` (models `Costing`, `InvoiceLine`).

- `Costing`: `costPricePerItem`, `salePricePerItem`, `manualSalePrice`, `manualMargin`, `salePriceGroupId`
- `InvoiceLine`: `priceCost`, `priceSell`, `taxRateCopy`, `invoicedTotalManual`

These fields provide the storage locations for pricing snapshots and overrides in downstream flows.

### Provenance for generated tiers
Source: `prisma/schema.prisma`, `app/modules/pricing/services/generateSaleTiers.server.ts`.

- `generatedBySpecId`, `generatedAt`, `generatedHash` stored on generated ranges.
- `OperationLog` entry emitted on CMT creation from BOM.
  - Evidence: `app/modules/product/services/productDetailActions.server.ts` (action `CMT_CREATED_FROM_BOM`).

**Missing in repo:** explicit “PO finalize → costing snapshot → invoice snapshot” pipeline code could not be located in this pass. If it exists elsewhere, add citations to this section.

## 7) Migration plan

1) **Keep legacy tiers valid.**
   - Existing `ProductCostRange`/`SalePriceRange` rows remain canonical.
2) **Introduce PricingSpecs gradually.**
   - Start with CMT/service products and BOM-driven creation.
3) **Specs as authoring tools only.**
   - Generated tiers remain canonical and resolvable without spec access.
4) **Future optional:** vendor invoice capture for outside-service POs.
   - No evidence in repo yet; track as a follow-on initiative.

---

## Definition of Done
- [ ] `docs/architecture/pricing.md` checked in with evidence citations.
- [ ] Pricing resolution precedence matches `pricingService.server.ts`.
- [ ] PricingSpec generation documented with curve families and provenance.
- [ ] CMT workflow includes guardrails and OperationLog event.
- [ ] Snapshot storage locations documented; missing pipeline noted.
