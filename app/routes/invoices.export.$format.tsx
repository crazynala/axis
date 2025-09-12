import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { fetchInvoicesFiltered, mapInvoiceExportRows, escapeCsv } from "../utils/invoiceQuery.server";
import * as XLSX from "xlsx";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const format = params.format?.toLowerCase();
  if (!format || !["csv", "tsv", "xlsx"].includes(format)) {
    return json({ error: "Unsupported format" }, { status: 400 });
  }
  const url = new URL(request.url);
  const forCopy = url.searchParams.get("copy") === "1"; // when true, return inline text (no attachment header) to support clipboard fetch
  const scopeAll = url.searchParams.get("scope") !== "page"; // default export all filtered rows
  const { rows } = await fetchInvoicesFiltered(url, { all: scopeAll });
  const exportRows = mapInvoiceExportRows(rows);
  const headers = ["id", "invoice_code", "date", "company", "status", "amount"] as const;

  if (format === "xlsx") {
    const aoa: any[][] = [headers as any];
    for (const r of exportRows) {
      aoa.push([r.id, r.invoiceCode ?? "", r.date ? new Date(r.date as any).toISOString().slice(0, 10) : "", r.companyName ?? "", r.status ?? "", Number(r.amount?.toFixed(2) || 0)]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="invoices-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const sep = format === "tsv" ? "\t" : ",";
  const lines: string[] = [];
  if (format === "csv") {
    lines.push(headers.map((h) => escapeCsv(h)).join(sep));
    for (const r of exportRows) {
      lines.push(
        [
          escapeCsv(r.id),
          escapeCsv(r.invoiceCode ?? ""),
          escapeCsv(r.date ? new Date(r.date as any).toISOString().slice(0, 10) : ""),
          escapeCsv(r.companyName ?? ""),
          escapeCsv(r.status ?? ""),
          escapeCsv(Number(r.amount?.toFixed(2) || 0)),
        ].join(sep)
      );
    }
  } else {
    // TSV: simpler escaping (replace newlines, tabs)
    lines.push(headers.join(sep));
    for (const r of exportRows) {
      const safe = (v: any) => (v == null ? "" : String(v).replace(/[\t\n\r]/g, " "));
      lines.push(
        [
          safe(r.id),
          safe(r.invoiceCode ?? ""),
          safe(r.date ? new Date(r.date as any).toISOString().slice(0, 10) : ""),
          safe(r.companyName ?? ""),
          safe(r.status ?? ""),
          safe(Number(r.amount?.toFixed(2) || 0)),
        ].join(sep)
      );
    }
  }
  // Use CRLF for maximum Excel compatibility when pasting/opening
  const body = lines.join("\r\n");
  const baseName = `invoices-${new Date().toISOString().slice(0, 10)}`;
  const respHeaders: Record<string, string> = {
    "Content-Type": format === "tsv" ? "text/tab-separated-values; charset=utf-8" : "text/csv; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (!forCopy) {
    respHeaders["Content-Disposition"] = `attachment; filename="${baseName}.${format}"`;
  } else {
    // For copy mode, prefer text/plain to maximize clipboard compatibility (tabs preserved)
    if (format === "tsv") respHeaders["Content-Type"] = "text/plain; charset=utf-8";
  }
  return new Response(body, { headers: respHeaders });
}

export const handle = { skipBrowserLog: true };
