import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { invalidateAllOptions } from "~/utils/options.server";

export async function loader(_args: LoaderFunctionArgs) {
  return json({
    ok: true,
    message: "POST to this endpoint to invalidate the options cache.",
  });
}

export async function action(_args: ActionFunctionArgs) {
  invalidateAllOptions();
  return json({ ok: true, invalidated: true });
}
