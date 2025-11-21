# Copilot Baseline Instructions

These notes capture the working conventions you should assume when assisting on this repo. Expand or override sections as the project evolves.

## Core Objectives

- Favor incremental refactors that respect existing domain flows (products, jobs, assemblies, admin).
- Keep documentation and developer ergonomics up to date whenever architectural choices change.

## Architectural Defaults

- **Framework:** Remix routes + loaders/actions. Prefer server-side loaders for data reads and actions for mutations; avoid client-only fetches unless streaming/polling is required.
- **Runtime:** React 18 with concurrent-ready hooks. Keep components suspense-friendly and hydration-safe.
- **Data:** Prisma + Postgres via the established services in `app/modules/*/services`. Do not bypass service layers unless explicitly requested.

## Forms & Mutations

- Use **react-hook-form (RHF)** for every form, including modals and inline editors. Store field values in RHF state, never ad-hoc `useState` mirrors.
- Normalize date/number handling in controller `onChange` helpers so serialization to Remix actions stays predictable.
- When editing existing records, seed defaults via `reset` with data from loaders; keep derived state in `useMemo`/`watch` instead of duplicating objects.

## UI Components & Tables

- Base UI on Mantine components. Reuse shared components in `app/components` or `app/modules/*/components` instead of duplicating markup.
- Index tables must use `VirtualizedNavDataTable` (see `app/components/VirtualizedNavDataTable.tsx`) to avoid hydration mismatches.
- Detail/edit forms rely on shared `DetailForm` instances driven by `FieldConfig` arrays; extend configs rather than hard-coding new inputs.

## Find & Filtering Pattern

- Follow the unified find system documented in `docs/find-pattern.md`.
  - Route-level `FindManager` hooks register callbacks with `FindContext`.
  - `FieldConfig.findOp` metadata defines how inputs become Prisma `where` clauses.
  - Multi-request finds (`findReqs`) encode OR/omit stacks via `app/find/multiFind.ts` helpers.

## Domain Modules Layout

- Domain code lives in `app/modules/<domain>/[components|services|hooks|formConfigs|...]`.
- Temporary shims under `app/services/*` re-export module code; when touching those areas, prefer updating imports to the module path.
- Never move new logic back out of `app/modules`.

## Data Imports & PDFs

- Import flows (Excel, sample data) live under `app/importers` and `scripts/`. Mirror existing validation helpers when adding new import specs.
- PDF generation utilities sit under `app/pdf` and expect server-side execution; wrap any new exports with the current logging/error conventions.

## Testing & Tooling

- Run `npm run build` (or the defined VS Code task) after major changes to ensure Remix compiles.
- Use Prisma generators/migrations through the provided npm scripts; never run raw SQL migrations unless coordinated.
- Keep lint/type errors at zero—CI assumes type safety.

## Documentation & References

- Primary references: `docs/find-pattern.md`, `docs/import-spec.md`, `docs/prisma-spec.md`, `docs/route-spec.md`, and `docs/TODO-2025-09-11.md`.
- Update this baseline file and `.github/copilot-instructions.md` when conventions shift.
