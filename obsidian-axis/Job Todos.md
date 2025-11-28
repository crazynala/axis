### Index Page
- [ ] Start / End / Status not populated.
- [ ] Index table widths don't make sense (name is crunched)

### Detail Page

- [x] Must be able to delete assemblies
- [x] Add assembly modal should have customer / assembly flags on by default
- [x] Assemblies must be in same state and have no assembly activities (eg, no "cuts" recorded) for user to be able to group; show a confirm message with "OK" button reporting to user if assemblies don't meet these criteria
- [x] In assembly hamburger menu, add a duplicate assembly option
- [ ] Assembly states (in assembly table) should be presented with stateChangeButton instead of a select dropdown
- [ ] New assemblies must be in draft state, including those create by duplication
- [ ] There is a column "Status Note" in the assemblies table of job detail. Is this status whiteboard? If so, header should be "Whiteboard" and field should be editable.
- [ ] On job detail route, move the stateChangeButton above the cards, inline with the breadcrumbs but pushed right. The status whiteboard field should be to the left of this, with no label and placeholder text = "Whiteboard"
- [ ] Stock location must be locked if there are any assembly activities