// Deprecated route; keeping file to avoid route collision but no actions allowed in layout routes.
export function loader() {
  return new Response(null, { status: 404 });
}
