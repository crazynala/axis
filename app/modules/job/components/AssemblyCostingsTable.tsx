import {
  Card,
  Divider,
  Group,
  Table,
  Title,
  Modal,
  Text,
  TextInput,
  NativeSelect,
  Tooltip,
  ActionIcon,
} from "@mantine/core";
import { useState, type ReactNode } from "react";
import { calcPrice } from "~/modules/product/calc/calcPrice";
import { ExternalLink } from "~/components/ExternalLink";
import { AccordionTable } from "~/components/AccordionTable";
import type { Column } from "~/components/AccordionTable";
import { debugEnabled } from "~/utils/debugFlags";
import type { UseFormRegister } from "react-hook-form";
import { IconLink } from "@tabler/icons-react";

export type CostingRow = {
  id: number;
  productId: number | null;
  assemblyId?: number | null;
  isMaster?: boolean;
  isChild?: boolean;
  sku?: string | null;
  name?: string | null;
  /** Per-activity usage type: "cut" or "make" */
  activityUsed?: string | null;
  quantityPerUnit?: number | null;
  unitCost?: number | null;
  required?: number | null;
  stats?: { locStock: number; allStock: number; used: number };
  stockTrackingEnabled?: boolean; // for stock columns display
  batchTrackingEnabled?: boolean; // for QPU edit gating
  // New: pricing inputs for dynamic sell calculation
  fixedSell?: number | null; // costing.salePricePerItem when set
  taxRate?: number | null; // optional tax rate; default 0 if missing
  saleTiers?: Array<{ minQty: number; unitPrice: number }>; // pre-tax
  priceMultiplier?: number | null; // from job.company
  manualSalePrice?: number | null; // override for calc
  marginPct?: number | null; // optional margin when falling back to cost+margin
};

export function AssemblyCostingsTable(props: {
  title?: string;
  common: CostingRow[];
  uncommon?: { label: string; rows: CostingRow[] }[];
  /** If true, group rows by productId and show differing quantityPerUnit as child rows under a master */
  accordionByProduct?: boolean;
  /** Enable verbose logging (or set window.__COSTINGS_DEBUG__ = true in DevTools) */
  debug?: boolean;
  /** Enable inline editing for costing fields (QPU + Activity). Back-compat: editableQpu */
  editableCosting?: boolean;
  /** Decide if a specific row is editable (e.g., based on batch tracking or cut totals). Back-compat: canEditQpu */
  canEditCosting?: (row: CostingRow) => boolean;
  /** Deprecated: use editableCosting */
  editableQpu?: boolean;
  /** Deprecated: use canEditCosting */
  canEditQpu?: (row: CostingRow) => boolean;
  /** Controlled values for Qty/Unit, keyed by costing id */
  qpuValueById?: Record<number, number>;
  /** Change handler for Qty/Unit edits */
  onChangeQpu?: (id: number, value: number) => void;
  /** Build the RHF field name for a row (e.g., qpuById.123) */
  fieldNameForQpu?: (row: CostingRow) => string;
  /** RHF register to bind inputs without Controller */
  register?: UseFormRegister<any>;
  /** Build the RHF field name for activity used (e.g., activity.123) */
  fieldNameForActivityUsed?: (row: CostingRow) => string;
  /** Optional action elements to render in the header (e.g., Add Costing button) */
  actions?: ReactNode | ReactNode[];
}) {
  const {
    title = "Costings",
    common,
    uncommon,
    accordionByProduct = true,
    debug = false,
    editableCosting,
    canEditCosting,
    editableQpu,
    canEditQpu,
    qpuValueById,
    onChangeQpu,
    fieldNameForQpu,
    register,
    fieldNameForActivityUsed,
    actions,
  } = props;

  const DEBUG = debugEnabled("costingsTable") || !!debug;

  const computeSell = (c: CostingRow) => {
    if (c.isChild)
      return {
        unitSellPrice: "",
        meta: undefined as any,
      } as any;
    if (c.fixedSell != null && c.fixedSell !== undefined)
      return { unitSellPrice: c.fixedSell, meta: { mode: "manual" } } as any;
    const qty = Number(c.required ?? 1) || 1;
    const taxRate = Number(c.taxRate ?? 0) || 0;
    const priceMultiplier = Number(c.priceMultiplier ?? 1) || 1;
    const saleTiers = (c.saleTiers || [])
      .slice()
      .sort((a, b) => a.minQty - b.minQty);
    const out = calcPrice({
      baseCost: Number(c.unitCost ?? 0) || 0,
      qty,
      taxRate,
      saleTiers,
      priceMultiplier,
      manualSalePrice:
        c.manualSalePrice != null ? Number(c.manualSalePrice) : undefined,
      marginPct: c.marginPct != null ? Number(c.marginPct) : undefined,
    });
    return out;
  };

  const hasRHF = !!register && !!fieldNameForQpu && !!fieldNameForActivityUsed;
  const editable = (editableCosting ?? editableQpu ?? false) && hasRHF;
  const canEditFn = canEditCosting ?? canEditQpu;
  const canEditRow = (row: CostingRow) =>
    Boolean(
      editable &&
        !row.isChild &&
        typeof canEditFn === "function" &&
        canEditFn(row)
    );

  const renderFlatRows = (rows: CostingRow[]) =>
    rows.map((c) => (
      <Table.Tr key={`c-${c.id}`}>
        <Table.Td>{c.assemblyId ? `A${c.assemblyId}` : ""}</Table.Td>
        <Table.Td>
          {c.productId ? (
            <ExternalLink href={`/products/${c.productId}`}>
              {c.productId}
            </ExternalLink>
          ) : (
            c.id
          )}
        </Table.Td>
        <Table.Td>{c.sku || ""}</Table.Td>
        <Table.Td>{c.name || c.productId || ""}</Table.Td>
        {/* Activity (per-activity usage) */}
        <Table.Td
          align="center"
          style={{
            padding: editable && !(c as any).isChild ? 0 : undefined,
          }}
        >
          {hasRHF ? (
            <NativeSelect
              data={[
                { value: "cut", label: "Cut" },
                { value: "make", label: "Make" },
              ]}
              disabled={!canEditRow(c)}
              variant="unstyled"
              {...(hasRHF ? register!(fieldNameForActivityUsed!(c)) : {})}
              rightSectionWidth={0}
              styles={{
                input: {
                  width: "100%",
                  textAlignLast: "center",
                },
              }}
            />
          ) : (
            <Text>
              {c.activityUsed === "cut"
                ? "Cut"
                : c.activityUsed === "make"
                ? "Make"
                : ""}
            </Text>
          )}
        </Table.Td>
        <Table.Td
          align="center"
          style={{
            padding: editable && !(c as any).isChild ? 0 : undefined,
          }}
        >
          {hasRHF ? (
            <TextInput
              key={`qpu-${c.id}`}
              type="number"
              readOnly={!canEditRow(c)}
              variant="unstyled"
              {...(hasRHF
                ? register!(fieldNameForQpu!(c), { valueAsNumber: true })
                : {})}
              styles={{
                input: {
                  width: "100%",
                  textAlign: "center",
                  padding: 8,
                },
              }}
            />
          ) : (
            <Text>{c.quantityPerUnit ?? ""}</Text>
          )}
        </Table.Td>
        <Table.Td align="center">{c.required ?? ""}</Table.Td>
        <Table.Td align="center">
          {c.stockTrackingEnabled ? c.stats?.locStock ?? 0 : "-"}
        </Table.Td>
        <Table.Td align="center">
          {c.stockTrackingEnabled ? c.stats?.allStock ?? 0 : "-"}
        </Table.Td>
        <Table.Td align="center">{c.stats?.used ?? 0}</Table.Td>
        <Table.Td align="center">{c.unitCost ?? ""}</Table.Td>
        {(() => {
          const out = computeSell(c);
          const showButton =
            out?.meta?.mode === "saleTier" && (c.saleTiers?.length || 0) > 0;
          return (
            <Table.Td align="center">
              <Group gap={6} justify="center">
                <span>{out?.unitSellPrice ?? ""}</span>
                {showButton ? (
                  <PriceTiersButton
                    tiers={(c.saleTiers || [])
                      .slice()
                      .sort((a, b) => a.minQty - b.minQty)}
                    picked={out.meta?.tier}
                  />
                ) : null}
              </Group>
            </Table.Td>
          );
        })()}
      </Table.Tr>
    ));

  let columns: Column<CostingRow>[] = [
    {
      key: "assembly",
      header: "Assembly",
      width: 100,
      render: (c) => (c.isMaster ? "" : c.assemblyId ? `A${c.assemblyId}` : ""),
    },
    {
      key: "id",
      header: "ID",
      width: 100,
      render: (c) =>
        c.productId ? (
          <ExternalLink href={`/products/${c.productId}`}>
            {c.productId}
          </ExternalLink>
        ) : (
          c.id
        ),
    },
    { key: "sku", header: "SKU", width: 140, render: (c) => c.sku || "" },
    { key: "name", header: "Name", render: (c) => c.name || c.productId || "" },
    {
      key: "act",
      header: "Activity",
      width: 100,
      align: "center",
      render: (c) => {
        // In accordion (group) view, allow editing on child rows
        if (hasRHF && (c as any).isChild) {
          return (
            <NativeSelect
              data={[
                { value: "cut", label: "Cut" },
                { value: "make", label: "Make" },
              ]}
              disabled={!canEditRow(c)}
              variant="unstyled"
              {...(hasRHF ? register!(fieldNameForActivityUsed!(c)) : {})}
              rightSectionWidth={0}
              styles={{
                input: {
                  width: "100%",
                  textAlignLast: "center",
                },
              }}
            />
          );
        }
        return (c as any).isChild
          ? ""
          : c.activityUsed === "cut"
          ? "Cut"
          : c.activityUsed === "make"
          ? "Make"
          : "";
      },
    },
    {
      key: "qpu",
      header: "Qty/Unit",
      width: 100,
      align: "center",
      render: (c) => {
        // In accordion (group) view, allow editing on child rows
        if (hasRHF && (c as any).isChild) {
          return (
            <TextInput
              key={`qpu-${c.id}`}
              type="number"
              readOnly={!canEditRow(c)}
              variant="unstyled"
              {...(hasRHF
                ? register!(fieldNameForQpu!(c), { valueAsNumber: true })
                : {})}
              styles={{
                input: {
                  width: "100%",
                  textAlign: "center",
                  padding: 8,
                },
              }}
            />
          );
        }
        return c.quantityPerUnit ?? "";
      },
    },
    {
      key: "req",
      header: "Required",
      width: 100,
      align: "center",
      render: (c) => c.required ?? "",
    },
    {
      key: "loc",
      header: "Loc Stock",
      width: 100,
      align: "center",
      render: (c) => (c.isChild ? "" : c.stats?.locStock ?? 0),
    },
    {
      key: "all",
      header: "All Stock",
      width: 100,
      align: "center",
      render: (c) => (c.isChild ? "" : c.stats?.allStock ?? 0),
    },
    {
      key: "used",
      header: "Used",
      width: 100,
      align: "center",
      render: (c) => (c.isChild ? "" : c.stats?.used ?? 0),
    },
    {
      key: "unit",
      header: "Unit Cost",
      width: 120,
      align: "center",
      render: (c) => (c.isChild ? "" : c.unitCost ?? ""),
    },
    {
      key: "sell",
      header: "Sell Price",
      width: 140,
      align: "center",
      render: (c) => {
        const out = computeSell(c);
        const showButton =
          out?.meta?.mode === "saleTier" && (c.saleTiers?.length || 0) > 0;
        return (
          <Group gap={6} justify="center">
            <span>{out?.unitSellPrice ?? ""}</span>
            {showButton ? (
              <PriceTiersButton
                tiers={(c.saleTiers || [])
                  .slice()
                  .sort((a, b) => a.minQty - b.minQty)}
                picked={out.meta?.tier}
              />
            ) : null}
          </Group>
        );
      },
    },
  ];

  function PriceTiersButton({
    tiers,
    picked,
  }: {
    tiers: Array<{ minQty: number; unitPrice: number }>;
    picked?: { minQty: number; unitPrice: number } | null | undefined;
  }) {
    const [opened, setOpened] = useState(false);
    return (
      <>
        {/* eslint-disable-next-line jsx-a11y/aria-role */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpened(true);
          }}
          title="View sale tiers"
          style={{
            background: "transparent",
            border: 0,
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 700 }}>≡</span>
        </button>
        <Modal
          opened={opened}
          onClose={() => setOpened(false)}
          title="Sale price tiers"
          centered
        >
          <Table withTableBorder withColumnBorders striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Min Qty</Table.Th>
                <Table.Th>Unit Price</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tiers.map((t, idx) => {
                const isPicked =
                  picked &&
                  t.minQty === picked.minQty &&
                  t.unitPrice === picked.unitPrice;
                return (
                  <Table.Tr
                    key={`tier-${idx}`}
                    style={isPicked ? { fontWeight: 700 } : undefined}
                  >
                    <Table.Td align="center">{t.minQty}</Table.Td>
                    <Table.Td align="center">{t.unitPrice}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Modal>
      </>
    );
  }

  // If you want to visually indicate subrows' assembly, prepend that to the name column render when rendering as a child.

  // Group rows by productId when enabled
  const groupByProduct = (rows: CostingRow[]) => {
    const map = new Map<string, CostingRow[]>();
    for (const r of rows) {
      const key = String(r.productId ?? `custom-${r.id}`);
      const arr = map.get(key) || [];
      arr.push(r);
      map.set(key, arr);
    }
    return map;
  };
  const groups = accordionByProduct ? groupByProduct(common) : null;

  // We no longer use 'required' variance to break into subrows; keep helper only for debugging output
  const hasRequiredVariance = (arr: CostingRow[]) => {
    const uniq = new Set<number>(
      arr.map((r) =>
        Number.isFinite(Number(r.required)) ? Number(r.required) : 0
      )
    );
    return uniq.size > 1;
  };
  const hasQpuVariance = (arr: CostingRow[]) => {
    const uniq = new Set<number>(
      arr.map((r) =>
        Number.isFinite(Number(r.quantityPerUnit))
          ? Number(r.quantityPerUnit)
          : 0
      )
    );
    return uniq.size > 1;
  };

  const showAccordion = !!(
    groups && Array.from(groups.values()).some((arr) => arr.length > 1)
  );

  if (DEBUG) {
    console.groupCollapsed("[CostingsTable] input & grouping", {
      rows: common.length,
      accordionByProduct,
      groups: groups ? groups.size : 0,
      showAccordion,
    });
    if (groups) {
      for (const [k, arr] of groups.entries()) {
        const reqSet = Array.from(
          new Set(
            arr.map((r) =>
              Number.isFinite(Number(r.required)) ? Number(r.required) : 0
            )
          )
        );
        const qpuSet = Array.from(
          new Set(
            arr.map((r) =>
              Number.isFinite(Number(r.quantityPerUnit))
                ? Number(r.quantityPerUnit)
                : 0
            )
          )
        );
        const willExpand = arr.length > 1 && qpuSet.length > 1;
        console.debug(" group", k, {
          count: arr.length,
          requiredValues: reqSet,
          qpuValues: qpuSet,
          willExpand,
        });
      }
    }
    console.groupEnd();
  }

  return (
    <Card withBorder padding="md">
      <Card.Section inheritPadding py="xs">
        <Group justify="space-between" align="center">
          <Title order={4}>{title}</Title>
          {actions ? (
            <Group gap="xs">
              {Array.isArray(actions)
                ? actions.map((node, i) => <span key={`act-${i}`}>{node}</span>)
                : actions}
            </Group>
          ) : null}
        </Group>
      </Card.Section>
      {!showAccordion ? (
        <Table withTableBorder withColumnBorders highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              {columns.map((c) => (
                <Table.Th
                  key={c.key}
                  style={{ width: c.width, textAlign: c.align || "left" }}
                >
                  {c.header}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {common.map((c) => (
              <Table.Tr key={`c-${c.id}`}>
                <Table.Td>{c.assemblyId ? `A${c.assemblyId}` : ""}</Table.Td>
                <Table.Td>
                  {c.productId ? (
                    <ExternalLink href={`/products/${c.productId}`}>
                      {c.productId}
                    </ExternalLink>
                  ) : (
                    c.id
                  )}
                </Table.Td>
                <Table.Td>{c.sku || ""}</Table.Td>
                <Table.Td>{c.name || c.productId || ""}</Table.Td>
                {/* Activity (per-activity usage) */}
                <Table.Td
                  align="center"
                  style={{
                    padding: editable && !(c as any).isChild ? 0 : undefined,
                  }}
                >
                  {hasRHF ? (
                    <NativeSelect
                      data={[
                        { value: "cut", label: "Cut" },
                        { value: "make", label: "Make" },
                      ]}
                      disabled={!canEditRow(c)}
                      variant="unstyled"
                      {...(hasRHF
                        ? register!(fieldNameForActivityUsed!(c))
                        : {})}
                      rightSectionWidth={0}
                      styles={{
                        input: {
                          width: "100%",
                          textAlignLast: "center",
                        },
                      }}
                    />
                  ) : (
                    <Text>
                      {c.activityUsed === "cut"
                        ? "Cut"
                        : c.activityUsed === "make"
                        ? "Make"
                        : ""}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td
                  align="center"
                  style={{
                    padding: editable && !(c as any).isChild ? 0 : undefined,
                  }}
                >
                  {hasRHF ? (
                    <TextInput
                      key={`qpu-${c.id}`}
                      type="number"
                      readOnly={!canEditRow(c)}
                      variant="unstyled"
                      {...(hasRHF
                        ? register!(fieldNameForQpu!(c), {
                            valueAsNumber: true,
                          })
                        : {})}
                      styles={{
                        input: {
                          width: "100%",
                          textAlign: "center",
                          padding: 8,
                        },
                      }}
                    />
                  ) : (
                    <Text>{c.quantityPerUnit ?? ""}</Text>
                  )}
                </Table.Td>
                <Table.Td align="center">{c.required ?? ""}</Table.Td>
                <Table.Td align="center">
                  {c.stockTrackingEnabled ? c.stats?.locStock ?? 0 : "-"}
                </Table.Td>
                <Table.Td align="center">
                  {c.stockTrackingEnabled ? c.stats?.allStock ?? 0 : "-"}
                </Table.Td>
                <Table.Td align="center">{c.stats?.used ?? 0}</Table.Td>
                <Table.Td align="center">{c.unitCost ?? ""}</Table.Td>
                {(() => {
                  const out = computeSell(c);
                  const showButton =
                    out?.meta?.mode === "saleTier" &&
                    (c.saleTiers?.length || 0) > 0;
                  return (
                    <Table.Td align="center">
                      <Group gap={6} justify="center">
                        <span>{out?.unitSellPrice ?? ""}</span>
                        {showButton ? (
                          <PriceTiersButton
                            tiers={(c.saleTiers || [])
                              .slice()
                              .sort((a, b) => a.minQty - b.minQty)}
                            picked={out.meta?.tier}
                          />
                        ) : null}
                      </Group>
                    </Table.Td>
                  );
                })()}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <AccordionTable<CostingRow>
          columns={columns}
          data={Array.from(groups!.values()).map((arr) => {
            if (arr.length === 1) return arr[0];
            const first = arr[0];
            const requiredSum = arr.reduce(
              (s, r) =>
                s +
                (Number.isFinite(Number(r.required)) ? Number(r.required) : 0),
              0
            );
            // Master row: aggregate 'required'; if no variance, it will render as a plain row (no caret)
            return {
              ...first,
              id: first.id,
              required: requiredSum,
              // If QPU differs among children, show '*' on master to indicate mixed values
              quantityPerUnit: hasQpuVariance(arr)
                ? ("*" as any)
                : (first.quantityPerUnit as any),
              isMaster: true,
            } as CostingRow;
          })}
          getRowId={(r) => `${r.productId ?? `custom-${r.id}`}`}
          withCaret
          caretInFirstColumn
          hideCaretWhenEmpty
          size="sm"
          striped
          // Child rows: show all entries for the group if more than 1 and variance exists
          getSubrows={(master) => {
            const key = String(master.productId ?? `custom-${master.id}`);
            const arr = groups!.get(key) || [];
            // Always show children when group has more than one row so they can be edited per-assembly
            const children = arr.length > 1 ? arr : [];
            const marked = children.map((r, i) => ({
              ...r,
              isChild: true,
              _groupPos:
                i === 0
                  ? ("first" as const)
                  : i === children.length - 1
                  ? ("last" as const)
                  : ("middle" as const),
              _groupSize: children.length,
            }));
            if (DEBUG) {
              console.debug("[CostingsTable] getSubrows", {
                key,
                arrLen: arr.length,
                hasRequiredVariance: hasRequiredVariance(arr),
                hasQpuVariance: hasQpuVariance(arr),
                returning: marked.length,
              });
            }
            return marked as any;
          }}
        />
      )}
      {!!(uncommon && uncommon.length) && (
        <div style={{ marginTop: 16 }}>
          {uncommon!.map((g, i) => (
            <div key={`u-${i}`} style={{ marginTop: i ? 16 : 0 }}>
              <Group justify="space-between" mb="xs">
                <Title order={6}>{g.label}</Title>
              </Group>
              <Table striped withTableBorder withColumnBorders highlightOnHover>
                <Table.Tbody>{renderFlatRows(g.rows)}</Table.Tbody>
              </Table>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
