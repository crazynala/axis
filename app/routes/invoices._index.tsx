import { Link, useLocation, useNavigate } from "@remix-run/react";
import RefactoredNavDataTable from "../components/RefactoredNavDataTable";
import { formatUSD } from "../utils/format";
import { BreadcrumbSet } from "@aa/timber";
import { Button, Group } from "@mantine/core";
import { useEffect, useState } from "react";
import { useRecords } from "../record/RecordContext";
import { SavedViews } from "../components/find/SavedViews";
import { useHybridWindow } from "../record/useHybridWindow";

// Hybrid index: no loader; relies on layout providing idList + initialRows. We join idList with sparse rowsMap.
export default function InvoicesIndexRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useRecords();
  const { records, atEnd, loading, requestMore, missingIds, total } =
    useHybridWindow({
      module: "invoices",
      initialWindow: 100,
      batchIncrement: 100,
    });
  const [tableHeight, setTableHeight] = useState(500);

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

  // windowing handled by hook

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
        fetching={loading}
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
