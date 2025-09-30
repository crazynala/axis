import { formatMoney, formatQuantity } from "../../utils/format";
import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// Simple A4 PDF for PO. Keep styles modest for portability.
const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 36,
    fontSize: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  brand: { fontSize: 14, fontWeight: 700 },
  meta: { textAlign: "right" },
  row: { flexDirection: "row" },
  grid: { flexDirection: "row", gap: 12, marginBottom: 12 },
  box: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    padding: 8,
    flex: 1,
  },
  small: { fontSize: 8, color: "#555" },
  table: {
    width: "100%",
    borderStyle: "solid",
    borderColor: "#eee",
    borderWidth: 1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  tableRow: { margin: 0, flexDirection: "row" },
  tableCol: {
    borderStyle: "solid",
    borderColor: "#eee",
    borderBottomWidth: 1,
    borderRightWidth: 1,
    padding: 4,
  },
  th: { fontWeight: 700 },
  footerRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
});

export function PurchaseOrderPdf({
  po,
  subtotal,
}: {
  po: any;
  subtotal: number;
}) {
  const lines = Array.isArray(po?.lines) ? po.lines : [];
  return (
    <Document title={`PO ${po?.id || ""}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>
            {po?.company?.name || "Purchase Order"}
          </Text>
          <View style={styles.meta}>
            <Text>Purchase Order</Text>
            <Text>PO #: {po?.id ?? ""}</Text>
            <Text>
              Date:{" "}
              {po?.date ? new Date(po.date).toISOString().slice(0, 10) : ""}
            </Text>
          </View>
        </View>

        <View style={styles.grid}>
          <View style={styles.box}>
            <Text style={styles.small}>Vendor</Text>
            <Text>{po?.company?.name ?? ""}</Text>
            {po?.company?.address ? <Text>{po.company.address}</Text> : null}
            {po?.company &&
            (po.company.city || po.company.state || po.company.zip) ? (
              <Text>
                {[po.company.city, po.company.state, po.company.zip]
                  .filter(Boolean)
                  .join(", ")}
              </Text>
            ) : null}
            {po?.company?.country ? <Text>{po.company.country}</Text> : null}
            {po?.company?.email ? <Text>Email: {po.company.email}</Text> : null}
          </View>
          <View style={styles.box}>
            <Text style={styles.small}>Ship To</Text>
            <Text>{po?.consignee?.name ?? po?.location?.name ?? ""}</Text>
            {po?.location?.notes ? <Text>{po.location.notes}</Text> : null}
          </View>
        </View>

        {/* Table header */}
        <View style={[styles.table, { width: "100%" }]}>
          <View style={styles.tableRow}>
            <View style={[styles.tableCol, { width: "16%" }]}>
              <Text style={styles.th}>SKU</Text>
            </View>
            <View style={[styles.tableCol, { width: "44%" }]}>
              <Text style={styles.th}>Description</Text>
            </View>
            <View style={[styles.tableCol, { width: "12%" }]}>
              <Text style={styles.th}>Qty</Text>
            </View>
            <View style={[styles.tableCol, { width: "14%" }]}>
              <Text style={styles.th}>Unit Cost</Text>
            </View>
            <View style={[styles.tableCol, { width: "14%" }]}>
              <Text style={styles.th}>Line Total</Text>
            </View>
          </View>

          {lines.map((ln: any) => {
            const qty = Number(ln.quantityOrdered ?? ln.quantity ?? 0);
            const unit = Number(ln.priceCost ?? 0);
            const line = qty * unit;
            return (
              <View style={styles.tableRow} key={ln.id}>
                <View style={[styles.tableCol, { width: "16%" }]}>
                  <Text>{ln.product?.sku ?? ln.productSkuCopy ?? ""}</Text>
                </View>
                <View style={[styles.tableCol, { width: "44%" }]}>
                  <Text>{ln.product?.name ?? ln.productNameCopy ?? ""}</Text>
                </View>
                <View style={[styles.tableCol, { width: "12%" }]}>
                  <Text>{formatQuantity(qty)}</Text>
                </View>
                <View style={[styles.tableCol, { width: "14%" }]}>
                  <Text>{unit ? formatMoney(unit) : ""}</Text>
                </View>
                <View style={[styles.tableCol, { width: "14%" }]}>
                  <Text>{line ? formatMoney(line) : ""}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.footerRow}>
          <Text>Subtotal: {formatMoney(subtotal)}</Text>
        </View>

        {po?.notes ? (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.small}>Notes: {po.notes}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
