# Product Detail Route Parity Checklist

Refactor parity contract for `app/modules/product/routes/products.$id._index.tsx`.

## Loader

### Error/redirect behavior
- Invalid product id → throws `Response("Invalid product id", { status: 400 })`
- Missing product record → redirects to `/products`

### Loader JSON shape (treat as public API)
- `product`
- `stockByLocation`
- `stockByBatch`
- `productChoices`
- `movements`
- `movementHeaders`
- `locationNameById`
- `salePriceGroups`
- `usedInProducts`
- `costingAssemblies`
- `userLevel`
- `canDebug`

Notes:
- `shipmentLines` are queried in the loader but not returned in the JSON payload.

## Action

### Supported content types
- Supports both `multipart/form-data` and `application/json` (`jsonBody._intent`).

### `_intent` strings (must be preserved)
- `movement.lookupShipment`
- `movement.delete`
- `create` (and POST to `/products/new`)
- `find`
- `update`
- `price.preview`
- `stock.refresh`
- `product.tags.replace`
- `product.addComponent`
- `product.duplicate`
- `batch.editMeta`
- `delete`
- `inventory.amend.batch`
- `inventory.amend.product`
- `inventory.transfer.batch`
- `bom.batch`
- default fallthrough → redirect to `/products/:id`

