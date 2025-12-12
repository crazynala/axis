# Defect Tracking Rollout Checklist

## Schema & Seeds
- [ ] Add enums `AssemblyStage`, `ActivityKind`, `DefectDisposition`, `LocationType`
- [ ] Extend `ValueListType` with `DefectReason`
- [ ] Add structured fields to `AssemblyActivity` (stage, kind, defectReasonId, defectDisposition, relation)
- [ ] Migrate legacy activities (TRASH_* → defect, CUT/MAKE/PACK → normal)
- [ ] Convert `Location.type` to `LocationType` enum
- [ ] Seed `DefectReason` ValueList entries

## Backend Logic
- [ ] Helper to compute usable/attempts per stage (normal + rework – finalized defects)
- [ ] Defect create/update flow to set structured fields + friendly label (stage/action)
- [ ] Auto ProductMovement when disposition transitions from `none` → `scrap/offSpec/sample`
- [ ] Loader wiring to expose defect reasons/options

## UI / UX
- [ ] Collapsed assembly view (Ordered/Cut/Make/Pack or Kept)
- [ ] Expanded “factory” view with attempts/defects breakdown and summary
- [ ] Defect entry modal/form (stage, qty, breakdown, reason, disposition, notes)
- [ ] Keep assemblies: show Kept label mapped to pack stage

## Locations Module
- [ ] `/locations` list with filters (type, company, active)
- [ ] `/locations/:id` detail with tabs: Stock, Boxes, Movements
- [ ] Stock computation via movement lines in/out

## Testing / Verification
- [ ] Validate migrations on sample data
- [ ] Smoke UI flows (collapsed/expanded, defect entry)
- [ ] Confirm ProductMovement creation for finalized defects
