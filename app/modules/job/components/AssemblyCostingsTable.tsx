import {
  Card,
  Divider,
  Group,
  Table,
  Title,
  Text,
  TextInput,
  NativeSelect,
  Tooltip,
  ActionIcon,
  Anchor,
  Badge,
  Button,
  NumberInput,
  Stack,
  Menu,
} from "@mantine/core";
import { HotkeyAwareModal as Modal } from "~/base/hotkeys/HotkeyAwareModal";
import { useState, type ReactNode } from "react";
import { calcPrice } from "~/modules/product/calc/calcPrice";
import { AccordionTable } from "~/components/AccordionTable";
import type { Column } from "~/components/AccordionTable";
import { debugEnabled } from "~/utils/debugFlags";
import type { UseFormRegister } from "react-hook-form";
import {
  IconLink,
  IconMenu2,
  IconTag,
  IconTagFilled,
  IconTrash,
  IconCircleCheck,
  IconCircleOff,
} from "@tabler/icons-react";
import { formatUSD } from "~/utils/format";
import { JumpLink } from "~/components/JumpLink";

const ACTIVITY_USAGE_OPTIONS = [
  { value: "cut", label: "Cut" },
  { value: "sew", label: "Sew" },
  { value: "finish", label: "Finish" },
];

const normalizeActivityUsage = (value?: string | null) => {
  const v = (value || "").toLowerCase();
  if (v === "make") return "finish";
  if (v === "finish") return "finish";
  if (v === "sew") return "sew";
  if (v === "cut") return "cut";
  return "";
};

export type CostingRow = {
  id: number;
  productId: number | null;
  assemblyId?: number | null;
  isMaster?: boolean;
  isChild?: boolean;
  isSingle?: boolean;
  sku?: string | null;
  name?: string | null;
  /** Per-activity usage type: "cut", "sew", or "finish" */
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
  flagIsDisabled?: boolean;
  flagDefinedInProduct?: boolean;
};

export function AssemblyCostingsTable(props: {
  title?: string;
  common: CostingRow[];
  uncommon?: { label: string; rows: CostingRow[] }[];
  /** If true, group rows by productId and show differing quantityPerUnit as child rows under a master */
  accordionByProduct?: boolean;
  /** Enable verbose logging (or set window.__COSTINGS_DEBUG__ = true in DevTools) */
  debug?: boolean;
  /** Enable inline editing for costing fields (QPU + Activity). */
  editableCosting?: boolean;
  /** Decide if a specific row is editable (e.g., based on batch tracking or cut totals). */
  canEditCosting?: (row: CostingRow) => boolean;
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
  /** Optional rows to render in a separate Disabled section */
  disabledRows?: CostingRow[];
  /** Handler for costing actions (enable/disable/delete) */
  onCostingAction?: (
    costingId: number,
    action: "enable" | "disable" | "delete"
  ) => void;
  /** Map of assemblyId -> primaryCostingId */
  primaryCostingIdByAssembly?: Record<number, number | null>;
  /** Setter for primary costing */
  onSetPrimaryCosting?: (costingId: number, assemblyId: number) => void;
}) {
  const {
    title,
    common,
    uncommon = [],
    accordionByProduct,
    debug = false,
    editableCosting,
    canEditCosting,
    qpuValueById,
    onChangeQpu,
    fieldNameForQpu,
    register,
    fieldNameForActivityUsed,
    actions,
    disabledRows,
    onCostingAction,
    primaryCostingIdByAssembly,
    onSetPrimaryCosting,
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
  const editable = (editableCosting ?? false) && hasRHF;
  const canEditFn = canEditCosting;
  const canEditBaseRow = (row: CostingRow) =>
    Boolean(
      editable &&
        !row.flagIsDisabled &&
        typeof canEditFn === "function" &&
        canEditFn(row)
    );

  const isChildRow = (row: CostingRow) => Boolean((row as any).isChild);
  const isMasterRow = (row: CostingRow) => Boolean((row as any).isMaster);
  const isSingleRow = (row: CostingRow) => Boolean((row as any).isSingle);

  const activityEditable = (row: CostingRow) =>
    hasRHF && canEditBaseRow(row) && !isChildRow(row);

  const qpuEditable = (row: CostingRow, grouped: boolean) => {
    if (!hasRHF || !canEditBaseRow(row)) return false;
    if (!grouped) return true;
    if (isChildRow(row)) return true;
    if (isSingleRow(row)) return true;
    return false;
  };

  const compactColumnWidth = "8ch";
  const skuColumnWidth = "18ch";
  const nameColumnWidth = "32ch";

  const disabledStyle = (row: CostingRow) =>
    row.flagIsDisabled ? { textDecoration: "line-through" } : undefined;

  const renderActionsMenu = (row: CostingRow) => {
    if (!onCostingAction) return null;
    return (
      <Menu withinPortal position="bottom-end" shadow="sm">
        <Menu.Target>
          <ActionIcon variant="subtle" aria-label="Costing actions">
            <IconMenu2 size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {row.flagIsDisabled ? (
            <Menu.Item
              leftSection={<IconCircleCheck size={14} />}
              onClick={() => onCostingAction(row.id, "enable")}
            >
              Enable
            </Menu.Item>
          ) : row.flagDefinedInProduct ? (
            <Menu.Item
              leftSection={<IconCircleOff size={14} />}
              onClick={() => onCostingAction(row.id, "disable")}
            >
              Disable
            </Menu.Item>
          ) : (
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => onCostingAction(row.id, "delete")}
            >
              Delete
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    );
  };

  const renderFlatRows = (rows: CostingRow[]) =>
    rows.map((c) => {
      const showActivityInput = activityEditable(c);
      const showQpuInput = qpuEditable(c, false);
      const primaryId =
        primaryCostingIdByAssembly?.[Number(c.assemblyId ?? 0) || 0] ?? null;
      const isPrimary = primaryId != null && primaryId === c.id;
      if (process.env.NODE_ENV !== "production") {
        // temp debug: log primary resolution per row
        // eslint-disable-next-line no-console
        console.debug("[costings] primary debug", {
          rowId: c.id,
          assemblyId: c.assemblyId,
          primaryId,
          isPrimary,
        });
      }
      return (
        <Table.Tr key={`c-${c.id}`}>
          <Table.Td width={40}>
            <ActionIcon
              variant="subtle"
              color={isPrimary ? "var(--mantine-color-bright)" : "gray"}
              aria-label="Primary costing"
              onClick={() =>
                !isPrimary &&
                onSetPrimaryCosting &&
                c.assemblyId &&
                onSetPrimaryCosting(c.id, Number(c.assemblyId))
              }
              disabled={isPrimary}
              style={{ opacity: isPrimary ? 1 : 0.5 }}
              size="xs"
            >
              {isPrimary ? <IconTagFilled /> : <IconTag />}
            </ActionIcon>
          </Table.Td>
          <Table.Td>{c.assemblyId ? `A${c.assemblyId}` : ""}</Table.Td>
          <Table.Td>
            {c.productId ? (
              <JumpLink to={`/products/${c.productId}`} label={c.productId} />
            ) : (
              c.id
            )}
          </Table.Td>
          <Table.Td style={disabledStyle(c)}>{c.sku || ""}</Table.Td>
          <Table.Td style={disabledStyle(c)}>
            {c.name || c.productId || ""}
          </Table.Td>
          {/* Activity (per-activity usage) */}
          <Table.Td
            align="center"
            style={{
              padding: showActivityInput ? 0 : undefined,
            }}
          >
            {showActivityInput ? (
              <NativeSelect
                data={ACTIVITY_USAGE_OPTIONS}
                defaultValue={normalizeActivityUsage(c.activityUsed) || undefined}
                variant="unstyled"
                {...register!(fieldNameForActivityUsed!(c))}
                rightSectionWidth={0}
                styles={{
                  input: {
                    width: "100%",
                    textAlignLast: "center",
                  },
                }}
              />
            ) : (
              <Text style={disabledStyle(c)}>
                {
                  ACTIVITY_USAGE_OPTIONS.find(
                    (opt) => opt.value === normalizeActivityUsage(c.activityUsed)
                  )?.label
                }
              </Text>
            )}
          </Table.Td>
          <Table.Td
            align="center"
            style={{
              padding: showQpuInput ? 0 : undefined,
            }}
          >
            {showQpuInput ? (
              <TextInput
                key={`qpu-${c.id}`}
                type="number"
                variant="unstyled"
                {...register!(fieldNameForQpu!(c), { valueAsNumber: true })}
                styles={{
                  input: {
                    width: "100%",
                    textAlign: "center",
                    padding: 8,
                  },
                }}
              />
            ) : (
              <Text style={disabledStyle(c)}>{c.quantityPerUnit ?? ""}</Text>
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
          <Table.Td align="center">{formatUSD(c.unitCost)}</Table.Td>
          {(() => {
            const out = computeSell(c);
            const showButton =
              out?.meta?.mode === "saleTier" && (c.saleTiers?.length || 0) > 0;
            return (
              <Table.Td align="center">
                <Group gap={6} justify="center">
                  <span>{formatUSD(out?.unitSellPrice)}</span>
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
          <Table.Td align="center">{renderActionsMenu(c)}</Table.Td>
        </Table.Tr>
      );
    });

  let columns: Column<CostingRow>[] = [];

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
  const activeRows = (common || []).filter((r) => !r.flagIsDisabled);
  const disabledList =
    disabledRows ?? (common || []).filter((r) => r.flagIsDisabled);
  const groups = accordionByProduct ? groupByProduct(activeRows) : null;
  const groupedSubrows = new Map<string, CostingRow[]>();

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

  const tableData: CostingRow[] = [];
  if (groups) {
    for (const [key, arr] of groups.entries()) {
      const assemblyIds = new Set(arr.map((r) => r.assemblyId ?? r.id));
      if (arr.length > 1 && assemblyIds.size > 1) {
        const first = arr[0];
        const requiredSum = arr.reduce(
          (sum, row) =>
            sum +
            (Number.isFinite(Number(row.required)) ? Number(row.required) : 0),
          0
        );
        tableData.push({
          ...first,
          required: requiredSum,
          quantityPerUnit: hasQpuVariance(arr)
            ? ("*" as any)
            : (first.quantityPerUnit as any),
          isMaster: true,
        } as CostingRow);
        groupedSubrows.set(
          key,
          arr.map((row, index, all) => ({
            ...row,
            isChild: true,
            _groupPos:
              index === 0
                ? ("first" as const)
                : index === all.length - 1
                ? ("last" as const)
                : ("middle" as const),
            _groupSize: all.length,
          }))
        );
      } else {
        tableData.push(
          ...arr.map((r) => ({ ...r, isSingle: arr.length === 1 } as any))
        );
      }
    }
  } else {
    tableData.push(...activeRows);
  }

  const showAccordion = groupedSubrows.size > 0;

  const tableRowId = (row: CostingRow) => {
    const base =
      row.productId != null ? `product-${row.productId}` : `custom-${row.id}`;
    if (isMasterRow(row)) return `${base}-master`;
    if (isSingleRow(row)) return `${base}-single-${row.id}`;
    return `${base}-row-${row.assemblyId ?? row.id}`;
  };

  const getSubrowsForMaster = (master: CostingRow) => {
    if (!showAccordion) return [];
    const key = String(master.productId ?? `custom-${master.id}`);
    const arr = groupedSubrows.get(key) || [];
    if (DEBUG) {
      console.debug("[CostingsTable] getSubrows", {
        key,
        arrLen: arr.length,
        hasRequiredVariance: hasRequiredVariance(arr),
        hasQpuVariance: hasQpuVariance(arr),
        returning: arr.length,
      });
    }
    return arr as CostingRow[];
  };

  columns = [
    {
      key: "primary",
      header: "",
      width: 20,
      render: (c) => {
        const primaryId =
          primaryCostingIdByAssembly?.[Number(c.assemblyId ?? 0) || 0] ?? null;
        const isPrimary = primaryId != null && primaryId === c.id;
        return (
          <ActionIcon
            variant="subtle"
            color={isPrimary ? "var(--mantine-color-text)" : "gray"}
            aria-label="Primary costing"
            onClick={() =>
              !isPrimary &&
              onSetPrimaryCosting &&
              c.assemblyId &&
              onSetPrimaryCosting(c.id, Number(c.assemblyId))
            }
            // disabled={isPrimary}
            style={{ opacity: isPrimary ? 1 : 0.5 }}
            size="xs"
          >
            {isPrimary ? <IconTagFilled /> : <IconTag />}
          </ActionIcon>
        );
      },
    },
    {
      key: "assembly",
      header: "Assembly",
      width: compactColumnWidth,
      render: (c) =>
        isMasterRow(c) ? "" : c.assemblyId ? `A${c.assemblyId}` : "",
    },
    {
      key: "id",
      header: "ID",
      width: compactColumnWidth,
      render: (c) =>
        c.productId ? (
          <JumpLink to={`/products/${c.productId}`} label={c.productId} />
        ) : (
          c.id
        ),
    },
    {
      key: "sku",
      header: "SKU",
      width: skuColumnWidth,
      render: (c) => <span style={disabledStyle(c)}>{c.sku || ""}</span>,
    },
    {
      key: "name",
      header: "Name",
      width: nameColumnWidth,
      render: (c) => (
        <span style={disabledStyle(c)}>{c.name || c.productId || ""}</span>
      ),
    },
    {
      key: "act",
      header: "Activity",
      width: compactColumnWidth,
      align: "center",
      render: (c) => {
        if (activityEditable(c)) {
          return (
            <NativeSelect
              data={ACTIVITY_USAGE_OPTIONS}
              defaultValue={normalizeActivityUsage(c.activityUsed) || undefined}
              variant="unstyled"
              {...register!(fieldNameForActivityUsed!(c))}
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
        if (isChildRow(c)) return "";
        return (
          <span style={disabledStyle(c)}>
            {
              ACTIVITY_USAGE_OPTIONS.find(
                (opt) => opt.value === normalizeActivityUsage(c.activityUsed)
              )?.label
            }
          </span>
        );
      },
    },
    {
      key: "qpu",
      header: "Qty/Unit",
      width: compactColumnWidth,
      align: "center",
      render: (c) => {
        const grouped = showAccordion && !c.flagIsDisabled;
        if (qpuEditable(c, grouped)) {
          return (
            <TextInput
              key={`qpu-${c.id}`}
              type="number"
              variant="unstyled"
              {...register!(fieldNameForQpu!(c), { valueAsNumber: true })}
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
        return <span style={disabledStyle(c)}>{c.quantityPerUnit ?? ""}</span>;
      },
    },
    {
      key: "req",
      header: "Required",
      width: compactColumnWidth,
      align: "center",
      render: (c) => c.required ?? "",
    },
    {
      key: "loc",
      header: "Loc Stock",
      width: compactColumnWidth,
      align: "center",
      render: (c) =>
        isChildRow(c)
          ? ""
          : c.stockTrackingEnabled
          ? c.stats?.locStock ?? 0
          : "-",
    },
    {
      key: "all",
      header: "All Stock",
      width: compactColumnWidth,
      align: "center",
      render: (c) =>
        isChildRow(c)
          ? ""
          : c.stockTrackingEnabled
          ? c.stats?.allStock ?? 0
          : "-",
    },
    {
      key: "used",
      header: "Used",
      width: compactColumnWidth,
      align: "center",
      render: (c) => (isChildRow(c) ? "" : c.stats?.used ?? 0),
    },
    {
      key: "unit",
      header: "Unit Cost",
      width: compactColumnWidth,
      align: "center",
      render: (c) => (isChildRow(c) ? "" : formatUSD(c.unitCost)),
    },
    {
      key: "sell",
      header: "Sell Price",
      width: compactColumnWidth,
      align: "center",
      render: (c) => {
        const out = computeSell(c);
        const showButton =
          out?.meta?.mode === "saleTier" && (c.saleTiers?.length || 0) > 0;
        return (
          <Group gap={6} justify="center">
            <span>{formatUSD(out?.unitSellPrice)}</span>
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
    {
      key: "actions",
      header: "Actions",
      width: "70px",
      align: "center",
      render: (c) => renderActionsMenu(c),
    },
  ];

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
        const willExpand = arr.length > 1;
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
      <AccordionTable<CostingRow>
        columns={columns}
        data={tableData}
        getRowId={(row) => tableRowId(row)}
        withCaret={showAccordion}
        caretInFirstColumn={showAccordion}
        hideCaretWhenEmpty
        size="sm"
        striped
        getSubrows={showAccordion ? getSubrowsForMaster : undefined}
      />
      {disabledList.length ? (
        <Stack gap="xs" mt="md">
          <Divider />
          <Title order={6}>Disabled Costings</Title>
          <AccordionTable<CostingRow>
            columns={columns}
            data={disabledList}
            getRowId={(row) => tableRowId(row)}
            withCaret={false}
            caretInFirstColumn={false}
            hideCaretWhenEmpty
            size="sm"
            striped
          />
        </Stack>
      ) : null}
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
