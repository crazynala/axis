import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import pino from "pino";

const root = pino({ level: "info", base: { service: "remix-app-client" } });

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json();
    const { level = "info", module = "web" } = body || {};
    const child = root.child({ module });
    if (level === "error") child.error(body);
    else if (level === "warn") child.warn(body);
    else child.info(body);
  } catch (e) {
    root.warn({ err: e }, "invalid client log payload");
  }
  return json({ ok: true });
}

export function loader() {
  return json({ ok: true });
}
