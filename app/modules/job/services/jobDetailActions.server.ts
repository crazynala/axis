import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { handleJobDetailFind } from "./actions/jobDetailFind.server";
import { handleJobDetailUpdate } from "./actions/jobDetailUpdate.server";
import { handleJobDetailDuplicate } from "./actions/jobDetailDuplicate.server";
import { handleJobDetailDelete } from "./actions/jobDetailDelete.server";
import { handleJobAssemblyCreateFromProduct } from "./actions/jobAssemblyCreateFromProduct.server";
import { handleJobAssemblyUpdateOrderedBreakdown } from "./actions/jobAssemblyUpdateOrderedBreakdown.server";
import { handleJobAssemblyGroup } from "./actions/jobAssemblyGroup.server";
import { handleJobAssemblyDuplicate } from "./actions/jobAssemblyDuplicate.server";
import { handleJobAssemblyUngroupOne } from "./actions/jobAssemblyUngroupOne.server";
import { handleJobAssemblyDelete } from "./actions/jobAssemblyDelete.server";
import { handleJobAssemblyState } from "./actions/jobAssemblyState.server";
import { handleAssemblyCancel } from "./actions/assemblyCancel.server";

export async function handleJobDetailAction({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  const id = Number(params.id);
  if (!id) return redirect("/jobs");
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");

  if (intent === "find") return handleJobDetailFind({ id, form });
  if (intent === "job.update") return handleJobDetailUpdate({ id, form });
  if (intent === "job.duplicate") return handleJobDetailDuplicate({ id });
  if (intent === "job.delete") return handleJobDetailDelete({ id, form });

  if (intent === "assembly.createFromProduct")
    return handleJobAssemblyCreateFromProduct({ id, form });
  if (intent === "assembly.updateOrderedBreakdown")
    return handleJobAssemblyUpdateOrderedBreakdown({ id, form });
  if (intent === "assembly.group") return handleJobAssemblyGroup({ id, form });
  if (intent === "assembly.duplicate") return handleJobAssemblyDuplicate({ id, form });
  if (intent === "assembly.ungroupOne") return handleJobAssemblyUngroupOne({ id, form });
  if (intent === "assembly.delete") return handleJobAssemblyDelete({ id, form });
  if (intent === "assembly.state") return handleJobAssemblyState({ id, form });
  if (intent === "assembly.cancel")
    return handleAssemblyCancel({ jobId: id, assemblyId: 0, form });

  return redirect(`/jobs/${id}`);
}
