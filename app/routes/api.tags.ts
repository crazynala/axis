import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUserId } from "../utils/auth.server";
import { listVisibleTags } from "../utils/tags.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || undefined;
  const tags = await listVisibleTags(userId, q);
  return json({
    options: tags.map((t) => ({ value: t.name, label: t.name, scope: t.scope })),
  });
}
