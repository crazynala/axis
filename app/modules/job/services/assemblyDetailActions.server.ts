import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { handleGroupEventCreateCut } from "./actions/groupEventCreateCut.server";
import { handleGroupEventDelete } from "./actions/groupEventDelete.server";
import { handleGroupActivityCreateCut } from "./actions/groupActivityCreateCut.server";
import { handleGroupActivityCreateFinish } from "./actions/groupActivityCreateFinish.server";
import { handleGroupUpdateOrderedBreakdown } from "./actions/groupUpdateOrderedBreakdown.server";
import { handleAssemblyUpdate } from "./actions/assemblyUpdate.server";
import { handleAssemblyGroupState } from "./actions/assemblyGroupState.server";
import { handleCostingCreate } from "./actions/costingCreate.server";
import { handleCostingToggle } from "./actions/costingToggle.server";
import { handleCostingDelete } from "./actions/costingDelete.server";
import { handleCostingRefreshProduct } from "./actions/costingRefreshProduct.server";
import { handleActivityDelete } from "./actions/activityDelete.server";
import { handleActivityCreateCut } from "./actions/activityCreateCut.server";
import { handleActivityCreateFinish } from "./actions/activityCreateFinish.server";
import { handleActivityCreatePack } from "./actions/activityCreatePack.server";
import { handleActivityUpdate } from "./actions/activityUpdate.server";
import { handleActivityCreateDefect } from "./actions/activityCreateDefect.server";
import { handleExternalStepSendReceive } from "./actions/externalStepSendReceive.server";
import { handleAssemblyUpdateOrderedBreakdown } from "./actions/assemblyUpdateOrderedBreakdown.server";
import { handleAssemblyCancel } from "./actions/assemblyCancel.server";

export async function handleAssemblyDetailAction({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  const jobId = Number(params.jobId);
  const raw = String(params.assemblyId || "");
  const idList = raw
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  const assemblyId = idList[0];
  if (!jobId || !idList.length) return redirect(`/jobs/${jobId}`);

  const form = await request.formData();
  console.log("form", form);
  const intent = form.get("_intent");
  const intentStr = typeof intent === "string" ? intent : "";

  if (intentStr === "group.event.create.cut") {
    return handleGroupEventCreateCut({ jobId, assemblyId, form });
  }
  if (intentStr === "group.event.delete") {
    return handleGroupEventDelete({ jobId, assemblyId, form });
  }
  if (intentStr === "group.activity.create.cut") {
    return handleGroupActivityCreateCut({
      jobId,
      rawAssemblyIdParam: raw,
      idList,
      form,
    });
  }
  if (intentStr === "group.activity.create.finish") {
    return handleGroupActivityCreateFinish({
      jobId,
      rawAssemblyIdParam: raw,
      idList,
      form,
    });
  }
  if (intentStr === "group.updateOrderedBreakdown") {
    return handleGroupUpdateOrderedBreakdown({
      jobId,
      rawAssemblyIdParam: raw,
      idList,
      form,
    });
  }
  if (intentStr === "assembly.update" || intentStr === "assembly.update.fromGroup") {
    return handleAssemblyUpdate({
      jobId,
      rawAssemblyIdParam: raw,
      fallbackAssemblyId: assemblyId,
      form,
    });
  }
  if (intentStr === "assembly.groupState") {
    return handleAssemblyGroupState({ jobId, rawAssemblyIdParam: raw, form });
  }
  if (intentStr === "costing.create") {
    return handleCostingCreate({ jobId, assemblyId, form });
  }
  if (intentStr === "costing.enable" || intentStr === "costing.disable") {
    return handleCostingToggle({
      jobId,
      assemblyId,
      intent: intentStr,
      form,
    });
  }
  if (intentStr === "costing.delete") {
    return handleCostingDelete({ jobId, assemblyId, form });
  }
  if (intentStr === "costing.refreshProduct") {
    return handleCostingRefreshProduct({ jobId, assemblyId, form });
  }
  if (intentStr === "activity.delete") {
    return handleActivityDelete({ jobId, assemblyId, form });
  }
  if (intentStr === "activity.create.cut") {
    return handleActivityCreateCut({ jobId, assemblyId, form });
  }
  if (intentStr === "activity.create.finish") {
    return handleActivityCreateFinish({ jobId, assemblyId, form });
  }
  if (intentStr === "activity.create.pack") {
    return handleActivityCreatePack({
      request,
      jobId,
      rawAssemblyIdParam: raw,
      assemblyId,
      form,
    });
  }
  if (intentStr === "activity.update") {
    return handleActivityUpdate({ jobId, assemblyId, form });
  }
  if (intentStr === "activity.create.defect") {
    return handleActivityCreateDefect({ jobId, rawAssemblyIdParam: raw, assemblyId, form });
  }
  if (intentStr === "externalStep.send" || intentStr === "externalStep.receive") {
    return handleExternalStepSendReceive({
      jobId,
      assemblyId,
      intent: intentStr,
      form,
    });
  }
  if (intentStr === "assembly.updateOrderedBreakdown") {
    return handleAssemblyUpdateOrderedBreakdown({ jobId, assemblyId, form });
  }
  if (intentStr === "assembly.cancel") {
    return handleAssemblyCancel({ jobId, assemblyId, form, rawAssemblyIdParam: raw });
  }

  return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
}
