# Activity semantics migration – remaining steps

## 0. Guiding rules

- [ ] Axis is driven by (a) AssemblyActivity for Cut/Sew/Finish/external-step events/defects and (b) BoxLine for packed quantity; no parallel planning tables. We reimport FileMaker data after schema changes instead of backfilling Postgres.
- [ ] Restore any tasks dropped from the original implementation snapshot so feature parity is preserved.
- [ ] No new required fields on legacy write paths; legacy imports keep working.
- [ ] All ETAs and lead times are derived from data (Costing → Product → Company)
  - Lead times are derived (Costing→Product→Company).
  - PO line ETA is operational truth and may be manually set (with “fill from lead time” as a helper).
- [ ] Lead times resolve hierarchically: `Costing.leadTimeDays` overrides `Product.leadTimeDays`, which overrides `Company.defaultLeadTimeDays`.
- [ ] Legacy `activityType` references stay removed; `stage` + `action` + `externalStepType` are authoritative.
- [ ] Any legacy Postgres data can be dropped/reseeded; prefer clean schema migrations over complicated in-DB backfills.
- [ ] Packing truth comes from `BoxLine` rows; `stage=pack/qc` events exist for history/defects only.
- [ ] Interactive forms wire into the RHF + `SaveCancelHeader` pattern (with dirty tracking) unless impossible; new fields must register with RHF so change detection/saves stay consistent.
- [ ] Risk signals must be surfaced at the row level when they change operator behavior (drawer is for detail, not discovery).

## 1. Database (schema + migrations)

- [x] Add nullable `defaultLeadTimeDays Int?` to `Company`; regenerate Prisma client.
  - Completed via migration `20251216120000_lead_time_overrides`; surfaced in company forms for vendor defaults.
- [x] Add nullable `leadTimeDays Int?` to `Product`; use for fabric/trim/service supply overrides.
  - Covered by the same migration; Product detail form now binds to the Prisma field.
- [ ] Finalize `Costing` shape (`externalStepType`, nullable `leadTimeDays`) and document override semantics.
- [x] Add nullable `etaDate DateTime?` and `etaDateConfirmed Boolean? @default(false)` to `PurchaseOrderLine`; PO-level ETA derives from earliest populated line ETA.
  - Added via migration `20251216124000_po_line_eta_fields` plus Prisma client regen.
- [x] Confirm `AssemblyActivity` has authoritative `stage`, `action`, `externalStepType`, `kind`, and `vendorCompanyId`; `activityType` is fully dropped everywhere.
- [ ] Verify no DB consumers still rely on `activityType` (views/materialized views/ad-hoc SQL/ETL).
- [x] Update `AssemblyStage` enum to `order/cut/sew/finish/pack/qc/other` (removing `make`, adding `sew` + `finish`); accept Prisma enum reset if needed since data will be reimported.
  - Covered by migration `20251216133000_add_sew_finish_stage` and regenerated Prisma client.
- [ ] Ship Prisma migrations for new columns + stage enum change (enum change may require DB reset; we reimport).
- [ ] Smoke-test legacy imports after the migration to ensure nullable defaults keep them valid.
- [ ] Document that importer re-run is the “data migration”; do not attempt in-DB backfills when enums/columns shift.
- [x] Add global material coverage tolerance settings (defaults) and nullable assembly-level overrides:
  - [x] Store tolerance defaults in `Setting.materialCoverageTolerance` JSON (migrated from `AppSetting` via `20260105120000_remove_app_setting`) with seeded defaults surfaced in the admin UI.
  - [x] Add Assembly.materialCoverageTolerancePct Decimal? and Assembly.materialCoverageToleranceAbs Decimal? (nullable override; when set, supersedes global) – covered by `20251220100000_material_coverage_tolerance`.
  - [x] Keep nullable so legacy imports/writes remain valid; no backfills required.

## 2. Application code – core logic

- [x] Implement `resolveLeadTimeDays({ costing, product, company })` that enforces Costing → Product → Company fallback; return `null` when nothing is set.
  - Helper lives in `app/utils/leadTime.ts` and now returns both the numeric value and its source label for downstream consumers.
- [x] Reuse the resolver for external step ETA computation, PO ETA suggestions, and dashboard “late” determinations.
  - PO line “Fill ETA” and the new external-step engine both funnel through `resolveLeadTimeDetail`; dashboard hooks will piggyback on the same data source once we wire tab logic.
- [x] Update downstream code to handle new stages sew and finish (and removal of make).
  - Assembly/job services, importer-derived rollups, dashboard metrics, ledger views, and factory modals now expose Cut/Sew/Finish semantics instead of legacy Make.
- [x] Extend the derived external-step engine:
  - [x] Determine expected steps from `Costing.externalStepType`.
  - [x] Track status transitions `SENT_OUT → RECEIVED_IN → DONE`, `SENT_OUT`-only flows (`IN_PROGRESS`), and implicit done when FINISH exists without steps.
  - [x] Surface `sentDate`, `receivedDate`, inferred windows, optional `qtyOut`/`qtyIn`, and `defectQty` for `kind=DEFECT`.
  - [x] Attach ETA via the lead-time resolver; `isLate` only when ETA exists, the step was sent out, nothing has been received, and today is past the ETA (`IMPLICIT_DONE` is never late).
  - [x] Unit-test lead-time precedence (costing override, product override, company fallback, and null → no ETA + never late).
  - [x] Update inferred windows so external steps live between `SEW` and `FINISH` whenever data is available.
  - Implemented via `app/modules/job/services/externalSteps.server.ts` with loader wiring so assembly detail pages now receive per-assembly derived data.
- [x] Update dashboard/business logic to consume the derived engine for hold/late signals.
- [x] Ensure pack/qc defects affect readiness metrics and downstream dashboards by combining finish rollups, `BoxLine` packed quantities, and defect adjustments consistently.
- [x] Flesh out the sew availability calculator (`sewnAvailableQty`) for send-out flows, including low-confidence handling when sew is inferred from finish.
- [x] If user clicks Send Out and Sew is missing:
  - [x] allow continuing
  - [x] mark the external-step record as `lowConfidence=true` in the derived model (no DB field needed)
  - [x] optionally prompt: “Record Sew now for the same qty?” (one-click creates a Sew RECORDED activity)
- [x] For SENT_OUT / RECEIVED_IN activities:
  - [x] require externalStepType and strongly encourage vendorCompanyId (UI-required; DB still nullable)
- [x] Standard rollups – define once and reuse everywhere:
  - [ ] `cutGoodQty = Σ AssemblyActivity(stage=cut, kind=normal, action=RECORDED)` (minus adjustments if supported)
  - [ ] `sewGoodQty = Σ AssemblyActivity(stage=sew, kind=normal, action=RECORDED)`
  - [ ] `finishGoodQty = Σ AssemblyActivity(stage=finish, kind=normal, action=RECORDED)`
  - [ ] packedQty = Σ BoxLine.quantity WHERE assemblyId=? AND packingOnly != true
  - [ ] `packDefectQty = Σ AssemblyActivity(stage ∈ {pack,qc}, kind=defect, action=RECORDED)`
  - [ ] `readyToPackQty = max(finishGoodQty - packedQty, 0)`
  - [ ] Do not derive “packed” from AssemblyActivity(stage=pack); packed state is computed from packedQty (BoxLine). stage=pack is defect/history only.
- [x] Define isPoHeld as: “Assembly/job is PO-held if there exists at least one required material/service PO line (based on costings tied to products or explicit links) that is not received and has ETA after target/needed date.”
- [x] If “required PO line” mappings are still WIP, ship an MVP definition: PO hold when any linked PO line has `qtyReceived < qtyOrdered` and (`etaDate` missing or past due).
- [x] Implement resolveCoverageTolerance({ assembly, productType }):
  - [x] Returns { abs, pct, source } using Assembly override when present, else global defaults (now powered by `app/modules/materials/services/coverageTolerance.server.ts` reading the shared `Setting` JSON).
- [x] Update computeCoverageState to compute both uncoveredQty and uncoveredQtyAfterTolerance:
  - [x] toleranceQty = max(toleranceAbs, requiredQty \* tolerancePct)
  - [x] effectiveUncovered = max(uncoveredQty - toleranceQty, 0)
  - [x] Define status tiers:
    - [x] PO_HOLD when effectiveUncovered > 0 (and not otherwise blocked by ETA rules)
    - [x] POTENTIAL_UNDERCUT when uncoveredQty > 0 but effectiveUncovered == 0 (subtle warning only)
- [x] Add acceptGap action helper:
  - [x] Clicking “Accept gap” sets the Assembly override tolerance so toleranceQty >= uncoveredQty for that material row (store as materialCoverageToleranceAbs bump or compute a new abs value).
  - [x] Persist audit note in the operation log (who/when, prior vs new tolerance) so accepted undercuts are traceable without mutating costings.

## 3. UI updates

- [x] **Purchase orders**: line editor gains inline ETA date picker, confirmed checkbox/badge, and “Fill ETA from lead time” action (Product → Company fallback). Show status badges (Received / Due soon ≤7 days / Late when ETA passed and not received); surface PO holds and risk flags.
  - Implemented ETA fields + confirmations on editable PO lines with derived status badges and auto-fill tied to product/vendor lead times; final view mirrors badges/read-only ETA for verification.
- [x] **Product editor**: add “Lead time (days)” under Supply/Production with tooltip “Overrides supplier default lead time”; highlight on fabrics/trims/services.
  - Field renders with a tooltip + “Supply-critical” badge when type ∈ {Fabric, Trim, Service}.
- [x] **Company editor**: add “Default lead time (days)” for vendor/supplier companies with tooltip “Used when product or costing has no override”.
  - Visible whenever `isSupplier` is checked and propagates through the detail and “New Company” forms.
- [x] **Assembly view – external steps strip**: show chips per expected step with status badge, ETA, late indicator, and drawer containing sent/received dates, vendor, qty out/in, defects, lead-time source label (“Costing/Product/Vendor default”), and “Add inferred dates” helper.
  - `ExternalStepsStrip` renders inside `AssembliesEditor` with status badges, ETA chips, low-confidence/late warnings, vendor info, and a drawer table; inference helper UI remains TODO.
  - [x] “Send to Embroidery/Wash/Dye” modal defaults qty from available sewn qty (when tracked), offers “Record Sew now” helper if missing, and allows continuing without data while flagging low-confidence inference.
- [x] 3.X. Box-only packing enforcement + readiness (milestone-ready)
  - [x] Packed qty is sourced from `BoxLine` only; pack-stage activities no longer drive totals.
  - [x] “Add to box” defaults qty to `readyToPackQty`; shows Finish/Already packed/Ready to pack metrics.
  - [x] Warn on qty > readyToPackQty and allow override with confirmation + reason note.
  - [x] Dashboard/assembly rollups use `readyToPackQty` from finish minus packed.
- [x] **Production Dashboard `/production/dashboard`**:
  - [x] Tab “At Risk”: columns for External ETA (nearest open step), PO Hold (Yes/No), PO ETA (earliest blocking line); default sort Late → PO Hold → Due soon → Target date.
  - [x] Tab “Out at Vendor”: show ETA source (Costing/Product/Company) so vendor fallback is visible.
  - [x] Tab “Needs Action”: “Next Action” logic now flags (a) expected external step with no `SENT_OUT` while CUT exists, (b) `SENT_OUT` past ETA (Follow up vendor), (c) PO line late (Resolve PO).
  - [x] Provide dashboard multi-select for batch `Send Out` / `Receive In`, plus a keyboard-first modal for those actions.
- [x] Dashboard risk chips: surface supply-integrity signals at row level
  - [x] In `/production/dashboard` (At Risk + Materials Short rows), allow multiple chips so coverage tier does not hide supply-integrity issues.
  - [x] If any linked PO line is OVER-RESERVED, show an OVER-RESERVED chip at row level.
  - [x] If any linked PO line covering required qty is ETA BLOCKED, show an ETA BLOCKED chip at row level.
  - [x] Chip priority order (highest → lowest) for row display/sorting: OVER-RESERVED → ETA BLOCKED → PO HOLD → DUE SOON → Within tolerance → Covered.
  - [x] Tooltips include the delta and PO line number (e.g., “Over-reserved by 10 on PO line #123”).
- [x] 3.Y. Legacy shipment support via imported Boxes (idempotent)
  - [x] Importer creates a “legacy box” per shipment and `BoxLine` rows per shipment line.
  - [x] Idempotent re-import via `Box.importKey` (`FM_SHIPMENT:{shipmentId}`) upsert + replace lines.
  - [x] UI badge: “Legacy box (imported)”.
- [ ] 3.Z. UAT box-only + legacy imports
  - [ ] Reimport twice: same shipment upserts to same box, no duplicates.
  - [ ] Packed qty derives from BoxLines; dashboards update after box changes.
  - [ ] Finish recorded → readyToPackQty > 0 → Add to box defaults correctly.
- [ ] Update all UI labels to present MAKE as “Finish” and align iconography (primary costing icon reflects RHF state without saving) across assembly/dashboard views.
  - Assembly detail/editor, pack modal, quantities cards, and production ledger now render “Finish”. Remaining modules still need an audit.
- [ ] Remove remaining temporary debug logs in the UI layer.
- [ ] Ensure pack/QC defect badges are visible anywhere readiness/risk is surfaced (assembly, dashboard, PO context).
- [ ] Assembly / Production “Quick Record”
  - [ ] Provide a single “Quick Record” row action (assembly list rows + assembly detail) with one-click buttons for Record Cut, Record Sew, Record Finish, and Record Defect (stage-select prefilled based on context). Record Pack can remain optional or hidden because packing truth is sourced from boxes, not AssemblyActivity.
  - [ ] Each opens a keyboard-first modal with:
    - [ ] default activityDate = now
    - [ ] qty default = “remaining to progress” (computed)
    - [ ] optional breakdown editor
    - [ ] minimal required fields only
- [x]Production Dashboard / Materials Short + At Risk drawers:
- [x]Render a subtle chip for POTENTIAL_UNDERCUT (no hard-hold styling; tooltip shows “Uncovered within tolerance” and the tolerance used).
- [x]Add row action “Accept gap” that auto-adjusts the assembly-level tolerance override (RHF + SaveCancelHeader compliant).
- [x]Add an assembly-level “Coverage tolerance” control (advanced section; default collapsed) showing global vs overridden values and a “Reset to global” action.

## X. Materials demand + reservations

- [x] Add `MaterialDemand` model (assemblyId, productId, costingId?, qtyRequired, uom, source, created/updated) with indexes on assembly/product and unique on assembly+product+costing.
- [x] Add `SupplyReservation` model (assemblyId, productId, purchaseOrderLineId?, inventoryBatchId?, qtyReserved, note, created/updated) with indexes on assembly/product/poLine/batch.
- [ ] Add nullable rollup helper fields on PO lines if needed (derivable; currently computed on the fly).
- [x] Implement `computeMaterialDemand` fallback from BOM/costings when no stored demand rows exist.
- [x] Implement `computeCoverageState`/`loadMaterialCoverage` to join demand + reservations, compute uncovered qty, blocking PO lines (missing ETA/past due/after target), and attach earliest ETA + blocking IDs.
- [x] Update PO hold logic to rely on coverage (held when uncovered > 0 or all PO reservations blocked) and surface structured reasons.
- [x] Production Dashboard: PO Hold chip opens drawer with material/reservation details; new “Materials Short / Needs PO Assignment” tab lists uncovered materials per assembly.
- [x] Eligibility guard: a costing contributes demand only when it is enabled, product exists and is stock-tracked, product type ∈ {Fabric, Trim, Packaging/raw}, qty > 0, and consumption stage is valid (Fabric → Cut; Trim → Sew/Finish).
- [x] Fabric demand uses remaining-to-cut (orderQty − cutGoodQty, min 0); fully-cut assemblies emit no new fabric demand. Shared material demand service added for reuse across dashboard/assembly detail.
- [x] Dashboard “Assign to PO” modal creates `SupplyReservation` rows for uncovered materials; PO lines are surfaced by explicit assembly/job links or matching productId.
- [x] Wire assembly detail material demand view to the shared material demand service to avoid drift.
- [x] Add PO line drawer view showing “Reserved for assemblies” with edit/remove; wire fast “Assign to PO” modal that defaults qty to uncovered and enforces remaining-unreserved guard.
- [x] X.Y. Coverage semantics for PO quantity (expected supply)
  - [x] Define PO line supply semantics: `quantity` is final expected (received + expected-to-receive), `quantityOrdered` is historical only.
  - [x] Coverage/reservations cap against `quantity` (fallback to `quantityOrdered` when expected is unset).
  - [x] Derived fields: reservedTotal, remainingExpected, unreceivedExpected (computed, not stored).
  - [x] Lateness/risk uses ETA when `qtyReceived < quantity`.
  - [x] Over-reservation detection (`reservedTotal > quantity`) with “OVER-RESERVED” chip in the reservation drawer and quick trim action.
- [x] X.Z. Coverage status tiers when supply is expected (ETA-driven)
  - [x] Distinguish PO coverage as “expected” (not yet received); ETA risk drives status.
  - [x] Define “blocked” when expected supply is late/unknown (eta missing/past/after target while unreceivedExpected > 0).
  - [x] PO_HOLD when effectiveUncovered > 0 OR all PO reservations covering required are blocked by ETA.
  - [x] DUE_SOON when covered but the earliest PO ETA is within 7 days of target (or within 7 days of today when no target).
  - [x] POTENTIAL_UNDERCUT remains purely about uncovered within tolerance (no ETA component).
- [x] X.AA. Demand-empty / FULLY_CUT edge states (keep history, no false holds)
  - [x] When demand is empty, do not show PO_HOLD; still render a coverage history section.
  - [x] Reservations show “SETTLED” when requiredQty == 0 (derived status; no DB change).
  - [x] Placeholder copy updated to: “No active material demand. Any linked reservations will appear below as history.”
- [x] X.AB. PO line quantity reductions (short-ship) handling
  - [x] When quantity drops below reservedTotal, mark line as OVER-RESERVED.
  - [x] Reservation drawer “Trim reservations to expected” (reduce newest first).
  - [x] “Settle reservation(s)” for assemblies with requiredQty == 0 (history-only; no active reserved total).
  - [x] Persist an operation log entry for trims/settles (who/when, prior vs new reserved totals).
  - [x] Warning banner in material coverage details when OVER-RESERVED or ETA BLOCKED is present.
  - [x] Banner includes one-click Trim action with preview (“Will trim X from newest reservations first”).
- [ ] X.AC. UAT coverage edge cases
  - [ ] Partial receipt / expected inbound: quantity=201, qtyReceived=59, ETA next week → no PO_HOLD but show DUE_SOON/LATE as appropriate.
  - [ ] FULLY_CUT with reservations: demand 0 → no PO_HOLD; reservations show SETTLED history.
  - [ ] Reduce PO quantity below reserved: line shows OVER-RESERVED; trim action reduces and remainingExpected updates.
- [ ] Import/export: accept MaterialDemand rows when present; leave reservations empty by default; include reservations in exports (optional).
- [ ] UAT: shortages across assemblies, overbooking guard, ETA-driven hold messaging, dashboard integration of reasons.
- [ ] Align PO-hold logic when demand is empty (e.g., FULLY_CUT assemblies): show PO lines and allow manual assignment even when uncovered=0, and avoid PO HOLD when coverage reports no demand.
- [ ] Add coverage/debug row in drawer even when demand is zero so PO linking is still possible (FULLY_CUT/manual overrides).
- [x] Apply tolerance when surfacing PO HOLD counts so not every assembly is flagged:
  - [x] PO HOLD count uses effectiveUncovered (post-tolerance), while the drawer still shows raw uncoveredQty + toleranceQty for transparency.
- [ ] UAT: tolerance + accept-gap behavior
  - [ ] Global tolerance causes small uncovered gaps (e.g. 5m on 185m) to show POTENTIAL_UNDERCUT instead of PO_HOLD.
  - [ ] Assembly override can tighten tolerance to 0 (undercut not allowed) and immediately escalates to PO_HOLD.
  - [ ] “Accept gap” bumps assembly tolerance and clears PO_HOLD → POTENTIAL_UNDERCUT (or clears entirely when desired), with audit trail.

## 4. Import / export

- [ ] Keep mapping of legacy activity strings to `stage`/`action`/`externalStepType`; allow missing lead times.
- [ ] Accept optional PO line ETAs; leave null when absent.
- [ ] Ensure exports mirror the derived semantics (no reintroduction of `activityType`).
- [ ] Validate sample import round-trip using the new schema/semantics and ensure no `activityType` reappears.
- [ ] Enforce structured ingest by ignoring/rejecting legacy `activityType` fields from upstream feeds.
- [ ] Update `importAssemblyActivities` mappings: MAKE→`finish`, support `SEW`, preserve legacy IDs on creates, and maintain `resetSequence` handling.
- [ ] Treat importer logic as authoritative migration layer; document reimport workflow for dev/prod.
- [ ] Importer ID preservation: after import, verify a known AssemblyActivity id from FileMaker exists in Postgres with the same id.

## 5. Cleanup / monitoring

- [ ] Remove remaining `activityType` references and the unused `scripts/backfill-assembly-actions.ts`.
- [ ] Add warning-level log if an expected external step has no lead time resolvable (so ops can backfill data).
- [ ] Update internal docs: “Activity semantics”, “External steps & ETAs”, “Why implicit steps exist”.
- [ ] Keep an eye on Prisma/runtime logs post-deploy for new column usage regressions.
- [ ] Audit production ledger/integrity dashboards to make sure they use the new `stage`/`action` semantics.
- [ ] Monitor post-deploy logs specifically for hints that `activityType` is still being referenced anywhere.

## 6. User acceptance test plan

- [ ] **Fabric PO ETA**: create product with `leadTimeDays=21`, create PO line, click “Fill ETA” → `line.etaDate = poDate + 21`; confirm confirmed flag toggles.
- [ ] **Override hierarchy**: company default 14, product 7, costing 4 → external step ETA resolves to 4 days everywhere (dashboard, assembly, PO suggestions).
- [ ] **Implicit embroidery**: cut + finish recorded, no embroidery events → status `IMPLICIT_DONE`, not late.
- [ ] **Late vendor**: send embroidery out, let ETA pass → dashboard shows Late + “Follow up vendor”; assembly chip red.
- [ ] **PO hold**: PO line ETA past target date → assembly shows PO HOLD, external step ETA suppressed/flagged as blocked.
- [ ] **Over-reserved visibility (row-level)**: set expectedQty < reservedTotal (e.g., expected 170, reserved 180) → At Risk row shows OVER-RESERVED chip; drawer banner shows “Over-reserved by 10” with Trim action; trimming clears the chip.
- [ ] **ETA blocked visibility (row-level)**: ensure a covering PO line has missing ETA while unreceivedExpected > 0 → At Risk row shows ETA BLOCKED chip; drawer banner calls out the line.
- [ ] **Cut/Finish/Pack/Defect sanity**: walk through create/edit flows for each activity end-to-end to confirm statuses, ETA derivations, and ledger writes.
- [ ] **Sample import round-trip**: import, edit, and export a sample to verify new schema survives back-and-forth without `activityType` regressions.
- [ ] **Send-out modal nudges**: verify sew-recording helper, low-confidence messaging, and qty defaults when sew is explicit vs inferred.
- [ ] **Send Out / Receive In (single)**: missing Sew warning allows continue, Record Sew now works, and chip shows low confidence when appropriate.
- [ ] **Batch Send Out**: select 5 rows → defaults qty, vendor required, creates activities, chips update.
- [ ] **Batch Receive In**: select vendor rows → defaults qty (qtyOut − qtyIn), creates activities, clears late flag.
- [ ] **Vendor missing**: verify UI blocks unless “Unknown vendor” explicitly chosen.
- [ ] **Pack/QC defects**: finish + pack defect should surface readiness badge and adjust dashboard rollups.
- [ ] **External steps inference**: cut + finish only still shows `IMPLICIT_DONE` external steps with no late state.

## 7. Prompt addendum for Codex

> Extend the implementation plan to cover Purchase Order UI ETA fields, Product Lead Time overrides, Company default lead times, Assembly external-step display (with ETA + lead-time source), and Production Dashboard enhancements. Implement hierarchical lead-time resolution (Costing → Product → Company). All ETA logic must be derived and nullable so legacy data remains valid without backfill.

## 8. Codex implementation brief

Goal: Implement Cut/Sew/Finish activity semantics, external-steps tracking, and lead-time-driven ETAs while sourcing packing truth from `BoxLine` data. Do not write DB backfills; importer re-runs against FileMaker provide the only data migration.

Canonical semantics:

- Assembly stages are `order/cut/sew/finish/pack/qc/other`. We retain `pack/qc` for defect logging, but “packed qty” comes solely from boxes, not stage=pack rows.
- `FINISH` is the critical gate backed by daily finishing reports; it implies sewing + required external steps + QC have passed. Packing may uncover new QC issues later.
- External steps (Embroidery/Wash/Dye) belong to finishing; expected steps derive from `Costing.externalStepType` and are collapsed per `ExternalStepType`.
  - Ops reminder: a costing must explicitly set its `externalStepType` (e.g. Washing) for the assembly UI to expect a vendor step; product type = Service or manually entering an ETA is not enough.

Quantities (reuse everywhere):

- `cutGoodQty`, `sewGoodQty`, `finishGoodQty` come from `AssemblyActivity` RECORDED rows for those stages.
- `packedQty = Σ BoxLine.quantity` for the assembly (exclude `packingOnly=true` rows when relevant).
- `readyToPackQty = max(finishGoodQty - packedQty, 0)`.
- No `readyToShipQty`; shipment readiness is derived from boxes + shipment assignment.

Sew availability for send-out:

- `sewnAvailableQty = (sewGoodQty > 0 ? sewGoodQty : finishGoodQty > 0 ? finishGoodQty : 0) - qtyAlreadySentOutNotReceived`.
- If Sew is missing but Finish exists, mark derived status `lowConfidence=true` (no DB field). Allow Send Out to continue and offer one-click “Record Sew now for same qty”.

External step activities (`AssemblyActivity`):

- `action ∈ {SENT_OUT, RECEIVED_IN}` with `externalStepType` required and `vendorCompanyId` enforced in UI.
- Support `qtyOut/qtyIn`.
- Derived statuses: `NOT_STARTED`, `IN_PROGRESS`, `DONE`, `IMPLICIT_DONE`, `LATE` (only when ETA exists and step was sent out). If Finish exists and there are no events, mark `IMPLICIT_DONE`.

Lead times + ETAs:

- Add nullable `Company.defaultLeadTimeDays`, `Product.leadTimeDays`, `PurchaseOrderLine.etaDate`, `PurchaseOrderLine.etaDateConfirmed @default(false)`.
- Implement `resolveLeadTimeDays` precedence Costing → Product → Company (returns `null` if none). Use for external-step ETA suggestions, “Fill ETA from lead time” on PO lines, and dashboard late logic.

UI requirements recap:

- Purchase orders: ETA date picker, confirmed toggle, “Fill ETA from lead time”, badges (Received / Due soon ≤7d / Late).
- Product editor: `leadTimeDays` override.
- Company editor: `defaultLeadTimeDays`.
- Assembly view: external-step chips collapsed by type showing status, ETA, vendor, late indicator; drawer shows sent/received dates, qty out/in, defects.
- Packing happens in Box UI: default qty = `readyToPackQty`, “Use finishing report qty” helper, show finish vs packed numbers, rely on user adjustments.
- Production dashboard: At Risk / Out at Vendor / Needs Action tabs, powered by derived engine, with row + batch Send Out/Receive In actions.

Importer requirements:

- Reimport FileMaker data rather than migrating rows in Postgres.
- Update `importAssemblyActivities`: map legacy `MAKE → finish`, support `SEW`, preserve incoming IDs on create, continue `resetSequence`.

Tests / acceptance:

- Validate rollups (`finishGoodQty`, `packedQty`, `readyToPackQty`) on sample assembly.
- Ensure external steps are expected from `Costing` and collapse by type.
- Confirm `IMPLICIT_DONE` when Finish exists without external events.
- Verify Send Out works without Sew (low-confidence flag + “Record Sew now” helper).
- Ensure packing defaults to `readyToPackQty` and writes `BoxLine` rows.

## 9. Product semantics + templates + SKU + import normalization

- Database / migrations
  - [ ] Add `Company.code String? @unique` with uppercase 2–10 char validation at app layer; allow null for legacy. Used for vendors and customers (single Company table).
  - [ ] Add `Product.sku String? @unique` (keep nullable for legacy), extend `Product.type` enum with `Packaging` (stop using `Raw` except for legacy mapping), and keep `Product.type` non-null in UI.
  - [ ] Normalize categories: keep `Product.categoryId Int?` (leaf ValueList row with `type=Category`, parent=type group; hierarchy is group (parent=null) → category (parent=group) → subcategory (parent=category)); drop `subCategory String?`, add `Product.subCategoryId Int?` with relation `subCategory ValueList? @relation("ProductSubCategory", ...)` and optional backrelation `productsSubCategory`.
  - [ ] Update ValueList(Category) seed structure to carry stable `code` on every row; children defined as `{ code, label }`, with parentCode links (group codes per ProductType, leaf codes for categories, optional subcategory codes as children).
  - [ ] Add optional `Product.externalStepType ExternalStepType?` (default expected step for Service products/templates).
  - [ ] Add `ProductTemplate` model: `code` (unique), `label`, `productType`, `defaultCategoryId`, `defaultSubCategoryId`, `defaultExternalStepType`, `requiresSupplier`, `requiresCustomer`, `defaultStockTracking`, `defaultBatchTracking`, `skuSeriesKey`, `isActive`.
  - [ ] Add `SkuSeriesCounter` model: `seriesKey` unique, `nextNum` default 1.
  - [ ] Add `Product.templateId` FK to `ProductTemplate`.
  - [ ] Create Prisma migrations for: ProductType enum change (+Packaging, stop Raw usage), drop subCategory string/add `subCategoryId`, add `Product.externalStepType`, add `ProductTemplate` + `templateId` relation, and `SkuSeriesCounter`. No DB backfills—reimport FM data to populate codes/templates/SKUs.
- Core logic / services
  - [ ] Enforce Product.type required in app logic; gate BOM editing to Finished only.
  - [ ] Implement SKU generator: accepts template key, vendor/customer/category codes, optional size token, pulls/bumps `SkuSeriesCounter`, retries on uniqueness conflict.
  - [ ] Define template rules:
    - [ ] Fabric/Trim/Packaging: default to vendor SKU when present, else template-based SKU.
    - [ ] Service external: `SV-{STEP}-{VENDORCODE}-{SIZE?}-{NNN}` (step from externalStepType/template).
    - [ ] Service internal: `SV-IN-{CATEGORYCODE}-{NNN}`.
    - [ ] CMT: `CMT-{CUSTOMERCODE}-{FINCATCODE}-{NNN}`.
  - [ ] Implement “Product Template / Classification” resolver: drives allowed categories/subcategories, stock tracking defaults, external/internal service flag, externalStepType default.
  - [ ] Enforce type semantics in domain services (fail/auto-set):
    - [ ] CMT: requires `customerId`, no `supplierId`, stock/batch off, can use SalePriceGroup.
    - [ ] Fabric: requires `supplierId`, no `customerId`, `stockTrackingEnabled=true`, `batchTrackingEnabled=true`, consumed at Cut.
    - [ ] Trim: requires `supplierId`, stockTrackingEnabled=true, batch optional, consumed Sew/Finish; `customerId` optional.
    - [ ] Packaging: requires `supplierId`, stockTrackingEnabled=true; replace legacy Raw usage.
    - [ ] Finished: requires `customerId`, no `supplierId`, BOM-enabled, creates assemblies.
    - [ ] Service: internal vs external driven by template; external implies supplierId + externalStepType; internal is supplier-optional.
  - [ ] When generating Costing from BOM/ProductLine, set `costing.externalStepType` from child product/template (or leaf category code mapping OUTSIDE_WASH/DYE/EMBROIDERY); allow manual override but default from BOM.
  - [ ] Implement ProductTemplate resolver in costing instantiation/import: Service templates auto-set externalStepType; Finished BOM → costing inherits child product externalStepType/template default automatically.
  - [ ] Keep assembly external-step engine authoritative on `costing.externalStepType` (no change to derived engine).
- UI / forms
  - [ ] Company editor: add `code` field (uppercase, 2–10 chars), surface for suppliers/customers with uniqueness errors.
  - [ ] Product editor/creator:
    - [ ] Require Product.type; add required Template picker (ProductTemplate table) that pre-fills type/category/subcategory/default flags, stock/batch defaults, externalStepType, and SKU series key.
    - [ ] Category selector uses leaf ValueList filtered by Product.type group; subcategory selector uses children of selected leaf (can be hidden/disabled until seeded). Clear invalid selections when type/template changes.
    - [ ] Replace free-text subCategory input with constrained selectors; preserve legacy data in notes only for imports.
    - [ ] For Service type, require template selection; auto-set external/internal, externalStepType, supplierId requirement, category/subcategory visibility. If leaf is Outside Wash/Dye/Embroidery, auto-set externalStepType and require supplierId in UI.
    - [ ] For Fabric/Trim/Packaging: enforce supplierId, auto-set stock/batch defaults.
    - [ ] For Finished/CMT: enforce customerId, hide supplier fields; disable BOM editing unless Finished.
    - [ ] SKU input with Auto toggle; regenerate on template/type change; show uniqueness errors and conflict retry behavior.
    - [ ] Add UI guard to prevent selecting legacy Raw; expose Packaging instead.
- Importer
  - [ ] When importing Companies, populate `code` from FM if present; leave null otherwise.
  - [ ] When importing Products:
    - [ ] Preserve incoming SKU if present; otherwise leave null (no generation during import).
    - [ ] Map FM types: Raw/packaging → Packaging; Fabric → Fabric; Finished → Finished; Trim → Trim; CMT → CMT; Services/fees → Service.
    - [ ] Map category/subcategory into ValueList hierarchy: group rows per ProductType (e.g., SERVICE, TRIM, FABRIC, FINISHED, CMT, PACKAGING), leaf category = `categoryId` via `code`, subCategoryId from child rows (none seeded initially). If FM subcategory is unmapped, append to `Product.notes` and emit import warning.
    - [ ] Add helpers `getCategoryGroupIdByCode`, `getCategoryLeafId(groupCode, leafCode)` with in-memory cache per import run (codes on ValueList rows; children include `code` + `label`).
    - [ ] Derive `Product.externalStepType` for Service from template/leaf codes: OUTSIDE_WASH → WASH, OUTSIDE_DYE → DYE, OUTSIDE_EMBROIDERY → EMBROIDERY; else null.
    - [ ] Validation warnings (no hard fail): Fabric/Trim/Packaging missing supplierId; Finished/CMT missing customerId; Service with externalStepType missing supplierId. Emit console table + JSON report with product IDs/SKUs.
    - [ ] On import, set `Product.templateId` when FM category maps to a seeded template; otherwise leave null.
  - [ ] When importing ProductLine/BOM and instantiating Costings: default `costing.externalStepType` from child product/template (or leaf code mapping); preserve incoming IDs.
  - [ ] Post-import validation report: list Service products missing supplierId or externalStepType/template so FM mapping can be fixed and reimported.
  - [ ] Seed data: add `productTemplates` TS array (at least SV_OUT_WASH, SV_OUT_DYE, SV_OUT_EMB, SV_INTERNAL_PATTERN, FAB_MAIN, TRIM_ZIP, PKG_POLYBAG, FIN_SHIRT, CMT_SHIRT); seed script resolves category IDs via ValueList codes (parentCode + leafCode) and upserts ProductTemplate rows and `SkuSeriesCounter` where `skuSeriesKey` present.
- Tests / UAT
  - [ ] Create external Service product via template → supplierId required, SKU auto-generated `SV-{STEP}-{VENDORCODE}-{NNN}` (with size when provided), costing instantiated from BOM carries `externalStepType` automatically.
  - [ ] Create assembly from finished product BOM containing outside wash line → expected external step appears without manual costing edits.
  - [ ] SKU generation uniqueness: collide two products on same series → retry and persist unique SKU; manual edit respected when Auto off.
  - [ ] Vendor/customer codes visible and used in SKUs; null codes allow legacy imports to save.
  - [ ] Type/category constraints enforced in UI (e.g., Trim cannot pick Finished-only subcategory; Service requires template selection).
  - [ ] Import finished product + BOM referencing Outside Wash service product: after import service category mapped, externalStepType set, costing on assembly creation has `externalStepType=WASH`, external-step engine shows expected Wash step.
  - [ ] Legacy products with free-text subcategory import without failure; subcategory stored in notes and warning report produced.
  - [ ] Product template seeding: `productTemplates` dataset (e.g., SV_OUT_WASH, SV_OUT_DYE, SV_OUT_EMB, SV_INTERNAL_PATTERN, FAB_MAIN, TRIM_ZIP, PKG_POLYBAG, FIN_SHIRT, CMT_SHIRT) resolves category IDs via ValueList codes and upserts templates and `SkuSeriesCounter` where `skuSeriesKey` present.
  - [ ] Product creation with template picker: selecting template pre-fills type/category/subcategory/externalStepType/stock+batch flags and enforces supplier/customer requiredness; clearing/changing template/type clears invalid category selections.
- Production dashboard lives at `/production/dashboard`; Production Ledger screen now has a “Dashboard” button linking out. Next step is blending the UIs once ops confirms the new tabs meet daily needs.
- Canonical rollup service and risk-signal service back both the dashboard and future consumers. Ready-to-pack uses finishNet (finish minus pack defects); sew availability falls back to finish with `lowConfidence=true` when sew data is missing.
- PO-hold MVP logic flags any linked PO line (assembly-level or job-level fallback) with outstanding qty when ETA is missing/past due/after target; UI labels the badge as “PO HOLD (MVP)” until mappings tighten.
