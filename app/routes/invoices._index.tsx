import { Link, useLocation, useNavigate, useFetcher } from "@remix-run/react";
import RefactoredNavDataTable from "../components/RefactoredNavDataTable";
import { formatUSD } from "../utils/format";
import { BreadcrumbSet } from "@aa/timber";
import { Button, Group } from "@mantine/core";
import { useEffect, useRef, useState, useMemo } from "react";
import { useRecords } from "../record/RecordContext";
import { SavedViews } from "../components/find/SavedViews";

// Hybrid index: no loader; relies on layout providing idList + initialRows. We join idList with sparse rowsMap.
export default function InvoicesIndexRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const fetcher = useFetcher();
  const { state, addRows } = useRecords();
  const [visibleCount, setVisibleCount] = useState(100); // initial window size matches layout initialRows
  const [tableHeight, setTableHeight] = useState(500);
  const inflightIdsRef = useRef<Set<number>>(new Set());
  const BATCH_INCREMENT = 100;

  // Dynamic height calc
  useEffect(() => {
    const calc = () => {
      const headerEl = document.querySelector(
        "[data-invoices-header]"
      ) as HTMLElement | null;
      const top = headerEl ? headerEl.getBoundingClientRect().bottom : 0;
      const vh = window.innerHeight;
      const marginBottom = 16;
      const h = vh - top - marginBottom;
      if (h > 200) setTableHeight(h);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  // Derive idList & rowsMap
  const idList = state?.module === "invoices" ? state.idList || [] : [];
  const rowsMap =
    state?.module === "invoices" ? state.rowsMap || new Map() : new Map();
  const total = idList.length;
  const windowIds = idList.slice(0, visibleCount);

  // Determine which ids in window are missing rows and fetch them
  const missingIds = useMemo(
    () => windowIds.filter((id) => !rowsMap.has(id)),
    [windowIds, rowsMap]
  );

  useEffect(() => {
    if (!missingIds.length) return;
    // Partition into chunks of up to 100 ids to avoid URL length/bulk
    const chunks: number[][] = [];
    let current: number[] = [];
    for (const id of missingIds) {
      if (typeof id !== "number") continue; // ids are numeric here
      if (inflightIdsRef.current.has(id)) continue;
      inflightIdsRef.current.add(id);
      current.push(id);
      if (current.length >= 100) {
        chunks.push(current);
        current = [];
      }
    }
    if (current.length) chunks.push(current);
    if (!chunks.length) return;
    let cancelled = false;
    (async () => {
      for (const chunk of chunks) {
        try {
          const resp = await fetch(`/invoices/rows?ids=${chunk.join(",")}`);
          const data = await resp.json();
          if (!cancelled && data.rows?.length) {
            addRows("invoices", data.rows, { updateRecordsArray: true });
          }
        } catch (err) {
          // Swallow errors for individual chunk; could add toast later
        } finally {
          chunk.forEach((id) => inflightIdsRef.current.delete(id));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [missingIds, addRows]);

  // Build records array from window ids (fallback placeholders if still missing)
  const records = useMemo(
    () =>
      windowIds.map((id) => {
        const row = rowsMap.get(id);
        return (
          row || {
            id,
            invoiceCode: "…",
            date: null,
            status: "",
            company: { name: "" },
            amount: 0,
            __loading: true,
          }
        );
      }),
    [windowIds, rowsMap]
  );

  const atEnd = visibleCount >= total;
  const loadingWindowExpansion = fetcher.state !== "idle"; // not used yet but reserved

  const requestMore = () => {
    if (atEnd) return;
    setVisibleCount((c) => Math.min(c + BATCH_INCREMENT, total));
  };

  return (
    <div>
      <Group
        justify="space-between"
        align="center"
        mb="sm"
        data-invoices-header
      >
        <BreadcrumbSet
          breadcrumbs={[{ label: "Invoices", href: "/invoices" }]}
        />
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
      <SavedViews views={[]} activeView={null} />
      <RefactoredNavDataTable
        module="invoices"
        records={records}
        height={tableHeight}
        columns={[
          {
            accessor: "amount",
            title: "Amount",
            render: (r: any) => formatUSD(r.amount),
          },
          { accessor: "status" },
        ]}
        fetching={missingIds.length > 0}
        onActivate={(rec: any) => {
          if (rec?.id != null) navigate(`/invoices/${rec.id}`);
        }}
        onReachEnd={() => requestMore()}
        footer={
          atEnd ? (
            <span style={{ fontSize: 12 }}>End of results ({total})</span>
          ) : missingIds.length ? (
            <span>Loading rows…</span>
          ) : (
            <span style={{ fontSize: 11 }}>Scroll to load more…</span>
          )
        }
      />
    </div>
  );
}
