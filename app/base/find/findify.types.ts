// app/find/findify.types.ts
export type TextOp = "equals" | "startsWith" | "contains";
export type TextMode = "default" | "insensitive";

type BaseField = { path: string };
type TextField = BaseField & { kind: "text"; op?: TextOp; mode?: TextMode };
type IdField = BaseField & { kind: "id" };
type BoolField = BaseField & { kind: "bool" }; // true | false | "any"
type NumMin = BaseField & { kind: "number-min" };
type NumMax = BaseField & { kind: "number-max" };

export type FieldDef = TextField | IdField | BoolField | NumMin | NumMax;

export type RelatedBlock<V> = {
  path: string; // e.g. "productLines"
  quantifier: "some" | "every" | "none";
  fields: Partial<Record<keyof V & string, FieldDef>>;
};

export type SearchSchema<V extends object, W> = {
  fields: Partial<Record<keyof V & string, FieldDef>>;
  related?: RelatedBlock<V>[];
  massageWhere?: (w: any) => W; // optional finalize hook
};

// Helper: set nested path "a.b.c" into obj
export function setAtPath(obj: any, dotted: string, fragment: any) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] ??= {};
    cur = cur[parts[i]];
  }
  const last = parts[parts.length - 1];
  cur[last] = { ...(cur[last] || {}), ...fragment };
}
