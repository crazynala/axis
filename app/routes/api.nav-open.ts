import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../utils/prisma.server";
import { requireUserId } from "../utils/auth.server";

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const body = await request.json().catch(() => null);
  const next = body?.desktopNavOpened;
  if (typeof next !== "boolean") {
    return json(
      { ok: false, error: "Invalid desktopNavOpened" },
      { status: 400 }
    );
  }
  await prisma.user.update({
    where: { id: userId },
    data: { desktopNavOpened: next },
  });
  return json({ ok: true });
}

export const loader = () => json({ ok: true });
