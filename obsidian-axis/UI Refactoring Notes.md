
# Axis Detail Screen Baseline (Working Doctrine)

This is a **play-tested structural baseline**, not a rules manifesto. Use it to sanity-check future modules (Jobs, Assemblies, etc.) before you generalize.

---

## 1. The Detail Screen Has One Job

> **This is _the_ screen for this entity.**

Users come here for _any_ of these reasons:

- understand what the thing is
    
- diagnose what’s wrong
    
- fix configuration issues
    
- check operational state
    
- extend it (BOM, pricing, tracking)
    
- communicate about it with others
    

**Implication:**  
The screen must support _multiple mental modes_ without changing structure or overwhelming the user.

---

## 2. Simplify the Main Form Ruthlessly

### Principle

> **The main form should show only the _primary touch points_.**

If a field:

- is rarely changed
    
- controls complex downstream behavior
    
- has dangerous interactions
    
- exists mainly to _configure_ the system rather than describe the entity
    

…it does **not** belong in the main form.

### Applied lesson (Product)

- Identity + Setup collapsed into one dense card
    
- Commercial + Operations collapsed into one dense card
    
- Stock/batch toggles removed from main form
    
- Pricing mechanics moved out of the main surface
    

### Reusable rule

> **If a user has to “think carefully” before changing something, it probably belongs in a drawer.**

---

## 3. Use Drawers to Hide Complexity, Not Importance

Drawers are not “advanced settings” graveyards. They are for:

- pricing mechanics
    
- configuration levers
    
- provenance / explanation (“why is this locked?”)
    
- destructive or structural changes (mode switches, enabling tracking)
    

### Pattern

- **Main form:** key data, editable intent
    
- **Drawer:** machinery, invariants, and consequences
    

This keeps the screen calm _and_ powerful.

---

## 4. Chips Are a Situational Dashboard, Not Validation Labels

### What chips are good at

- signaling **state**
    
- prompting **action**
    
- conveying **mode or exception**
    

### What chips are bad at

- repeating field-level validation
    
- enumerating every missing thing
    
- competing with form inputs for attention
    

### Practical rules you discovered

- Chips must be **categorical**, not granular  
    (e.g. `Field Missing`, `Enable Stock`, not `Missing Category`, `Missing Supplier`, etc.)
    
- Chips belong near **Whiteboard / breadcrumbs**, not scattered in cards
    
- **Silence is success**  
    If something conforms to strict rules, say nothing
    
- Chips should map to:
    
    - an action (scroll, open drawer)
        
    - or a clear explanation
        

Inline field styling does the rest.

---

## 5. Validation Lives in Fields, Not Headers

### Applied lesson

- Yellow border = required but missing (initial state)
    
- Red border = failed submit
    
- No “Required” labels
    
- No per-card validation chips
    
- No duplicated “Missing required” summaries
    

### Why this works

- It keeps the form visually stable
    
- It avoids horizontal noise
    
- It preserves muscle memory
    

---

## 6. Headers Only When the Mode Changes

### Strong rule

> **Headers should indicate a conceptual shift, not just grouping.**

### Applied

- No headers for form-only sections
    
- Headers retained for:
    
    - Bill of Materials (core artifact)
        
    - Stock / Instances / Movements (diagnostics)
        
- This reduced vertical sprawl and visual fatigue immediately
    

---

## 7. Prioritize Information Density Over Decoration

### Field ordering matters more than chrome

Users scan:

1. Name
    
2. SKU
    
3. Key classification
    
4. Core artifact (BOM / table)
    
5. Diagnostics
    

Fields like:

- Type
    
- ID
    
- Internal flags
    

should be **de-emphasized**, not removed.

Example:

- ID small, dim, bottom/right
    
- Type editable but not dominant
    

---

## 8. Explicit Modes Beat Implicit Inference (When Complexity Exists)

### Key insight from pricing

When multiple levers interact:

- manual price
    
- margin
    
- tiers
    
- groups
    
- specs
    

…**implicit inference is hostile to users**.

Making an explicit **authoring mode**:

- FIXED_PRICE
    
- FIXED_MARGIN
    
- TIERED_COST
    
- TIERED_SELL
    
- GENERATED
    

does not replace runtime logic — it:

- clarifies intent
    
- simplifies UI
    
- prevents illegal combinations
    
- makes drawers intelligible
    

### Transferable lesson

If users ask:

> “Why is this locked?”  
> “Why is that field even here?”

…you probably need an explicit mode.

---

## 9. Operational Data Must Respect Configuration Truth

You uncovered a critical rule:

> **The UI must never contradict the system state.**

Applied examples:

- Stock tracking OFF → legacy/read-only data clearly labeled
    
- Batch tracking OFF → no batch actions
    
- Disabled state → banner + action, not a checkbox
    

This builds trust.

---

## 10. Structure First, Principles Later

You did the right thing by:

- refining Product _fully_
    
- play-testing
    
- discovering edge cases
    
- adjusting instincts (e.g. single chip → categorical chips)
    

### Next-module workflow (recommended)

1. Apply this baseline structurally
    
2. Play-test
    
3. Adjust for domain-specific needs
    
4. **Only then** extract generalized rules into `agent.md`
    

---

## One-Sentence North Star (to carry forward)

> **Detail screens should feel calm on first glance, powerful on demand, and never make the user decode system internals to do their job.**

When you’re ready, in the _next session_, we can:

- apply this baseline to Jobs or Assemblies
    
- explicitly note where it _breaks_ (important!)
    
- and only then formalize the shared ruleset
