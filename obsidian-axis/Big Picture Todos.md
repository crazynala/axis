
## 2) Domain-specific product metadata

### A. Don’t add columns forever; add an extensible metadata layer

You need:

- a few **first-class fields** that drive core logic (tracking flags, templateId, etc.)
    
- plus an extensible metadata system for the rest
    

A pragmatic model:

- `ProductAttributeDefinition` (key, label, dataType, appliesToTypes/categories, isRequired, validation, maybe “drivesLogic”)
    
- `ProductAttributeValue` (productId, definitionId, valueString/valueNumber/valueJson)
    
- optionally `CategoryAttributePreset` for defaults
    

Then you can add:

- Fabric composition (and maybe country of origin)
    
- Button size (ligne/mm) + material
    
- Care-label code (derived from composition, but allow override)
    
- Weight / gsm for fabric
    
- Width for fabric
    
- Color family / pattern type to help search
    

### B. Add search affordances from metadata, not just storage

Your original pain was “people can’t find products.” Metadata only helps if it’s searchable:

- Make metadata fields “filterable” when definitions are marked filterable
    
- In product list search, include key metadata tokens in the index (composition, size, etc.)
    

### C. Minimal “critical set” to start for UAT

I’d start with:

- Fabric: `composition`, `width_cm`, `weight_gsm` (optional), `careLabelProfile` (or derived)
    
- Buttons: `size_ligne` and `material`
    
- Labels/Packaging: `dimensions` or `format`, optional `material`
    

---

## 3) Creating / managing CMT products

You’re already close. The missing piece is making CMT creation feel like _choosing a pricing recipe_, not building a bespoke SKU every time.

### A. Split “pricing definition” from “product instance”

Right now the “Group” string is doing too much. Normalize it.

Recommended objects:

- **SalePriceGroup** (the curve): `code`, `label`, `baseMoq`, `unit`, `notes`
    
- **SalePriceTier**: `salePriceGroupId`, `quantity`, `price`
    
- **CmtPricingProfile** (the “recipe”):
    
    - productType (Shirt/Jacket/etc)
        
    - complexity level (Basic/Complex/Very Complex)
        
    - baseGroup (or group code)
        
    - optional defaults (MOQs, rounding, etc.)
        

Then a **customer-specific CMT product** becomes:

- `Product(type=CMT, customerId=...)` with `cmtProfileId` + optional customer multiplier or an override multiplier at the customer level (which you already have).
    

### B. Improve the authoring UX: “CMT Builder”

In the Product create drawer:

- choose template: `CMT_SHIRT`
    
- choose complexity: Basic / Complex / etc.
    
- choose MOQ profile (50 / 100) if relevant
    
- system suggests the matching SalePriceGroup
    
- one-click: “Create missing price group from baseline” (clones tiers and applies multiplier)
    

This makes “new product / new complexity” less painful.

### C. Keep multiplier logic explicit and stable

You have: multiplier = 21/14. Keep it as:

- `Company.cmtMultiplier` (Decimal, default 1.0)
    
- All computed prices = tierPrice * multiplier
    
- Store computed results only when PO is FINAL (or in locked snapshots)
    

### D. UAT checks for CMT

- Create a new finished product for customer X → add BOM line “CMT Shirt Basic” quickly
    
- If customer has multiplier, costings show adjusted unit prices
    
- If PO is FINAL, later changes to group tiers/multipliers do not change historical PO pricing
    

---

## 4) SKU creation

### A. Treat SKU generation as a _service_ + a _policy_

You already have `SkuSeriesCounter` and template rules. The key is to make it:

- deterministic
    
- explainable in UI
    
- safe under concurrency (retry on uniqueness conflict)
    
- optionally “Auto” vs “Manual”
    

### B. Where “busy work” disappears

For nuisance items (labels, buttons, generic trims, CMT):

- user chooses template
    
- Axis generates SKU immediately
    
- user can still override, but default “Auto on” covers 90%
    

### C. SKU inputs should show “why this SKU”

In the product drawer:

- “Auto SKU: ON”
    
- preview: `CMT-STOCKMFG-SHIRT-023` (whatever your rule)
    
- show tokens that fed it: customerCode, categoryCode, stepType, seriesKey
    
- if missing codes, show a warning chip: “Company code missing → SKU will omit vendor/customer token”
    

### D. UAT checks for SKUs

- Two users create products simultaneously in same series → no collisions (retry)
    
- Changing template/type regenerates SKU only if Auto is on
    
- Manual SKU stays untouched and uniqueness errors are clear