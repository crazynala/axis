import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { assertIntegrationsAuth } from "../utils/integrationsAuth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  assertIntegrationsAuth(request);
  const types = [
    {
      key: "fabric",
      label: "Fabric",
      aliases: ["self", "main fabric", "shell", "body"],
    },
    { key: "lining", label: "Lining", aliases: ["lining", "inner"] },
    {
      key: "interlining",
      label: "Interlining",
      aliases: ["fusible", "interfacing"],
    },
    { key: "zipper", label: "Zipper", aliases: ["zip"] },
    { key: "button", label: "Button", aliases: [] },
    { key: "thread", label: "Thread", aliases: [] },
    {
      key: "label",
      label: "Label",
      aliases: ["brand label", "size label", "care label"],
    },
  ];
  return json({ types });
}

export default function Route() {
  return null;
}
