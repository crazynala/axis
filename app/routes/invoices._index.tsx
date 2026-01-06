import {
  Link,
  useNavigate,
  useRouteLoaderData,
} from "@remix-run/react";
import { VirtualizedNavDataTable } from "../components/VirtualizedNavDataTable";
import { BreadcrumbSet } from "@aa/timber";
import { Button, Group } from "@mantine/core";
import { useEffect, useMemo, useRef } from "react";
import { useRecords } from "../base/record/RecordContext";
import { FindRibbonAuto } from "../components/find/FindRibbonAuto";
import { invoiceSpec } from "~/modules/invoice/spec";
import { invoiceColumns } from "~/modules/invoice/spec/indexList";
import { useHybridIndexTable } from "~/base/index/useHybridIndexTable";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
  getSavedIndexSearch,
} from "~/hooks/useNavLocation";

// Hybrid index: no loader; relies on layout providing idList + initialRows. We join idList with sparse rowsMap.
export default function InvoicesIndexRoute() {
  useRegisterNavLocation({ includeSearch: true, moduleKey: "invoices" });
  usePersistIndexSearch("/invoices");
  const data = useRouteLoaderData<{
    views?: any[];
    activeView?: string | null;
    activeViewParams?: any | null;
  }>("routes/invoices");
  const navigate = useNavigate();
  const { state, currentId, setCurrentId } = useRecords();
  const findConfig = useMemo(() => invoiceSpec.find.buildConfig(), []);
  const viewMode = !!data?.activeView;
  const {
    records,
    columns,
    onReachEnd,
    atEnd,
    loading,
    fetching,
    total,
  } = useHybridIndexTable({
    module: "invoices",
    initialWindow: 100,
    batchIncrement: 100,
    columns: invoiceColumns,
    viewColumns: data?.activeViewParams?.columns,
    viewMode,
    enableSorting: false,
  });
  // Table auto-sizes via VirtualizedNavDataTable; no per-route height calc needed

  // Auto-expand window to include currentId when landing on index from detail.
  const { idList } = state || ({} as any);
  const ensuredRef = useRef(false);
  useEffect(() => {
    if (!currentId) return;
    if (ensuredRef.current) return;
    if (!idList || !idList.length) return;
    const idx = idList.indexOf(currentId as any);
    if (idx === -1) return;
    // If currentId is outside visible window, request window expansion until it is (use setVisibleCount via requestMore loop)
    if (idx >= records.length) {
      // Increase visible window progressively until we cover idx
      const needed = idx + 1;
      // setVisibleCount isn't exposed here, but requestMore increases in fixed increments; loop until enough
      let safety = 0;
      while (records.length < needed && safety < 20) {
        requestMore();
        safety++;
      }
    }
    // Mark that we've ensured initial inclusion; scrolling handled by table effect when row renders
    ensuredRef.current = true;
  }, [currentId, idList, records.length, requestMore]);

  return (
    <div>
      <Group
        justify="space-between"
        align="center"
        mb="sm"
        data-invoices-header
      >
        {(() => {
          const saved = getSavedIndexSearch("/invoices");
          const hrefInvoices = saved ? `/invoices${saved}` : "/invoices";
          return (
            <BreadcrumbSet
              breadcrumbs={[{ label: "Invoices", href: hrefInvoices }]}
            />
          );
        })()}
        <Group gap="xs">
          <Button
            size="xs"
            variant="default"
            onClick={() => {
              const qs = new URLSearchParams(location.search);
              window.location.href = `/invoices/export/csv?${qs.toString()}`;
            }}
          >
            CSV
          </Button>
          <Button
            size="xs"
            variant="default"
            onClick={() => {
              const qs = new URLSearchParams(location.search);
              window.location.href = `/invoices/export/tsv?${qs.toString()}`;
            }}
          >
            TSV
          </Button>
          <Button
            size="xs"
            variant="default"
            onClick={async () => {
              const qs = new URLSearchParams(location.search);
              qs.set("copy", "1");
              if ((window as any).event && (window as any).event.altKey)
                qs.set("scope", "window");
              let text = "";
              try {
                const resp = await fetch(
                  `/invoices/export/tsv?${qs.toString()}`,
                  { credentials: "same-origin" }
                );
                text = await resp.text();
              } catch (fetchErr) {
                window.prompt("Fetch failed. Copy manually:", String(fetchErr));
                return;
              }
              try {
                await navigator.clipboard.writeText(text);
              } catch {
                window.prompt("Copy TSV (Ctrl/Cmd+C):", text.slice(0, 500000));
              }
            }}
          >
            Copy TSV
          </Button>
          <Button
            size="xs"
            variant="default"
            onClick={() => {
              const qs = new URLSearchParams(location.search);
              window.location.href = `/invoices/export/xlsx?${qs.toString()}`;
            }}
          >
            XLSX
          </Button>
          <Button
            component={Link}
            to="/invoices/new"
            variant="filled"
            color="blue"
          >
            New
          </Button>
        </Group>
      </Group>
      <FindRibbonAuto
        views={data?.views || []}
        activeView={data?.activeView || null}
        activeViewId={data?.activeView || null}
        activeViewParams={data?.activeViewParams || null}
        findConfig={findConfig}
        enableLastView
        columnsConfig={invoiceColumns}
      />
      <VirtualizedNavDataTable
        records={records}
        currentId={currentId as any}
        columns={columns as any}
        onRowClick={(rec: any) => {
          if (rec?.id != null) {
            setCurrentId(rec.id, "mouseRow");
            navigate(`/invoices/${rec.id}`);
          }
        }}
        onRowDoubleClick={(rec: any) => {
          if (rec?.id != null) navigate(`/invoices/${rec.id}`);
        }}
        onReachEnd={onReachEnd}
        footer={
          atEnd ? (
            <span style={{ fontSize: 12 }}>End of results ({total})</span>
          ) : fetching ? (
            <span>Loading…</span>
          ) : (
            <span style={{ fontSize: 11 }}>Scroll to load more…</span>
          )
        }
      />
    </div>
  );
}
