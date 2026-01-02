import React, { useMemo } from "react";
import { Button } from "@mantine/core";
import { useLocation } from "@remix-run/react";
import { GenericMultiFindModal } from "~/components/find/GenericMultiFindModal";
import { CompanyDetailForm } from "../forms/CompanyDetailForm";
import { allCompanyFindFields } from "../forms/companyDetail";
import type { MultiFindState } from "~/base/find/multiFind";

function buildCompanyDefaults() {
  return {
    id: undefined,
    name: "",
    notes: "",
    isCarrier: "",
    isCustomer: "",
    isSupplier: "",
    isInactive: "",
    isActive: "",
  } as any;
}

export function CompanyFindModal(props: {
  opened: boolean;
  onClose: () => void;
  onSearch: (qs: string) => void;
  mode?: "clean" | "restore";
  initialValues?: any;
  initialMode?: "simple" | "advanced";
  initialMulti?: MultiFindState | null;
  baselineQs?: string | null;
  onRestore?: (qs: string) => void;
}) {
  const location = useLocation();
  const lastQs = useMemo(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(location.search);
    if (params.has("view") && props.baselineQs != null) {
      return props.baselineQs;
    }
    try {
      const stored = window.sessionStorage.getItem("axis:lastFind:companies");
      if (stored && stored.trim()) return stored.trim();
    } catch {}
    if (params.has("view")) return null;
    const allowlist = new Set([
      "view",
      "lastView",
      "page",
      "perPage",
      "sort",
      "dir",
    ]);
    const filtered = new URLSearchParams();
    params.forEach((value, key) => {
      if (allowlist.has(key)) return;
      if (value === "") return;
      filtered.append(key, value);
    });
    const qs = filtered.toString();
    return qs ? qs : null;
  }, [location.search]);
  const effectiveInitialValues =
    props.mode === "clean" ? undefined : props.initialValues;
  const effectiveInitialMode =
    props.mode === "clean" ? "simple" : props.initialMode;
  const effectiveInitialMulti =
    props.mode === "clean" ? null : props.initialMulti;
  return (
    <GenericMultiFindModal
      opened={props.opened}
      onClose={props.onClose}
      onSearch={props.onSearch}
      initialValues={effectiveInitialValues}
      initialMode={effectiveInitialMode}
      initialMulti={effectiveInitialMulti}
      headerActions={
        props.onRestore ? (
          <Button
            size="xs"
            variant="subtle"
            disabled={!lastQs}
            onClick={() => {
              if (!lastQs) return;
              props.onRestore?.(lastQs);
            }}
            type="button"
          >
            Restore last
          </Button>
        ) : null
      }
      adapter={{
        buildDefaults: buildCompanyDefaults,
        allFields: allCompanyFindFields,
        title: "Find Companies",
      }}
      FormComponent={CompanyDetailForm as any}
    />
  );
}
