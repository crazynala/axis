<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

- [x] Clarify Project Requirements: Migrating ERP React/Vite/Express/Prisma/Postgres codebase to Remix + React 18.
- [x] Scaffold the Project
- [x] Customize the Project
- [x] Install Required Extensions
- [x] Compile the Project
- [x] Create and Run Task
- [x] Launch the Project
- [x] Ensure Documentation is Complete

## Migration Plan

- Scaffold Remix app with React 18
- Integrate Prisma/Postgres
- Move ERP modules (Products, Admin, etc.) to Remix routes
- Adapt Excel import and backend logic to Remix loaders/actions
- Update README and copilot-instructions.md

### Active Migration Map

- [x] contacts -> app/routes/contacts.tsx (loader/action wiring)
- [x] companies -> app/routes/companies.tsx
- [x] products -> app/routes/products.tsx
- [x] costings -> app/routes/costings.tsx
- [x] jobs -> app/routes/jobs.tsx
- [x] assembly -> app/routes/assembly.tsx
- [x] assembly-activities -> app/routes/assembly-activities.tsx
- [x] admin -> app/routes/admin.tsx

## Find Architecture Pattern (Summary)

The codebase uses a unified find system:

- Global hotkey invokes a registered per-route callback (FindContext + FindManagers) instead of legacy global state.
- Shared DetailForm components (JobDetailForm, ProductDetailForm) drive both edit & find rendering using FieldConfig arrays.
- FieldConfig includes findOp metadata to translate form values into Prisma where clauses.
- Simple mode: individual query params (e.g., sku=, type=, costPriceMin/Max) build a single request where.
- Multi-request mode (engine implemented in `app/find/multiFind.ts`): stack of requests with omit support encoded as base64 JSON in `findReqs`.
  - AND within a request, OR across non-omit requests, subtract OR of omit requests.
- Saved views will persist both simple params and advanced `findReqs` blob.

See `docs/find-pattern.md` for the authoritative specification and extension guidelines.

## Virtualized Tables Rollout

- All index tables now use `app/components/VirtualizedNavDataTable.tsx` with spacer-row virtualization and staged hydration via `useHybridWindow`.
- Hydration endpoints accept repeated `ids` and comma-separated lists and always return JSON in the requested order.
- Legacy table components `NavDataTable` and `RefactoredNavDataTable` were removed to eliminate inline style injection that caused SSR hydration mismatches. If you see missing imports, migrate to `VirtualizedNavDataTable`.

## Modules structure (2025-09)

- Domain code (components, formConfigs, services, hooks) now lives under `app/modules/<domain>/...`.
- Keep only route files under `app/routes/`; import from modules using the `~` alias (e.g., `~/modules/product/services/...`).
- Temporary shims under `app/services/*` may re-export from modules to avoid breaking widespread imports. Prefer updating imports to the modules path when modifying code.
- Do not move files back out of `app/modules`. When adding new domain logic, place it under the appropriate module.
