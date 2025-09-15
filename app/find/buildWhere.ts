// app/find/buildWhere.ts
import type { SearchSchema, FieldDef } from "./findify.types";
import { setAtPath } from "./findify.types";

export function buildWhere<V extends Record<string, any>, W = any>(
  values: V,
  schema: SearchSchema<V, W>
): W {
  const where: any = { AND: [] };

  const pushBlock = (def: FieldDef, raw: any, targetAND: any[]) => {
    const v = raw as any;
    if (v === undefined || v === null || v === "") return;
    if (def.kind === "bool" && (v === "any" || v === "undefined")) return;

    const block: any = {};
    switch (def.kind) {
      case "text": {
        const op = def.op ?? "contains";
        const mode = def.mode === "insensitive" ? { mode: "insensitive" } : {};
        const f =
          op === "equals"
            ? { equals: v, ...mode }
            : op === "startsWith"
            ? { startsWith: v, ...mode }
            : { contains: v, ...mode };
        setAtPath(block, def.path, f);
        break;
      }
      case "id": {
        const n = Number(v);
        if (!Number.isFinite(n)) return;
        setAtPath(block, def.path, { equals: n });
        break;
      }
      case "bool": {
        const boolVal = v === true || v === "true";
        setAtPath(block, def.path, { equals: boolVal });
        break;
      }
      case "number-min": {
        const n = Number(v);
        if (!Number.isFinite(n)) return;
        setAtPath(block, def.path, { gte: n });
        break;
      }
      case "number-max": {
        const n = Number(v);
        if (!Number.isFinite(n)) return;
        setAtPath(block, def.path, { lte: n });
        break;
      }
    }
    targetAND.push(block);
  };

  for (const [key, def] of Object.entries(schema.fields) as Array<
    [keyof V & string, FieldDef]
  >) {
    pushBlock(def, (values as any)[key], where.AND);
  }

  for (const rel of schema.related ?? []) {
    const relAND: any[] = [];
    for (const [key, def] of Object.entries(rel.fields) as Array<
      [string, FieldDef]
    >) {
      if (def) pushBlock(def, (values as any)[key], relAND);
    }
    if (relAND.length) {
      where.AND.push({ [rel.path]: { [rel.quantifier]: { AND: relAND } } });
    }
  }

  return (schema.massageWhere ? schema.massageWhere(where) : where) as W;
}

// re-export helper
export { setAtPath } from "./findify.types";
