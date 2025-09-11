import { Link } from "@remix-run/react";

export type ColumnDef = {
  accessor: string;
  title?: string;
  width?: number | string;
  sortable?: boolean;
  render?: (row: any) => any;
};

export function idLinkColumn(resource: string, title = "ID", width: number | string = 70): ColumnDef {
  return {
    accessor: "id",
    title,
    width,
    sortable: true,
    render: (r: any) => <Link to={`/${resource}/${r.id}`}>{r.id}</Link>,
  };
}

export function linkColumn(accessor: string, resource: string, title?: string): ColumnDef {
  return {
    accessor,
    title,
    sortable: true,
    render: (r: any) => {
      const val = accessor.split(".").reduce((acc: any, k: string) => (acc ? acc[k] : undefined), r);
      const id = r.id;
      const display = val ?? (val === 0 ? "0" : `${resource.slice(0, 1).toUpperCase() + resource.slice(1)} #${id}`);
      return <Link to={`/${resource}/${id}`}>{display}</Link>;
    },
  };
}

export function dateColumn(accessor: string, title?: string, opts: { withTime?: boolean } = {}): ColumnDef {
  return {
    accessor,
    title,
    render: (r: any) => {
      const v = accessor.split(".").reduce((acc: any, k: string) => (acc ? acc[k] : undefined), r);
      if (!v) return "";
      const d = new Date(v);
      return opts.withTime ? d.toLocaleString() : d.toLocaleDateString();
    },
  };
}

export function relationNameColumn(accessor: string, title: string, fallbackAccessor?: string): ColumnDef {
  return {
    accessor,
    title,
    render: (r: any) => {
      const relVal = accessor.split(".").reduce((acc: any, k: string) => (acc ? acc[k] : undefined), r);
      if (relVal != null) return relVal;
      if (fallbackAccessor) {
        const fb = fallbackAccessor.split(".").reduce((acc: any, k: string) => (acc ? acc[k] : undefined), r);
        if (fb != null) return fb;
      }
      return "";
    },
  };
}

export function simpleColumn(accessor: string, title?: string, opts: { sortable?: boolean } = {}): ColumnDef {
  return { accessor, title, sortable: opts.sortable };
}

export function nameOrFallbackColumn(accessor: string, resource: string, title = "Name"): ColumnDef {
  return {
    accessor,
    title,
    sortable: true,
    render: (r: any) => {
      const val = r[accessor];
      return val || `${resource.charAt(0).toUpperCase() + resource.slice(1)} #${r.id}`;
    },
  };
}
