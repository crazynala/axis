import { useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "@remix-run/react";
import { FindRibbon, defaultSummarizeFilters } from "~/base/find/FindRibbon";

export function FindRibbonAuto({
  views,
  activeView,
  title,
  labelMap,
  keepKeys,
}: {
  views: any[];
  activeView: string | null;
  title?: string;
  labelMap?: Record<string, string>;
  /**
   * URL search params to preserve when switching views, clearing filters, or removing chips.
   * Defaults to ["view", "sort", "dir", "perPage"].
   * Note: page is intentionally NOT preserved by default so it resets to page 1 when filters change.
   */
  keepKeys?: string[];
}) {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const keep = useMemo(
    () => new Set(keepKeys ?? ["view", "sort", "dir", "perPage"]),
    [keepKeys]
  );

  // Determine simple params (exclude control params)
  const simpleParams: Record<string, string> = useMemo(() => {
    const obj: Record<string, string> = {};
    sp.forEach((value, key) => {
      if (
        key === "page" ||
        key === "perPage" ||
        key === "sort" ||
        key === "dir" ||
        key === "q" ||
        key === "view" ||
        key === "findReqs"
      )
        return;
      if (value !== "") obj[key] = value;
    });
    return obj;
  }, [sp]);
  const inFindMode = sp.has("findReqs") || Object.keys(simpleParams).length > 0;
  const chips = defaultSummarizeFilters(simpleParams, { labelMap });

  const makeBaseParams = () => {
    const next = new URLSearchParams();
    sp.forEach((v, k) => {
      if (keep.has(k)) next.set(k, v);
    });
    return next;
  };

  // Normalize view list
  const viewNames = useMemo(() => {
    const list = [
      "All",
      ...(views || [])
        .map((v: any) => (typeof v === "string" ? v : v?.name))
        .filter((n: string) => n && n !== "All"),
    ];
    // unique
    const seen = new Set<string>();
    return list.filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
  }, [views]);

  return (
    <FindRibbon
      title={title}
      mode={inFindMode ? "find" : "view"}
      views={viewNames}
      activeView={activeView || "All"}
      onSelectView={(val) => {
        const next = makeBaseParams();
        // Clear any non-keep filters implicitly by starting from base
        // Then set the view (omit for All)
        if (val && val !== "All") next.set("view", val);
        else next.delete("view");
        // Reset page unless preserved
        if (!keep.has("page")) next.delete("page");
        navigate(`${pathname}?${next.toString()}`);
      }}
      filterChips={chips}
      advancedActive={sp.has("findReqs")}
      onClearAdvanced={() => {
        const next = new URLSearchParams(sp);
        next.delete("findReqs");
        if (!keep.has("page")) next.delete("page");
        navigate(`${pathname}?${next.toString()}`, { replace: true });
      }}
      onRemoveChip={(key) => {
        const next = new URLSearchParams(sp);
        next.delete(key);
        // Reset page when filters change
        if (!keep.has("page")) next.delete("page");
        navigate(`${pathname}?${next.toString()}`, { replace: true });
      }}
      onCancelFind={() => {
        const next = makeBaseParams();
        // Ensure view reflects activeView (omit for All)
        const v = activeView && activeView !== "All" ? activeView : null;
        if (v) next.set("view", v);
        else next.delete("view");
        if (!keep.has("page")) next.delete("page");
        navigate(`${pathname}?${next.toString()}`);
      }}
      onSaveAs={(name) => {
        // Post to current route action with _intent=saveView and name
        const form = document.createElement("form");
        form.method = "post";
        form.action = pathname;
        const i1 = document.createElement("input");
        i1.type = "hidden";
        i1.name = "_intent";
        i1.value = "saveView";
        form.appendChild(i1);
        const i2 = document.createElement("input");
        i2.type = "hidden";
        i2.name = "name";
        i2.value = name;
        form.appendChild(i2);
        document.body.appendChild(form);
        form.submit();
        setTimeout(() => form.remove(), 0);
      }}
    />
  );
}
