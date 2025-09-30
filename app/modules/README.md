# Modules directory

Organize non-route code by domain (company, product, job, invoice, expense, shipment, purchaseOrder, admin) under `app/modules`.

Goals:

- Keep Remix file-based routing intact under `app/routes/`
- Make domain code discoverable and reusable
- Avoid long relative imports between routes

Suggested structure:

- modules/
  - admin/
  - company/
  - expense/
  - invoice/
  - job/
  - product/
    - components/
    - formConfigs/
    - services/
    - hooks/ (optional)
    - server/ (optional – server-only utilities)
    - client/ (optional – client-only helpers)
  - purchaseOrder/
  - shipment/

Conventions:

- Components: View-only; do not fetch data directly. Accept props from routes.
- Services: Keep as small orchestrators over pure functions; fetch minimal inputs (server side) and call pure domain logic.
- FormConfigs: FieldConfig arrays and helpers used in edit/find forms.
- Hooks: UI behavior or findify helpers specific to a domain. Keep server-free.
- Server folder: Utilities that must not be imported into client bundles. Only import from loaders/actions or other server files.

Import paths:

- Use `~/modules/<domain>/...` from routes and components. The `~` alias maps to `app/` (see tsconfig).
- During migration we may keep re-export shims under `app/services/*`. Prefer updating imports to the new module paths when you touch a file.

Example: Product pricing

- Pure: `~/modules/product/calc/calcPrice` (isomorphic)
- Service: `~/modules/product/services/ProductPricingService`
- Shim: `~/services/ProductPricingService` re-exports the above

Do / Don’t:

- Do keep cross-domain reuse behind small pure helpers (e.g., calculators) under `app/domain/*`.
- Don’t reach into other modules’ internals; import their public services/helpers.
- Do keep loaders/actions responsible for DB I/O; services should not embed Remix request/response objects.

Testing:

- Prefer unit tests for pure domain logic (e.g., calcPrice).
- Keep service tests minimal and focused on data-shape orchestration.

Migration notes:

- Move files incrementally; leave a re-export shim at the old path for short-lived compatibility.
- Avoid broad refactors that touch many imports at once unless necessary.
