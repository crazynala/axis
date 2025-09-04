import type { LoaderFunctionArgs } from "@remix-run/node";

// 1x1 transparent PNG
const BASE64_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9W7iEoUAAAAASUVORK5CYII=";

export async function loader(_args: LoaderFunctionArgs) {
  const buf = Buffer.from(BASE64_PNG, "base64");
  return new Response(buf, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
