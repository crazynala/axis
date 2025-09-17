import { Link, useLocation, useNavigate } from "@remix-run/react";
import NavDataTable from "../components/RefactoredNavDataTable";
import { formatUSD } from "../utils/format";
import { BreadcrumbSet } from "@aa/timber";
import { Button, Group } from "@mantine/core";
import { useEffect, useState, useRef } from "react";
import { useRecords } from "../record/RecordContext";
import { SavedViews } from "../components/find/SavedViews";
import { useHybridWindow } from "../record/useHybridWindow";

// Hybrid index: no loader; relies on layout providing idList + initialRows. We join idList with sparse rowsMap.
export default function InvoicesIndexRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, currentId } = useRecords();
  const { records, atEnd, loading, fetching, requestMore, total } =
    useHybridWindow({
      module: "invoices",
      initialWindow: 100,
      batchIncrement: 100,
    });
  const [tableHeight, setTableHeight] = useState(500);
  const TABLE_SELECTOR = "[data-invoices-table-container]";

  // Dynamic height calc: measure from table container top instead of header bottom
  useEffect(() => {
    const calc = () => {
      const tableWrap = document.querySelector(
        TABLE_SELECTOR
      ) as HTMLElement | null;
      if (!tableWrap) return;
      const top = tableWrap.getBoundingClientRect().top;
      const vh = window.innerHeight;
      const marginBottom = 24;
      const h = vh - top - marginBottom;
      if (h > 200) setTableHeight(h);
    };
    const obs = new ResizeObserver(() => calc());
    const headerEl = document.querySelector("[data-invoices-header]");
    if (headerEl) obs.observe(headerEl);
    calc();
    window.addEventListener("resize", calc);
    return () => {
      window.removeEventListener("resize", calc);
      obs.disconnect();
    };
  }, []);

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
      <div data-invoices-table-container>
        <NavDataTable
          module="invoices"
          records={records}
          height={tableHeight}
          columns={[
            {
              accessor: "id",
              render: (r: any) => <Link to={`/invoices/${r.id}`}>{r.id}</Link>,
            },
            { accessor: "invoiceCode", title: "Code" },
            {
              accessor: "date",
              render: (r: any) =>
                r.date ? new Date(r.date).toLocaleDateString() : "",
            },
            {
              accessor: "company.name",
              title: "Company",
              render: (r: any) => r.company?.name ?? "",
            },
            {
              accessor: "amount",
              title: "Amount",
              render: (r: any) => formatUSD(r.amount),
            },
            { accessor: "status" },
          ]}
          fetching={fetching}
          onActivate={(rec: any) => {
            if (rec?.id != null) navigate(`/invoices/${rec.id}`);
          }}
          onReachEnd={() => requestMore()}
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
    </div>
  );
}
