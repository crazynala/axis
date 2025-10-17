import { Group } from "@mantine/core";
import {
  Form,
  useSearchParams,
  useNavigate,
  useNavigation,
} from "@remix-run/react";
import React, { useEffect, useMemo } from "react";
import { FindRibbon, defaultSummarizeFilters } from "~/base/find/FindRibbon";
import { useSessionStorage } from "@mantine/hooks";
import {
  buildFindQueryString,
  scopeFromBasePath,
  type StoredFindViewState,
} from "~/base/find/sessionFindState";

interface SavedViewsProps {
  views: any[];
  activeView: string | null;
}

export function SavedViews({ views, activeView }: SavedViewsProps) {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const nav = useNavigation();
  const basePath =
    typeof window !== "undefined" ? window.location.pathname : "/";
  const scope = scopeFromBasePath(basePath);
  const [stored, setStored] = useSessionStorage<StoredFindViewState | null>({
    key: `axis:find:${scope}`,
    defaultValue: null,
  });

  // Determine if we're in find mode: any simple filter params or findReqs present means active find
  const hasFindReqs = !!sp.get("findReqs");
  const simpleParams: Record<string, string> = useMemo(() => {
    const obj: Record<string, string> = {};
    sp.forEach((value, key) => {
      if (
        key === "page" ||
        key === "sort" ||
        key === "view" ||
        key === "ids" ||
        key === "findReqs"
      )
        return;
      obj[key] = value;
    });
    return obj;
  }, [sp]);
  const inFindMode = hasFindReqs || Object.keys(simpleParams).length > 0;

  // Sync current URL state into session storage for persistence across navigation
  useEffect(() => {
    // If there are active filters, persist as find mode
    if (inFindMode) {
      const qs = buildFindQueryString(sp);
      setStored({ mode: "find", qs });
      return;
    }
    // Otherwise persist the current view
    const v = sp.get("view") || activeView || "All";
    setStored({ mode: "view", view: v });
  }, [inFindMode, sp, activeView, setStored]);

  const chips = useMemo(
    () => defaultSummarizeFilters(simpleParams, { excludeKeys: [] }),
    [simpleParams]
  );

  const viewNames = useMemo(() => {
    const list = [
      "All",
      ...(views || [])
        .map((v: any) => v.name)
        .filter((n: string) => n && n !== "All"),
    ];
    // Ensure uniqueness while preserving order
    const seen = new Set<string>();
    return list.filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
  }, [views]);

  return (
    <FindRibbon
      title={undefined}
      mode={inFindMode ? "find" : "view"}
      views={viewNames}
      activeView={activeView || "All"}
      onSelectView={(val) => {
        const next = new URLSearchParams(sp);
        // Switch to a view: set view, clear find params
        if (val && val !== "All") next.set("view", val);
        else next.delete("view");
        // Clear find params
        next.delete("findReqs");
        // Remove all simple criteria (keep pagination and sorting reset)
        const keep = new Set(["view", "page", "sort"]);
        Array.from(next.keys()).forEach((k) => {
          if (!keep.has(k)) next.delete(k);
        });
        next.set("page", "1");
        const qs = next.toString();
        // Persist new view choice immediately
        setStored({ mode: "view", view: val || "All" });
        navigate(`?${qs}`);
      }}
      filterChips={chips}
      onCancelFind={() => {
        // Restore to last selected view (activeView), clearing find criteria
        const next = new URLSearchParams(sp);
        if (activeView && activeView !== "All") next.set("view", activeView);
        else next.delete("view");
        next.delete("findReqs");
        const keep = new Set(["view", "page", "sort"]);
        Array.from(next.keys()).forEach((k) => {
          if (!keep.has(k)) next.delete(k);
        });
        next.set("page", "1");
        const qs = next.toString();
        // Persist change back to view mode
        setStored({ mode: "view", view: activeView || "All" });
        navigate(`?${qs}`);
      }}
      onSaveAs={(name) => {
        // Post to save view with provided name; we rely on existing route action handling _intent=saveView
        const form = document.createElement("form");
        form.method = "post";
        const i1 = document.createElement("input");
        i1.type = "hidden";
        i1.name = "_intent";
        i1.value = "saveView";
        const i2 = document.createElement("input");
        i2.type = "hidden";
        i2.name = "name";
        i2.value = name;
        form.appendChild(i1);
        form.appendChild(i2);
        document.body.appendChild(form);
        form.submit();
        setTimeout(() => form.remove(), 0);
      }}
    />
  );
}
