import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "@remix-run/react";
import { InvoiceFindModal } from "../components/InvoiceFindModal";
import { useFind } from "../../../base/find/FindContext";
import { invoiceSpec } from "../spec";
import { decodeRequests, type MultiFindState } from "~/base/find/multiFind";

export function InvoiceFindManager({
  activeViewParams = null,
}: {
  activeViewParams?: any | null;
}) {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { registerFindCallback } = useFind();

  const [open, setOpen] = useState(false);
  const [openMode, setOpenMode] = useState<"clean" | "restore">("clean");
  const [initialValues, setInitialValues] = useState<any>(undefined);
  const [initialMode, setInitialMode] = useState<"simple" | "advanced">(
    "simple"
  );
  const [initialMulti, setInitialMulti] = useState<MultiFindState | null>(null);
  const semanticKeys = useMemo(() => invoiceSpec.find.deriveSemanticKeys(), []);

  useEffect(
    () =>
      registerFindCallback(() => {
        setOpenMode("clean");
        setInitialValues(undefined);
        setInitialMode("simple");
        setInitialMulti(null);
        setOpen(true);
      }),
    [registerFindCallback]
  );
  const isEditableTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (/(INPUT|TEXTAREA|SELECT)/.test(tag)) return true;
    if (target.isContentEditable) return true;
    return false;
  };
  const readLastFindQs = useCallback(() => {
    try {
      const qs = window.sessionStorage.getItem("axis:lastFind:invoices");
      return qs && qs.trim() ? qs.trim() : null;
    } catch {
      return null;
    }
  }, []);
  const buildBaselineQs = useCallback(() => {
    if (!activeViewParams) return null;
    const params = new URLSearchParams();
    const q = activeViewParams.q;
    if (q != null && String(q).trim() !== "") params.set("q", String(q));
    const findReqs = activeViewParams.findReqs;
    if (findReqs != null && String(findReqs).trim() !== "")
      params.set("findReqs", String(findReqs));
    const filters = activeViewParams.filters || {};
    for (const [k, v] of Object.entries(filters)) {
      if (v === undefined || v === null || v === "") continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    return qs ? qs : null;
  }, [activeViewParams]);
  const buildSemanticQsFromSearch = useCallback(() => {
    const params = new URLSearchParams();
    const q = sp.get("q");
    if (q != null && q !== "") params.set("q", q);
    const findReqs = sp.get("findReqs");
    if (findReqs != null && findReqs !== "") params.set("findReqs", findReqs);
    for (const key of semanticKeys) {
      const v = sp.get(key);
      if (v !== null && v !== "") params.set(key, v);
    }
    const qs = params.toString();
    return qs ? qs : null;
  }, [semanticKeys, sp]);
  const hasSemantic = useMemo(() => {
    if (sp.has("q") || sp.has("findReqs")) return true;
    for (const key of semanticKeys) {
      const v = sp.get(key);
      if (v !== null && v !== "") return true;
    }
    return false;
  }, [semanticKeys, sp]);
  const viewActive = useMemo(
    () => !!sp.get("view") && !hasSemantic,
    [hasSemantic, sp]
  );
  const resolveRestoreQs = useCallback(() => {
    if (viewActive) {
      const baseline = buildBaselineQs();
      if (baseline) return baseline;
      return null;
    }
    if (hasSemantic) {
      const qs = buildSemanticQsFromSearch();
      if (qs) return qs;
    }
    return readLastFindQs();
  }, [buildBaselineQs, buildSemanticQsFromSearch, hasSemantic, readLastFindQs, viewActive]);
  const buildRestoreState = useCallback(
    (qs: string | null) => {
      if (!qs) {
        return {
          values: undefined,
          mode: "simple" as const,
          multi: null,
        };
      }
      const params = new URLSearchParams(qs);
      const findReqs = params.get("findReqs");
      if (findReqs) {
        const decoded = decodeRequests(findReqs);
        if (decoded && decoded.requests?.length) {
          return {
            values: undefined,
            mode: "advanced" as const,
            multi: decoded,
          };
        }
      }
      const values: Record<string, any> = {};
      for (const key of semanticKeys) {
        const v = params.get(key);
        if (v !== null && v !== "") values[key] = v;
      }
      const q = params.get("q");
      if (q && !values.invoiceCode) values.invoiceCode = q;
      return {
        values: Object.keys(values).length ? values : undefined,
        mode: "simple" as const,
        multi: null,
      };
    },
    [semanticKeys]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: KeyboardEvent) => {
      const key = e.key?.toLowerCase();
      if (!key || key !== "f") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (!e.shiftKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      const qs = resolveRestoreQs();
      const restoreState = buildRestoreState(qs);
      setOpenMode("restore");
      setInitialValues(restoreState.values);
      setInitialMode(restoreState.mode);
      setInitialMulti(restoreState.multi);
      setOpen(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [buildRestoreState, resolveRestoreQs]);

  return (
    <InvoiceFindModal
      opened={open}
      onClose={() => {
        setOpen(false);
      }}
      onSearch={(qs) => {
        const url = new URL(window.location.href);
        const produced = new URLSearchParams(qs);
        const viewName = url.searchParams.get("view");
        Array.from(url.searchParams.keys()).forEach((k) => {
          if (k === "q" || k === "findReqs" || semanticKeys.has(k))
            url.searchParams.delete(k);
        });
        for (const [k, v] of produced.entries()) url.searchParams.set(k, v);
        url.searchParams.delete("page");
        url.searchParams.delete("findMode");
        if (viewName) {
          url.searchParams.delete("view");
          url.searchParams.set("lastView", viewName);
        }
        try {
          window.sessionStorage.setItem(
            "axis:lastFind:invoices",
            produced.toString()
          );
        } catch {}
        setOpen(false);
        navigate(url.pathname + "?" + url.searchParams.toString());
      }}
      initialValues={openMode === "clean" ? undefined : initialValues}
      initialMode={openMode === "clean" ? "simple" : initialMode}
      initialMulti={openMode === "clean" ? null : initialMulti}
      restoreQs={resolveRestoreQs()}
      onRestore={(qs) => {
        const restoreState = buildRestoreState(qs);
        setOpenMode("restore");
        setInitialValues(restoreState.values);
        setInitialMode(restoreState.mode);
        setInitialMulti(restoreState.multi);
      }}
    />
  );
}
