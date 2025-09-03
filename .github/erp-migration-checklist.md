# ERP Migration Checklist

_Last updated: 2025-09-03_

## Phase 1 Progress

## Schema Audit

- [x] Products model in Prisma schema
- [x] ProductLines model (1:M under Products)
- [x] Costings model (under Assembly)
- [x] Jobs model
- [x] Assembly model
- [x] Companies model
- [x] ValueLists model
- [x] Relationships between core entities
- [x] Assembly Activities model
- [ ] Schema review for edge cases (variants, pricing groups, batch/location logic)

## CRUD & Index/Detail Audit

- [x] Products: index/detail CRUD (React Hook Form, Mantine DataTable, filtering/sorting, save/discard)
- [x] Companies: index/detail CRUD
- [x] Jobs: index/detail CRUD
- [x] Assembly: index/detail CRUD
- [x] Costings: index/detail CRUD
- [x] Assembly Activities: index/add/delete
- [x] ProductLines: CRUD under Products detail
- [ ] Costings: CRUD under Assembly detail (needs review)
- [ ] Consistency review: all modules follow Products pattern

## Import Routines Audit

- [x] Import routines for Products (Excel via admin)
- [x] Import routines for ProductLines
- [x] Import routines for Costings
- [x] Import routines for Jobs, Assembly, Companies, ValueLists, Locations, Batches, ProductMovements, ProductMovementLines
- [x] Import routine for Assembly Activities
- [ ] Import routines: Variants
- [ ] Import routines: Supplier Pricing Groups
- [ ] Import routines: Pricing Group mapping to Products
- [ ] Import routines: Variant Set and ValueList mapping
- [ ] Import routines: Batch/Location reconciliation & idempotency (dedupe/upsert)
- [ ] Import routines: Product type canonicalization
- [ ] Import routines: Excel date/time parsing normalization across all modes
- [ ] Import routines: Dry-run/preview improvements (field mapping and validation report)
- Jobs > Assembly (m) > Costings (m)
- Assembly Activities are under Jobs > Assembly
- All modules should follow Products pattern (index/detail, CRUD, filtering/sorting, save/discard)
- Import routines must map DDR/sample data as-is
