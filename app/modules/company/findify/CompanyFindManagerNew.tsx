import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "@remix-run/react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { CompanyFindModal } from "../components/CompanyFindModal";
import { useFind } from "~/base/find/FindContext";
import { decodeRequests, type MultiFindState } from "~/base/find/multiFind";

export function CompanyFindManagerNew({
  activeViewName,
  activeViewParams,
  viewActive,
}: {
  activeViewName?: string | null;
  activeViewParams?: any;
  viewActive?: boolean;
}) {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { registerFindCallback } = useFind();
  const [opened, setOpened] = useState(false);
  const [openMode, setOpenMode] = useState<"clean" | "restore">("clean");
  const [initialValues, setInitialValues] = useState<any>(undefined);
  const [initialMode, setInitialMode] = useState<"simple" | "advanced">(
    "simple"
  );
  const [initialMulti, setInitialMulti] = useState<MultiFindState | null>(null);
  const isEditableTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (/(INPUT|TEXTAREA|SELECT)/.test(tag)) return true;
    if (target.isContentEditable) return true;
    return false;
  };

  const readLastFindQs = () => {
    try {
      const qs = window.sessionStorage.getItem("axis:lastFind:companies");
      return qs && qs.trim() ? qs : null;
    } catch {
      return null;
    }
  };
  const buildBaselineQs = () => {
    if (!activeViewParams) return null;
    const params = new URLSearchParams();
    const q = activeViewParams.q;
    if (q != null && String(q).trim() !== "") params.set("q", String(q));
    const filters = activeViewParams.filters || {};
    for (const [k, v] of Object.entries(filters)) {
      if (v === undefined || v === null || v === "") continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    return qs ? qs : "";
  };

  const buildRestoreState = (qs: string | null) => {
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
    const keys = [
      "id",
      "name",
      "notes",
      "isCarrier",
      "isCustomer",
      "isSupplier",
      "isInactive",
      "isActive",
    ];
    const values: Record<string, any> = {};
    keys.forEach((k) => {
      const v = params.get(k);
      if (v !== null && v !== "") values[k] = v;
    });
    return {
      values: Object.keys(values).length ? values : undefined,
      mode: "simple" as const,
      multi: null,
    };
  };

  useEffect(
    () =>
      registerFindCallback(() => {
        setOpenMode("clean");
        setInitialValues(undefined);
        setInitialMode("simple");
        setInitialMulti(null);
        setOpened(true);
      }),
    [registerFindCallback]
  );
  const open = () => {
    setOpenMode("clean");
    setInitialValues(undefined);
    setInitialMode("simple");
    setInitialMulti(null);
    setOpened(true);
  };
  const close = () => {
    setOpened(false);
    const next = new URLSearchParams(sp);
    next.delete("findMode");
    navigate(`?${next.toString()}`);
  };
  const onSearch = (qs: string) => {
    const url = new URL(window.location.href);
    const produced = new URLSearchParams(qs);
    const viewName = activeViewName || url.searchParams.get("view");
    const semanticKeys = new Set([
      "q",
      "findReqs",
      "id",
      "name",
      "notes",
      "isCarrier",
      "isCustomer",
      "isSupplier",
      "isInactive",
      "isActive",
    ]);
    Array.from(url.searchParams.keys()).forEach((k) => {
      if (semanticKeys.has(k)) url.searchParams.delete(k);
    });
    for (const [k, v] of produced.entries()) url.searchParams.set(k, v);
    url.searchParams.delete("findMode");
    url.searchParams.delete("page");
    if (viewName) {
      url.searchParams.delete("view");
      url.searchParams.delete("lastView");
      url.searchParams.set("lastView", viewName);
    }
    const finalQs = url.searchParams.toString();
    try {
      window.sessionStorage.setItem("axis:lastFind:companies", produced.toString());
    } catch {}
    setOpened(false);
    navigate(finalQs ? `${url.pathname}?${finalQs}` : url.pathname);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: KeyboardEvent) => {
      const key = e.key?.toLowerCase();
      if (!key || key !== "f") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      const restore = e.shiftKey;
      const qs = restore
        ? viewActive
          ? buildBaselineQs()
          : readLastFindQs()
        : null;
      const restoreState = buildRestoreState(qs);
      setOpenMode(restore ? "restore" : "clean");
      setInitialValues(restoreState.values);
      setInitialMode(restoreState.mode);
      setInitialMulti(restoreState.multi);
      setOpened(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleRestore = (qs: string) => {
    const restoreState = buildRestoreState(qs);
    setOpenMode("restore");
    setInitialValues(restoreState.values);
    setInitialMode(restoreState.mode);
    setInitialMulti(restoreState.multi);
  };
  return (
    <>
      <Tooltip label="Find Companies" position="right">
        <ActionIcon
          onClick={open}
          variant={opened ? "filled" : "light"}
          color="blue"
          size="lg"
          style={{ position: "fixed", bottom: 16, left: 16, zIndex: 200 }}
        >
          <IconSearch size={18} />
        </ActionIcon>
      </Tooltip>
      <CompanyFindModal
        opened={opened}
        onClose={close}
        onSearch={onSearch}
        mode={openMode}
        initialValues={initialValues}
        initialMode={initialMode}
        initialMulti={initialMulti}
        baselineQs={viewActive ? buildBaselineQs() : null}
        onRestore={handleRestore}
      />
    </>
  );
}
