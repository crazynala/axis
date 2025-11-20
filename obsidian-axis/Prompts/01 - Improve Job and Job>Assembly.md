1. Implement Assembly state. Most modules will create an implementation of base/StateModel, and this includes Assembly
	1. States include: Draft - New - Canceled - Pending - On Hold - Cut Planned -  Partial Cut - Fully Cut - Finished
	2. The Job>Assembly detail page must have an implementation of the state change button
	3. In the Job detail page, the assembly table should have a status column. This field will be editable, with the states displayed in a select.
2. Job/Assembly state synching.
	1. Job will have the same states as assemblies. 
	2. If user changes the state of a job, system should potentially prompt to update states of all assemblies. Also, some transitions are not allowed based on assembly states. These rules should be configurable in case they need to b tweaked.
		1. Draft>New: Offer to 