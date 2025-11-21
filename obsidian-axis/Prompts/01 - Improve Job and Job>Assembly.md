1. Add a statusWhiteboard field to Job and Assembly. This is a volatile (no history tracked) "status note" users can enter, for instance to explain the "Pending" state (e.g., pending what?)
2. Implement Assembly state. Most modules will create an implementation of base/StateModel, and this includes Assembly
	1. States include: Draft - New - Canceled - Pending - On Hold - Cut Planned -  Partial Cut - Fully Cut - Complete
	2. The Job>Assembly detail page must have an implementation of the state change button
	3. In the Job detail page, the assembly table should have a status column. This field will be editable, with the states displayed in a select.
2. Job/Assembly state synching.
	1. Job will have the following states: Draft - New - Canceled - Pending - On Hold - In Work - Complete
	2. If the user changes the state of an assembly, the system should automatically update the state of the job:
		1. If all assemblies are Canceled, job > Canceled
		2. If all assemblies are (New || Canceled) and at least one assembly is New, job > New
		3. If at least 1 assembly is (Cut Planned || Partial Cut || Fully Cut), job > In Work
		4. If all assemblies are (Canceled || Complete), job > Complete
		5. If all assemblies are (Canceled || Pending) and at least 1 assembly is Pending, job > Pending
		6. If all assemblies are (Canceled || On Hold) and at least 1 assembly is On Hold, job > On Hold
	3. If user changes the state of a job, system should potentially prompt to update states of all assemblies. Also, some transitions are not allowed based on assembly states. These rules should be configurable in case they need to b tweaked.
		1. Draft>New: Update all assemblies that are in a Draft state to New
		2. Canceled: Only allowed if no assemblies have any activities (ie, nothing has been cut). Update all assemblies to Canceled.
		3. On Hold: update all assemblies that are not canceled to On Hold.
		4. Complete: update all assemblies that are not canceled to Complete.