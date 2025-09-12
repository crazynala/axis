## Record Browser Refactor – Next Enhancements

Keyboard navigation (ArrowUp = previous, ArrowDown = next) has been implemented.

Remaining / proposed improvements:

1. Multi‑page awareness

   - Allow fetching & stitching adjacent pages so navigation can continue beyond the current page slice.
   - Strategy: keep `state.pages` keyed by page number; lazily fetch next/prev when user crosses boundary.

2. Persist last registered module across transitions

   - Keep record set active when moving between detail subroutes (e.g., editing tabs) until a different module registers.

3. `useRecordBrowser()` convenience hook

   - Wrap context with derived helpers: `currentId`, `index`, `count`, `goNext()`, `goPrev()`.

4. Strong typing per module

   - Provide a `RecordModuleMap` interface mapping module name to record shape; derive generics for `register`.

5. Deep-link registration

   - When landing directly on `/module/:id` without visiting index first, perform a lightweight fetch: current, previous, next IDs to seed context.

6. Saved view integration

   - Store active saved view name alongside module; expose in context so header can indicate which view the navigation belongs to.

7. Accessibility

   - Announce position changes via ARIA live region: "Invoice 5 of 20".
   - Add `aria-label` to navigation buttons.

8. Optional wrap navigation

   - Config flag to wrap from last back to first and vice versa.

9. Unregister on stale

   - Auto-clear state if user navigates away from the module for > N minutes, to avoid stale navigation actions.

10. Integration with find / filters
    - Expose applied filter summary so header can show context: e.g., "Filtered (status=Open)".

---

Add or reorder items as architecture evolves.
