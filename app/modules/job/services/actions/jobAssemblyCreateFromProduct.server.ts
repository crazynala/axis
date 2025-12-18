import { redirect } from "@remix-run/node";
import { createAssemblyFromProductAndSeedCostings } from "~/modules/job/services/assemblyFromProduct.server";

export async function handleJobAssemblyCreateFromProduct(opts: { id: number; form: FormData }) {
  const productId = Number(opts.form.get("productId"));
  if (Number.isFinite(productId)) {
    const assemblyId = await createAssemblyFromProductAndSeedCostings(opts.id, productId);
    console.log("[jobs.$id] Created assembly", { assemblyId, jobId: opts.id });
  }
  return redirect(`/jobs/${opts.id}`);
}

