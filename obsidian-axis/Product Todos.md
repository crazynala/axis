- [x] Must be able to view 0 qty batches
- [x] Filter batch by location, is current
- [x] Must be able to select cost group
- [x] Amend All doesn't present any batches
- [x] Amend batch creates movement with wrong type, no In / Out location
### Layout
- [ ] Make Stock Tracking toggle fit form layout better

### Sheet / Batch
- [x] Rework and harden "tags"
- [x] Move batch "Amend" and "Transfer" to a hamburger menu
- [ ] Batch product update always returns "Updated: 0" even on success
- [x] Batch product update only updating first row
- [x] Sheet view layout not consistent; some pages missing Exit button

### Pricing Calcs
- [ ] When there is a Sell Price set, it's not calculating the margin correctly
- [ ] Cost price must reflect cost tiers / preview widget
- [ ] Sell price override displaying when override is empty, at least when arrow navigating records
### Uncategorized
- [x] Amend All batch codes/locations don't display
- [x] Create New Batch has Name field, not Code
- [x] Calculated margin doesn't sho [x] When cost group is set, cost price must not be editable
- [x] User must confirm when deleting product
- [x] User must be able to edit batches (eg batch codes)
- [ ] Batches showing Received: null
	- [ ] Do we have Received data from legacy ERP?
	- [ ] We should track starting qty (received qty)
- [x] Create New Batches in Amend Product Stock modal needs to let user select a location, rather than type in an id
- [x] Product search by name needs to tokenize query
- [x] Purchase tax not showing for products with a Cost Group
- [ ] Add default tax code to Product Type

### Stock Management
- [ ] Stock transfer modal is a mess

### New Product Flow
- First ask product type:
	- Fabric
		- Ask: Vender, Name, Description, SKU, Cost
		- Auto-set: Category, Stock Tracking, Purchase Tax
	- Trim
		- Same as Fabric
	- Service
		- Ask: SKU, Name, Description
		- Auto-set: Category, Stock Tracking, Purchase Tax (none)
	- Finished
		- Ask: SKU, Name, Description, Customer, Variant Set
	- CMT