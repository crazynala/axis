import { formatMoney, formatQuantity } from "../utils/format";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => [{ title: data ? `PO ${data.purchaseOrder.id} · Print` : "PO · Print" }];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Invalid id", { status: 400 });
  const purchaseOrder = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      lines: { include: { product: true } },
      company: true, // vendor
      consignee: true,
      location: true,
    },
  });
  if (!purchaseOrder) throw new Response("Not found", { status: 404 });

  const subtotal = (purchaseOrder.lines || []).reduce((acc: number, l: any) => {
    const qty = Number(l.quantityOrdered ?? l.quantity ?? 0);
    const unit = Number(l.priceCost ?? 0);
    return acc + qty * unit;
  }, 0);

  return json({ purchaseOrder, subtotal });
}

export default function POPrintPage() {
  const { purchaseOrder, subtotal } = useLoaderData<typeof loader>();
  const po = purchaseOrder as any;
  return (
    <div>
      <style>{`
        @page { size: A4; margin: 18mm; }
        * { box-sizing: border-box; }
        body:has(&) { background: #f6f7f8; }
        .page { background: white; box-shadow: 0 2px 12px rgba(0,0,0,.08); margin: 0 auto; width: 210mm; min-height: 297mm; padding: 18mm; color: #111; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-size: 11pt; }
        header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 12mm; }
        .brand { font-weight: 700; font-size: 16pt; }
        .meta { text-align: right; }
        h1 { font-size: 16pt; margin: 0 0 2mm; }
        .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-bottom: 10mm; }
        .box { border: 1px solid #ddd; border-radius: 6px; padding: 6mm; }
        table { width:100%; border-collapse: collapse; }
        th, td { border-bottom: 1px solid #eee; padding: 6px 4px; vertical-align: top; }
        th { text-align: left; font-weight: 600; }
        tfoot td { border-top: 2px solid #111; font-weight: 700; }
        .small { font-size: 9pt; color:#555; }
        @media print { .page { box-shadow: none; width: auto; min-height: auto; padding: 0; } }
      `}</style>
      <div className="page">
        <header>
          <div className="brand">{po.company?.name || "Purchase Order"}</div>
          <div className="meta">
            <div>
              <strong>Purchase Order</strong>
            </div>
            <div>PO #: {po.id}</div>
            <div>Date: {po.date ? new Date(po.date).toISOString().slice(0, 10) : ""}</div>
          </div>
        </header>
        <div className="grid">
          <div className="box">
            <div className="small">Vendor</div>
            <div>
              <strong>{po.company?.name ?? ""}</strong>
            </div>
            {po.company?.address && <div>{po.company.address}</div>}
            {(po.company?.city || po.company?.state || po.company?.zip) && <div>{[po.company.city, po.company.state, po.company.zip].filter(Boolean).join(", ")}</div>}
            {po.company?.country && <div>{po.company.country}</div>}
            {po.company?.email && <div className="small">Email: {po.company.email}</div>}
          </div>
          <div className="box">
            <div className="small">Ship To</div>
            <div>
              <strong>{po.consignee?.name ?? po.location?.name ?? ""}</strong>
            </div>
            {po.location?.notes && <div>{po.location.notes}</div>}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: "12%" }}>SKU</th>
              <th>Description</th>
              <th style={{ width: "10%" }}>Qty</th>
              <th style={{ width: "14%" }}>Unit Cost</th>
              <th style={{ width: "14%" }}>Line Total</th>
            </tr>
          </thead>
          <tbody>
            {(po.lines || []).map((ln: any) => {
              const qty = Number(ln.quantityOrdered ?? ln.quantity ?? 0);
              const unit = Number(ln.priceCost ?? 0);
              const line = qty * unit;
              return (
                <tr key={ln.id}>
                  <td>{ln.product?.sku ?? ln.productSkuCopy ?? ""}</td>
                  <td>{ln.product?.name ?? ln.productNameCopy ?? ""}</td>
                  <td>{formatQuantity(qty)}</td>
                  <td>{unit ? formatMoney(unit) : ""}</td>
                  <td>{line ? formatMoney(line) : ""}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}></td>
              <td>Subtotal</td>
              <td>{formatMoney(subtotal)}</td>
            </tr>
          </tfoot>
        </table>

        {po.notes && (
          <div style={{ marginTop: "10mm" }} className="small">
            <strong>Notes:</strong> {po.notes}
          </div>
        )}
      </div>
    </div>
  );
}
