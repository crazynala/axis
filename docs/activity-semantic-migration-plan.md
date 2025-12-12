# Activity semantics migration – remaining steps (snapshot)

## Database
- [ ] Apply migration `20251122090000_drop_activitytype_column` to all environments; run `npx prisma generate` after apply.
- [ ] Verify no DB consumers still rely on `activityType` (views/materialized views, ad-hoc SQL, ETL jobs).

## Application code
- [ ] Confirm no remaining `activityType` field references outside legacy migration files; prefer `stage` + `action`.
- [ ] End-to-end sanity checks: create/edit cut/make/pack/defect; confirm `action` = `RECORDED` for cut/make/pack and defects persist correctly.
- [ ] Production ledger/integrity dashboards: ensure filters/summaries use `stage`/`action` (not legacy strings).
- [ ] Derived status engine for external steps: helpers that compute expected steps from `costings.externalStepType`, status from SENT_OUT/RECEIVED_IN, and implicit completion when MAKE exists. Add unit tests.
- [ ] Production dashboard `/production/dashboard`: tabs At Risk / Out at Vendor / Needs Action using the derived status engine; row actions to create SENT_OUT/RECEIVED_IN.
- [ ] UI debt: remove remaining temporary debug logs (factory debug, etc.).
- [ ] UI debt: verify primary costing icon flow reads from RHF state everywhere (AssemblyCostingsTable/AssembliesEditor) and shows filled icon without a save cycle.

## Import/export
- [ ] Imports: `importAssemblyActivities` now writes structured fields; validate a sample import round-trip.
- [ ] Remove/ignore any upstream data feeds still sending legacy `activityType`; enforce structured fields on ingest.

## Cleanup/monitoring
- [ ] Remove or disable the now-no-op `scripts/backfill-assembly-actions.ts` once all environments are migrated.
- [ ] Drop legacy documentation that refers to `activityType`; keep stage/action terminology.
- [ ] Watch logs for Prisma errors referencing `activityType` after deploy; fix any missed queries promptly.
