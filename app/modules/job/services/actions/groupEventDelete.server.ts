import { json, redirect } from "@remix-run/node";
import { deleteAssemblyGroupEvent } from "~/modules/job/services/assemblyGroupEvents.server";

export async function handleGroupEventDelete(opts: {
  jobId: number;
  assemblyId: number;
  form: FormData;
}) {
  const eventId = Number(opts.form.get("eventId"));
  if (!Number.isFinite(eventId) || eventId <= 0) {
    return json({ error: "Group event not found." }, { status: 400 });
  }
  await deleteAssemblyGroupEvent({ eventId, userId: null });
  const returnTo = opts.form.get("returnTo");
  if (typeof returnTo === "string" && returnTo.startsWith("/")) {
    return redirect(returnTo);
  }
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
}

