import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireAdminUser } from "~/utils/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminUser(request);
  return redirect("/admin/settings");
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdminUser(request);
  return redirect("/admin/settings");
}

export default function AdminSettingsPricingRedirect() {
  return null;
}
