
### 1) Products stay the backbone

A BOM is still a list of **Products** (`ProductLine.parentId → childId`). A finished product’s BOM might include:

- a CMT product
    
- wash/embroidery/dye service products
    
- fabrics/trims/etc
    

This preserves “everything is a Product” (where-used, search, extensibility).

### 2) Tier storage stays where it is today

Axis already supports tiered pricing via range tables, and we keep them as canonical:

- **Tiered COST** (vendor/mill pricing): `ProductCostRange`
    
    - linked either to a specific `productId` or a `costGroupId`
        
- **Tiered SELL** (customer-facing schedules): `SalePriceRange`
    
    - linked either to a specific `productId` or a `saleGroupId`
        

### 3) “Pricing model type” is an authoring/management layer, not a runtime replacement

We introduce a light “pricing model type” concept on **Product**, mainly for CMT/services:

- `Product.pricingSpecId` (optional) → points to a `PricingSpec`
    
- (Optional/derived) `Product.pricingMode`:
    
    - FIXED (no tiers; uses `costPrice` / `manualSalePrice`)
        
    - TIERED_COST (has `ProductCostRange`)
        
    - TIERED_SELL (has `SalePriceRange`)
        
    - GENERATED (has `pricingSpecId` and generated tiers)
        

**Important:** Resolution for costing/invoicing still uses **stored tiers** (`SalePriceRange` / `ProductCostRange`). The spec exists to _generate/maintain_ those tiers so you stop spreadsheet-importing boilerplate for CMT/services.

### 4) PricingSpec = a reusable tier generator recipe

A `PricingSpec` defines:

- target: `SELL` vs `COST`
    
- curve family / template (a small set): e.g.
    
    - `CMT_MOQ_50`
        
    - `CMT_MOQ_100`
        
    - `OUTSIDE_ASYMPTOTIC_LOGISTICS` (wash/dye/embroidery style)
        
- default breakpoints (your standard qty steps)
    
- params JSON (anchorQty, lowQtyMultiplier, logistics fee, etc.)
    

Generation writes rows into:

- `SalePriceRange` (for SELL specs)
    
- `ProductCostRange` (for COST specs)  
    and tags them with provenance:
    
- `generatedBySpecId`, `generatedAt`, `generatedHash`
    

### 5) Margin overrides remain exactly as-is

For **cost-tiered items** (fabric):

- resolve unit cost from tiers
    
- compute sell from margin stack:
    
    - global/default margin
        
    - `VendorCustomerPricing.marginOverride` (customer+vendor)
        
    - product overrides (`manualMargin`, `manualSalePrice`)
        

For **sell-tiered items** (CMT/services):

- resolve sell directly from `SalePriceRange`
    
- margin logic is not required (though you can add internal cost modeling later)
    

### 6) CMT and services become easy and correct

- CMT products have `type = CMT`, and category mapping can be enforced:
    
    - `CMT.categoryId` must match the Finished product category
        
    - subcategory can represent “semantic variant” or “complexity bucket”
        
- The “Create CMT from BOM” helper:
    
    - chooses a spec (MOQ 50/100)
        
    - enters “anchor price at MOQ”
        
    - generates tiers into `SalePriceRange`
        
    - adds the new CMT product as a BOM line