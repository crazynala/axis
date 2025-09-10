// app/find/multiFind.ts
// Generic multi-request Find engine emulating FileMaker logic.
// Request = AND of field criteria. Multiple non-omit requests OR'ed together, then all omit requests subtracted.
// Field criteria are simple key/value pairs interpreted later via a field schema mapping -> Prisma where blocks.

export type MultiFindRequest = {
  id: string; // stable identifier (uuid-ish)
  omit?: boolean; // if true => subtract this request's result set
  criteria: Record<string, any>; // raw form values for this request
};

export type MultiFindState = {
  requests: MultiFindRequest[];
};

// Encoded into URL as a compact base64 JSON to avoid exceeding length with many criteria.
// ?findReqs=<base64>
// Compact encoding (v2): {"r":[{"c":{...}}, {"o":1,"c":{...}}]}
//  - omit=false omitted
//  - id omitted (regen on decode)
// Legacy (v1) shape: { requests:[{id,omit?,criteria:{}}] }
export function encodeRequests(state: MultiFindState): string {
  const compact = {
    r: state.requests.map((req) => {
      const entry: any = { c: req.criteria || {} };
      if (req.omit) entry.o = 1;
      return entry;
    }),
  };
  const json = JSON.stringify(compact);
  if (typeof window === "undefined")
    return Buffer.from(json).toString("base64");
  return btoa(json);
}

let _reqCounter = 0;
function _genId() {
  _reqCounter += 1;
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return `req-${Date.now().toString(36)}-${_reqCounter.toString(36)}`;
}

export function decodeRequests(b64: string | null): MultiFindState | null {
  if (!b64) return null;
  try {
    const json =
      typeof window === "undefined"
        ? Buffer.from(b64, "base64").toString("utf8")
        : atob(b64);
    const parsed = JSON.parse(json);
    if (parsed && Array.isArray(parsed.r)) {
      return {
        requests: parsed.r.map((e: any) => ({
          id: _genId(),
          omit: e.o === 1,
          criteria: e.c || {},
        })),
      } as MultiFindState;
    }
    if (parsed && Array.isArray(parsed.requests)) {
      return {
        requests: parsed.requests.map((r: any) => ({
          id: r.id || _genId(),
          omit: !!r.omit,
          criteria: r.criteria || {},
        })),
      } as MultiFindState;
    }
    return null;
  } catch {
    return null;
  }
}

// Generic field interpreter. Provide a mapping from criterion key -> function returning Prisma where fragment.
export type CriterionInterpreter = (value: any) => any | null;
export type InterpreterMap = Record<string, CriterionInterpreter>;

export function buildWhereFromRequests(
  state: MultiFindState | null,
  interpreters: InterpreterMap
): any {
  if (!state || !state.requests.length) return {};
  const nonOmit: any[] = [];
  const omit: any[] = [];
  for (const req of state.requests) {
    const blocks: any[] = [];
    for (const [k, v] of Object.entries(req.criteria)) {
      if (v === undefined || v === null || v === "") continue;
      const fn = interpreters[k];
      if (!fn) continue;
      const frag = fn(v);
      if (frag) blocks.push(frag);
    }
    if (!blocks.length) continue;
    const whereBlock = blocks.length === 1 ? blocks[0] : { AND: blocks };
    if (req.omit) omit.push(whereBlock);
    else nonOmit.push(whereBlock);
  }
  if (!nonOmit.length && !omit.length) return {};
  if (!nonOmit.length && omit.length) {
    // Only omit requests: start from all and subtract (caller may wrap)
    return { NOT: omit.length === 1 ? omit[0] : { OR: omit } };
  }
  const base = nonOmit.length === 1 ? nonOmit[0] : { OR: nonOmit };
  if (!omit.length) return base;
  const notBlock = omit.length === 1 ? omit[0] : { OR: omit };
  return { AND: [base, { NOT: notBlock }] };
}

// Helper to merge single-form simple params with multi-request logic.
export function mergeSimpleAndMulti(simpleWhere: any, multiWhere: any) {
  if (!simpleWhere || Object.keys(simpleWhere).length === 0) return multiWhere;
  if (!multiWhere || Object.keys(multiWhere).length === 0) return simpleWhere;
  return { AND: [simpleWhere, multiWhere] };
}
