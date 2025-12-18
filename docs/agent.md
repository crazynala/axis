Below is a **single `agent.md`** you can drop into the repo. It encodes the **UI/UX patterns** you’ve described (detail views, Findify, Save/Cancel, record navigation, sheets) plus the **coding style guardrails** (thin routes, goal-specific services, invariants).

---

# agent.md — Axis UI/UX + Engineering Conventions

## 0) Axis product stance

Axis exists to reduce “operator fatigue” and prevent corner-cutting.

- Prefer **one strong canonical place** for any truth (quantities, readiness, history).
- Prefer **summaries that lead to drill-down**, not walls of text.
- Prefer **consistent patterns across modules** over bespoke UI per screen.

---

## 1) Global UX patterns

### 1.1 Detail views

Detail pages are “workbenches” with:

- a status/context bar (breadcrumbs + status + actions)
- focused cards/sections (not endless scroll of tables)
- **drill-down drawers** for detail and resolution paths
- high-density tables only where they are the “core artifact” (e.g., master qty table)

### 1.2 Record navigation (found-set)

Detail pages always support found-set navigation:

- show `record X / Y` with prev/next controls
- keyboard shortcuts may exist globally
- navigation preserves the current found set (from Findify / index filters)

### 1.3 Save/Cancel submission model (RHF)

Wherever possible, edits are **UI-only** until explicit Save/Discard.

- Use a `SaveCancelHeader` with:

  - Save / Discard controls
  - navigation blocker when dirty

- Actions that must hit the server immediately (e.g., duplicate) are:

  - disabled when dirty
  - show toast feedback on success/failure

### 1.4 Drawers and modals

- Use **drawers** for history, details, and resolution flows.
- Use **modals** for “commit an event” flows (record activity, send/receive, etc).
- Any “chip” that implies risk/attention should be **clickable** and open a drawer showing:

  - why it exists (inputs / rules)
  - what it affects
  - how to resolve it (links/actions)

---

## 2) Canonical quantity + activity model (Assemblies)

### 2.1 Master quantity table is canonical

The master quantity table is the canonical view of stage quantities for an assembly.

- Internal stages and external steps are rendered as **rows** in the same table.
- Do **not** create separate UI containers/cards for external steps.
- External steps must be **size-aware** everywhere.

**Invariant guardrail comment (required in aggregation service):**

```ts
// NOTE: External steps are rendered as stage rows.
// Do NOT create separate UI containers for them.
```

### 2.2 Stage rows pipeline

Quantities shown in the master table (and downstream readiness metrics) must come from the same stage-row aggregation pipeline.

- Use `AssemblyActivity` as the source of truth.
- External steps use `action ∈ { SENT_OUT, RECEIVED_IN }` + `externalStepType` + `qtyBreakdown`.
- Derived metadata (ETA, vendor, late, lowConfidence, implicit-done) is preserved but attached to the stage row.

### 2.3 External steps: size-aware enforcement

Send Out / Receive In flows must require per-size breakdown.

**Invariant guardrail comment (required in handlers):**

```ts
// qtyBreakdown is mandatory for any unit-moving external step.
```

Server-side validation must reject a missing/empty `qtyBreakdown` for those actions.

### 2.4 Activity history is unified

Activity History should show **all meaningful events** affecting an assembly:

- ORDER (including adjustments)
- CUT / SEW / FINISH / PACK / QC
- external send/receive events
- defects and dispositions
- grouped/pool events (as appropriate)

History filtering is allowed (e.g., open drawer pre-filtered to a step), but it should still be the **same history system**, not a separate “external history.”

---

## 3) Chip taxonomy and grammar

Chips are used for:

1. **Status / state** (human-readable label)
2. **Exceptions / risks** (something needs attention)
3. **Summaries of hidden complexity** (bag of chips)

Chips should not be used for trivial attribution (“this is a DB cell”), except when attribution is materially relevant (audit/review workflows).

### 3.1 Chip categories

**A) Status chips (neutral)**

- Indicate a stable state (“Fully Cut”, “Pending”, “No ETA”)
- Can be non-clickable if purely informational
- Prefer clickability if there’s a meaningful “why” panel or linked workflow

**B) Warning chips (attention) — should be clickable**

- Late, missing, inconsistent, blocked, low confidence, hold
- Must open a details drawer:

  - rule inputs (what triggered it)
  - impact (what it blocks / changes)
  - resolution path (actions/links)

**C) Summary chips (bag-of-chips)**

- Used when a full table would dominate the screen (e.g., costings summary)
- Clicking opens a drawer with full detail and audit affordances

### 3.2 Chip grammar (visual + wording)

- Keep chip text short; the row or drawer provides the detail.
- Prefer a consistent prefix vocabulary:

  - `HOLD`, `LATE`, `NO ETA`, `LOW CONF`, `MISSING`, `IMPLICIT DONE`

- If a chip implies actionability, clicking should lead somewhere useful.

### 3.3 Chip placement rules

- Avoid blowing up row height with stacked text under the stage label.
- Prefer:

  - 0–2 chips visible inline
  - overflow → “+N” chip or a single summary chip
  - details in drawer

---

## 4) Assembly “master table” UI rules

### 4.1 Row height discipline

The stage/type column must not become a vertical wall of text.

- Stage label: single line
- Chips: compact row, max 1–2 lines
- Vendor/ETA/late/lowConfidence should be chips or compact badges, not multiline paragraphs

### 4.2 Row actions

Rows have a consistent “act on stage” affordance.

- Internal stages may use the right-side icon (scissors/gear/etc).
- External steps may use:

  - a single row action menu (Send Out / Receive In / View History)
  - or a right-side icon that opens the action menu

- Prefer “measurement gate” mental model:

  - Sew records good output
  - External steps record send/receive (net/loss)
  - Finish readiness uses aggregator-derived gating

### 4.3 External step row display

External rows show:

- primary: **received** qty (by size and total)
- secondary: sent qty
- loss shown only if non-zero
- vendor/ETA/late/lowConfidence presented as chips/badges
- click row → drawer with full details + history + resolution actions

---

## 5) Costings UI rules (assembly detail)

Costings are important, but the assembly screen must not force constant auditing via a full always-open table.

Preferred approach:

- collapsed by default into a **Costings Summary** (bag of chips)
- visible exception chips:

  - `NO CMT` (critical)
  - missing primary costing
  - grouped pricing edge case
  - disabled/invalid costings

- click summary → drawer with:

  - full costings table
  - warnings
  - audit checklist / resolution actions (where applicable)

---

## 6) Findify + index views

### 6.1 Index view

Index views are:

- dense, virtualized nav tables
- filters live in Findify
- saved views everywhere

### 6.2 Findify modal

Findify supports comprehensive search/filter; the resulting found set powers:

- index results
- detail view record navigation (X/Y, prev/next)

---

## 7) Sheet views

Sheet views exist to enable high-throughput editing and Excel-like workflows without losing correctness.

- allow copy/paste
- support undo of last paste (target capability; if missing, treat as a known UX gap)
- edits are staged (Save/Cancel), not straight-to-server

---

## 8) Engineering conventions

### 8.1 Route file scope (hard rule)

Route files must stay **UI-oriented**.

They may contain:

- meta, default React component, small UI glue
- thin `loader` / `action` that: parse → delegate → return

They must not contain:

- deep Prisma includes/selects
- aggregation/rollup logic
- giant intent switches
- long parsing/validation helpers
- N+1 query loops

### 8.2 Module layout (expected)

`app/modules/<module>/`

- `routes/`
- `components/`
- `forms/`
- `findify/`
- `services/`
- `types/`

Route loaders/actions import primarily from `services/` and `types/`.

### 8.3 Loader pattern: “view model loader”

Detail routes should call a **single** service entrypoint that returns a normalized view model.

Example:

- `loadAssemblyDetailVM({ jobId, assemblyIds, userId })`

The route should not “assemble” the payload piecemeal.

### 8.4 Action pattern: “intent router → handler services”

Actions should dispatch to goal-specific handlers in services.

- Small intent parsing in route is ok
- Each intent handler lives in `services/*Actions.server.ts`
- Validation/invariants belong in handlers/services

### 8.5 Prisma query discipline

- Centralize query shapes in `services/*Queries.server.ts`
- Prefer batched queries + maps
- Avoid per-id loops calling `findUnique`

### 8.6 Types + normalized shapes

- Define explicit `VM` / `LoaderData` / `ActionResult` types in `types/`
- Prefer `byId` maps and normalized arrays where they simplify UI and prevent recomputation

### 8.7 Invariants + comments

When an invariant prevents regression, encode it twice:

1. as validation logic
2. as an explicit guardrail comment (as above)

---

## 9) Testing expectations (UI-level)

For any screen where stage rows and external steps are involved, maintain a manual verification checklist tests for:

- size-aware send/receive enforcement
- external row loss display
- readiness gating correctness (finishInputQty, readyToPackQty)
- unified activity history includes ORDER + external events
- chips open correct drawers and provide a resolution path
