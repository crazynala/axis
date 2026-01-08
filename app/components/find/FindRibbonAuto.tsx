import { useEffect, useMemo, useState } from "react";
import {
  useLocation,
  useNavigate,
  useSearchParams,
  useRouteLoaderData,
} from "@remix-run/react";
import {
  ActionIcon,
  Button,
  Checkbox,
  Divider,
  Group,
  Menu,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronUp,
  IconColumns,
} from "@tabler/icons-react";
import {
  FindRibbon,
  defaultSummarizeFilters,
  type FilterChip,
} from "~/base/find/FindRibbon";
import {
  computeDirty,
  computeSaveTarget,
  deriveSemanticKeys,
  getIndexMode,
  hasPresentationParams,
  hasSemanticParams,
  normalizeViewLastView,
} from "~/base/index/indexController";
import {
  type ColumnDef,
  columnsToParam,
  getDefaultColumnKeys,
  getVisibleColumnKeys,
  normalizeColumnsValue,
  sameColumnOrder,
} from "~/base/index/columns";

export function FindRibbonAuto({
  views,
  activeView,
  title,
  labelMap,
  keepKeys,
  summarizeFilters,
  semanticKeys,
  findConfig,
  presentationKeys,
  columnsConfig,
  activeViewId,
  activeViewParams,
  enableLastView,
  enableSaveAs = true,
  viewTabs,
  onSelectView,
  ignoreFilterKeys,
}: {
  views: any[];
  activeView: string | null;
  module?: string;
  title?: string;
  labelMap?: Record<string, string>;
  /**
   * URL search params to preserve when switching views, clearing filters, or removing chips.
   * Defaults to ["view", "sort", "dir", "perPage", "columns"].
   * Note: page is intentionally NOT preserved by default so it resets to page 1 when filters change.
   */
  keepKeys?: string[];
  summarizeFilters?: (
    params: Record<string, string>,
    opts: { labelMap?: Record<string, string> }
  ) => FilterChip[];
  semanticKeys?: string[];
  findConfig?: Array<{ name: string; findOp?: any; hiddenInModes?: string[] }>;
  presentationKeys?: string[];
  columnsConfig?: ColumnDef[];
  activeViewId?: string | null;
  activeViewParams?: any | null;
  enableLastView?: boolean;
  enableSaveAs?: boolean;
  viewTabs?: Array<{ value: string; label: string }>;
  onSelectView?: (value: string, helpers: {
    searchParams: URLSearchParams;
    pathname: string;
    navigate: ReturnType<typeof useNavigate>;
  }) => void;
  ignoreFilterKeys?: string[];
}) {
  const rootData = useRouteLoaderData<any>("root");
  const isAdmin = rootData?.userLevel === "Admin";
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const keep = useMemo(
    () => new Set(keepKeys ?? ["view", "sort", "dir", "perPage", "columns"]),
    [keepKeys]
  );
  const semanticKeysResolved = useMemo(() => {
    if (semanticKeys?.length) return semanticKeys;
    return deriveSemanticKeys(findConfig);
  }, [findConfig, semanticKeys]);
  const ignoreFilterKeysSet = useMemo(
    () => new Set(ignoreFilterKeys ?? []),
    [ignoreFilterKeys]
  );
  const presentationKeysResolved = useMemo(
    () => presentationKeys ?? ["sort", "dir", "perPage", "page", "columns"],
    [presentationKeys]
  );
  const defaultColumns = useMemo(
    () => (columnsConfig?.length ? getDefaultColumnKeys(columnsConfig) : []),
    [columnsConfig]
  );

  // Determine simple params (exclude control params)
  const simpleParams: Record<string, string> = useMemo(() => {
    if (sp.has("view")) return {};
    const obj: Record<string, string> = {};
    sp.forEach((value, key) => {
      if (
        key === "page" ||
        key === "perPage" ||
        key === "sort" ||
        key === "dir" ||
        key === "columns" ||
        key === "q" ||
        key === "view" ||
        key === "findReqs" ||
        key === "lastView" ||
        ignoreFilterKeysSet.has(key)
      )
        return;
      if (value !== "") obj[key] = value;
    });
    return obj;
  }, [ignoreFilterKeysSet, sp]);
  const inFindMode = sp.has("findReqs") || Object.keys(simpleParams).length > 0;
  const chips = summarizeFilters
    ? summarizeFilters(simpleParams, { labelMap })
    : defaultSummarizeFilters(simpleParams, { labelMap });
  const { viewMode, activeViewId: viewId, lastViewId } = useMemo(
    () => getIndexMode(sp, semanticKeysResolved),
    [sp, semanticKeysResolved]
  );
  const viewColumns = useMemo(
    () => normalizeColumnsValue(activeViewParams?.columns),
    [activeViewParams]
  );
  const effectiveColumns = useMemo(() => {
    if (!columnsConfig?.length) return [];
    return getVisibleColumnKeys({
      defs: columnsConfig,
      urlColumns: sp.get("columns"),
      viewColumns,
      viewMode,
    });
  }, [columnsConfig, sp, viewColumns, viewMode]);
  const hasSemantic = useMemo(
    () => hasSemanticParams(sp, semanticKeysResolved),
    [sp, semanticKeysResolved]
  );
  const presentationChanged = useMemo(
    () => hasPresentationParams(sp, presentationKeysResolved),
    [sp, presentationKeysResolved]
  );
  const saveTargetId = useMemo(
    () => computeSaveTarget(viewMode, viewId, lastViewId),
    [lastViewId, viewId, viewMode]
  );
  const resolvedActiveViewId = activeViewId ?? activeView ?? viewId ?? null;
  const viewsById = useMemo(() => {
    const map = new Map<string, any>();
    (views || []).forEach((v: any) => {
      if (!v) return;
      const key = typeof v === "string" ? v : String(v?.id ?? "");
      if (key) map.set(key, v);
    });
    return map;
  }, [views]);
  const viewsByName = useMemo(() => {
    const map = new Map<string, any>();
    (views || []).forEach((v: any) => {
      if (!v) return;
      const key = typeof v === "string" ? v : v?.name;
      if (key) map.set(key, v);
    });
    return map;
  }, [views]);
  const activeViewObj =
    (resolvedActiveViewId && viewsById.get(String(resolvedActiveViewId))) ||
    (resolvedActiveViewId && viewsByName.get(String(resolvedActiveViewId))) ||
    null;
  const baselineParams = useMemo(() => {
    if (viewMode) {
      if (activeViewParams) return activeViewParams;
      return activeViewObj?.params || null;
    }
    if (saveTargetId) {
      return (
        viewsById.get(saveTargetId)?.params ||
        viewsByName.get(saveTargetId)?.params ||
        null
      );
    }
    return null;
  }, [
    activeViewObj,
    activeViewParams,
    resolvedActiveViewId,
    saveTargetId,
    viewMode,
    viewsById,
    viewsByName,
  ]);
  const useUnifiedControls = useMemo(
    () =>
      enableSaveAs &&
      (enableLastView || semanticKeysResolved.length > 0 || !!findConfig?.length),
    [enableLastView, enableSaveAs, findConfig?.length, semanticKeysResolved.length]
  );
  const dirtyView = useMemo(
    () =>
      viewMode
        ? computeDirty({
            searchParams: sp,
            presentationKeys: presentationKeysResolved,
            baselineViewParams: baselineParams,
          })
        : false,
    [baselineParams, presentationKeysResolved, sp, viewMode]
  );
  const showCancel = viewMode ? dirtyView : hasSemantic;
  const showSaveMenu = viewMode
    ? dirtyView
    : !!saveTargetId && (hasSemantic || presentationChanged);
  const showSaveAs = !viewMode && !saveTargetId && (hasSemantic || presentationChanged);
  const showColumns = !!columnsConfig?.length;
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState<string[]>(effectiveColumns);

  useEffect(() => {
    if (!enableLastView) return;
    const next = normalizeViewLastView(sp, semanticKeysResolved);
    if (!next) return;
    navigate(next.toString() ? `${pathname}?${next.toString()}` : pathname, {
      replace: true,
    });
  }, [enableLastView, navigate, pathname, semanticKeysResolved, sp]);
  useEffect(() => {
    if (!columnsOpen) return;
    const required =
      columnsConfig?.filter((c) => c.hideable === false).map((c) => c.key) ??
      [];
    const next = [...effectiveColumns];
    for (const key of required) {
      if (!next.includes(key)) next.push(key);
    }
    setDraftColumns(next);
  }, [columnsConfig, columnsOpen, effectiveColumns]);

  const makeBaseParams = () => {
    const next = new URLSearchParams();
    sp.forEach((v, k) => {
      if (keep.has(k)) next.set(k, v);
    });
    return next;
  };
  const makePresentationParams = () => {
    const next = new URLSearchParams();
    for (const key of presentationKeysResolved) {
      const v = sp.get(key);
      if (v !== null && v !== "") next.set(key, v);
    }
    return next;
  };
  const moveColumn = (key: string, dir: -1 | 1) => {
    setDraftColumns((prev) => {
      const idx = prev.indexOf(key);
      if (idx === -1) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[nextIdx];
      next[nextIdx] = temp;
      return next;
    });
  };

  // Normalize view list
  const viewOptions = useMemo(() => {
    const list =
      viewTabs && viewTabs.length
        ? viewTabs
        : [
            { value: "All", label: "All" },
            ...(views || [])
              .map((v: any) =>
                typeof v === "string"
                  ? { value: v, label: v }
                  : { value: String(v.id), label: v.name }
              )
              .filter((v: any) => v?.label && v.label !== "All"),
          ];
    const seen = new Set<string>();
    return list.filter((v) =>
      seen.has(v.value) ? false : (seen.add(v.value), true)
    );
  }, [viewTabs, views]);
  const columnsByGroup = useMemo(() => {
    const map = new Map<string, ColumnDef[]>();
    (columnsConfig || []).forEach((col) => {
      const group = col.group || "Columns";
      if (!map.has(group)) map.set(group, []);
      map.get(group)?.push(col);
    });
    return map;
  }, [columnsConfig]);
  const columnsByKey = useMemo(() => {
    const map = new Map<string, ColumnDef>();
    (columnsConfig || []).forEach((col) => {
      map.set(col.key, col);
    });
    return map;
  }, [columnsConfig]);
  const selectedColumns = useMemo(
    () =>
      draftColumns
        .map((key) => columnsByKey.get(key))
        .filter(Boolean) as ColumnDef[],
    [columnsByKey, draftColumns]
  );
  const selectedKeys = useMemo(
    () => new Set(draftColumns),
    [draftColumns]
  );

  const [renameOpen, setRenameOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [duplicateValue, setDuplicateValue] = useState("");
  const canEditView = !!activeViewObj?.editable;
  const isLocked = !!activeViewObj?.isLocked;
  const isGlobal = !!activeViewObj?.isGlobal;
  const canRenameDelete = canEditView && (!isLocked || isAdmin);
  const canAdminActions = isAdmin;
  const isBuiltin = !!activeViewObj?.isBuiltin;
  const showViewMenu =
    resolvedActiveViewId &&
    resolvedActiveViewId !== "All" &&
    !!activeViewObj &&
    !isBuiltin;

  useEffect(() => {
    if (!activeViewObj) return;
    setRenameValue(activeViewObj.name || "");
    setDuplicateValue(`${activeViewObj.name || "View"} (copy)`);
  }, [activeViewObj]);

  const submitViewAction = (intent: string, payload?: Record<string, string>) => {
    if (!activeViewObj) return;
    const form = document.createElement("form");
    form.method = "post";
    form.action = `${pathname}?${sp.toString()}`;
    const intentInput = document.createElement("input");
    intentInput.type = "hidden";
    intentInput.name = "_intent";
    intentInput.value = intent;
    form.appendChild(intentInput);
    const viewIdInput = document.createElement("input");
    viewIdInput.type = "hidden";
    viewIdInput.name = "viewId";
    viewIdInput.value = String(activeViewObj.id ?? resolvedActiveViewId);
    form.appendChild(viewIdInput);
    if (payload) {
      for (const [key, value] of Object.entries(payload)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }
    }
    document.body.appendChild(form);
    form.submit();
    setTimeout(() => form.remove(), 0);
  };

  return (
    <>
      <FindRibbon
        title={title}
        mode={inFindMode ? "find" : "view"}
        views={viewOptions}
        activeView={resolvedActiveViewId || "All"}
        onSelectView={(val) => {
          if (onSelectView) {
            onSelectView(val, { searchParams: sp, pathname, navigate });
            return;
          }
          const next = new URLSearchParams();
          if (val && val !== "All") next.set("view", val);
          const qs = next.toString();
          navigate(qs ? `${pathname}?${qs}` : pathname);
        }}
        viewMenu={
          showViewMenu ? (
            <Menu position="bottom-start" withinPortal>
              <Menu.Target>
                <ActionIcon size="sm" variant="subtle" aria-label="View actions">
                  <IconChevronDown size={12} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  onClick={() => {
                    setDuplicateOpen(true);
                  }}
                >
                  Duplicate view…
                </Menu.Item>
                {canRenameDelete ? (
                  <Menu.Item
                    onClick={() => {
                      setRenameOpen(true);
                    }}
                  >
                    Rename view…
                  </Menu.Item>
                ) : null}
                {canRenameDelete ? (
                  <Menu.Item
                    color="red"
                    onClick={() => {
                      setDeleteOpen(true);
                    }}
                  >
                    Delete view…
                  </Menu.Item>
                ) : null}
                {canAdminActions && !isGlobal ? (
                  <Menu.Item onClick={() => submitViewAction("view.publish")}>
                    Publish as Global
                  </Menu.Item>
                ) : null}
                {canAdminActions && isGlobal ? (
                  <Menu.Item onClick={() => submitViewAction("view.unpublish")}>
                    Unpublish (make personal)
                  </Menu.Item>
                ) : null}
              </Menu.Dropdown>
            </Menu>
          ) : null
        }
        filterChips={chips}
        advancedActive={sp.has("findReqs")}
        onClearAdvanced={() => {
          const next = new URLSearchParams(sp);
          next.delete("view");
          next.delete("findReqs");
          if (!keep.has("page")) next.delete("page");
          navigate(`${pathname}?${next.toString()}`, { replace: true });
        }}
        onRemoveChip={(key) => {
          const next = new URLSearchParams(sp);
          next.delete("view");
          next.delete(key);
          // Reset page when filters change
          if (!keep.has("page")) next.delete("page");
          navigate(`${pathname}?${next.toString()}`, { replace: true });
        }}
        onCancelFind={() => {
          const next = makeBaseParams();
          // Ensure view reflects activeView (omit for All)
          const v =
            resolvedActiveViewId && resolvedActiveViewId !== "All"
              ? resolvedActiveViewId
              : null;
          if (v) next.set("view", v);
          else next.delete("view");
          if (!keep.has("page")) next.delete("page");
          navigate(`${pathname}?${next.toString()}`);
        }}
        renderActions={
          useUnifiedControls || showColumns
            ? ({ openSaveAs }) => {
                if (!showCancel && !showSaveMenu && !showSaveAs && !showColumns)
                  return null;
                return (
                  <>
                    <Group gap="xs" align="center" wrap="nowrap">
                      {showColumns ? (
                        <Button
                          size="xs"
                          variant="default"
                          leftSection={<IconColumns size={14} />}
                          onClick={() => setColumnsOpen(true)}
                        >
                          Columns
                        </Button>
                      ) : null}
                      {showSaveMenu ? (
                        <Menu position="bottom-end" withinPortal>
                          <Menu.Target>
                            <Button
                              size="xs"
                              variant="default"
                              rightSection={<IconChevronDown size={14} />}
                            >
                              Save
                            </Button>
                          </Menu.Target>
                          <Menu.Dropdown>
                            {saveTargetId ? (
                              <Menu.Item
                                onClick={() => {
                                  const form = document.createElement("form");
                                  form.method = "post";
                                  form.action = `${pathname}?${sp.toString()}`;
                                  const intent =
                                    document.createElement("input");
                                  intent.type = "hidden";
                                  intent.name = "_intent";
                                  intent.value = "view.overwriteFromUrl";
                                  form.appendChild(intent);
                                  const viewInput =
                                    document.createElement("input");
                                  viewInput.type = "hidden";
                                  viewInput.name = "viewId";
                                  viewInput.value = saveTargetId;
                                  form.appendChild(viewInput);
                                  document.body.appendChild(form);
                                  form.submit();
                                  setTimeout(() => form.remove(), 0);
                                }}
                              >
                                Overwrite view
                              </Menu.Item>
                            ) : null}
                            <Menu.Item onClick={openSaveAs}>
                              Save as new view…
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      ) : null}
                      {showSaveAs ? (
                        <Button size="xs" variant="default" onClick={openSaveAs}>
                          Save as…
                        </Button>
                      ) : null}
                      {showCancel ? (
                        <Button
                          size="xs"
                          variant="default"
                          onClick={() => {
                            const next = makePresentationParams();
                            if (lastViewId) {
                              next.set("view", lastViewId);
                              navigate(
                                next.toString()
                                  ? `${pathname}?${next.toString()}`
                                  : pathname
                              );
                              return;
                            }
                            if (resolvedActiveViewId) {
                              next.set("view", resolvedActiveViewId);
                              navigate(
                                next.toString()
                                  ? `${pathname}?${next.toString()}`
                                  : pathname
                              );
                              return;
                            }
                            navigate(
                              next.toString()
                                ? `${pathname}?${next.toString()}`
                                : pathname
                            );
                          }}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </Group>
                    {showColumns ? (
                      <Modal
                        opened={columnsOpen}
                        onClose={() => setColumnsOpen(false)}
                        title="Columns"
                        size="md"
                      >
                        <Stack gap="sm">
                          <ScrollArea type="auto" h={280}>
                            <Stack gap="sm">
                              <Stack gap={6}>
                                <Text size="sm" fw={600}>
                                  Selected
                                </Text>
                                {selectedColumns.map((col) => {
                                  const hideable = col.hideable !== false;
                                  const checked = draftColumns.includes(
                                    col.key
                                  );
                                  return (
                                    <Group
                                      key={col.key}
                                      justify="space-between"
                                      align="center"
                                      wrap="nowrap"
                                    >
                                      <Checkbox
                                        size="sm"
                                        label={col.title}
                                        checked={checked || !hideable}
                                        disabled={!hideable}
                                        onChange={(e) => {
                                          const nextChecked =
                                            e.currentTarget.checked;
                                          setDraftColumns((prev) => {
                                            const exists = prev.includes(
                                              col.key
                                            );
                                            if (nextChecked && !exists)
                                              return [...prev, col.key];
                                            if (!nextChecked && exists) {
                                              return prev.filter(
                                                (k) => k !== col.key
                                              );
                                            }
                                            return prev;
                                          });
                                        }}
                                      />
                                      <Group gap={4} wrap="nowrap">
                                        <ActionIcon
                                          size="sm"
                                          variant="subtle"
                                          onClick={() =>
                                            moveColumn(col.key, -1)
                                          }
                                          disabled={!checked}
                                        >
                                          <IconChevronUp size={14} />
                                        </ActionIcon>
                                        <ActionIcon
                                          size="sm"
                                          variant="subtle"
                                          onClick={() =>
                                            moveColumn(col.key, 1)
                                          }
                                          disabled={!checked}
                                        >
                                          <IconChevronDown size={14} />
                                        </ActionIcon>
                                      </Group>
                                    </Group>
                                  );
                                })}
                                <Divider />
                              </Stack>
                              {Array.from(columnsByGroup.entries()).map(
                                ([group, cols]) => {
                                  const remaining = cols.filter(
                                    (col) => !selectedKeys.has(col.key)
                                  );
                                  if (!remaining.length) return null;
                                  return (
                                    <Stack key={group} gap={6}>
                                      <Text size="sm" fw={600}>
                                        {group}
                                      </Text>
                                      {remaining.map((col) => {
                                        const hideable = col.hideable !== false;
                                        const checked = draftColumns.includes(
                                          col.key
                                        );
                                        return (
                                          <Group
                                            key={col.key}
                                            justify="space-between"
                                            align="center"
                                            wrap="nowrap"
                                          >
                                            <Checkbox
                                              size="sm"
                                              label={col.title}
                                              checked={checked || !hideable}
                                              disabled={!hideable}
                                              onChange={(e) => {
                                                const nextChecked =
                                                  e.currentTarget.checked;
                                                setDraftColumns((prev) => {
                                                  const exists =
                                                    prev.includes(col.key);
                                                  if (nextChecked && !exists)
                                                    return [...prev, col.key];
                                                  if (!nextChecked && exists) {
                                                    return prev.filter(
                                                      (k) => k !== col.key
                                                    );
                                                  }
                                                  return prev;
                                                });
                                              }}
                                            />
                                            <Group gap={4} wrap="nowrap">
                                              <ActionIcon
                                                size="sm"
                                                variant="subtle"
                                                onClick={() =>
                                                  moveColumn(col.key, -1)
                                                }
                                                disabled={!checked}
                                              >
                                                <IconChevronUp size={14} />
                                              </ActionIcon>
                                              <ActionIcon
                                                size="sm"
                                                variant="subtle"
                                                onClick={() =>
                                                  moveColumn(col.key, 1)
                                                }
                                                disabled={!checked}
                                              >
                                                <IconChevronDown size={14} />
                                              </ActionIcon>
                                            </Group>
                                          </Group>
                                        );
                                      })}
                                      <Divider />
                                    </Stack>
                                  );
                                }
                              )}
                            </Stack>
                          </ScrollArea>
                          <Group justify="space-between">
                            <Button
                              size="xs"
                              variant="default"
                              onClick={() => setDraftColumns(defaultColumns)}
                            >
                              Reset to defaults
                            </Button>
                            <Group gap="xs">
                              <Button
                                size="xs"
                                variant="default"
                                onClick={() => setColumnsOpen(false)}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="xs"
                                onClick={() => {
                                  const baseline =
                                    viewMode && viewColumns.length
                                      ? viewColumns
                                      : defaultColumns;
                                  const next = new URLSearchParams(sp);
                                  if (
                                    sameColumnOrder(draftColumns, baseline)
                                  ) {
                                    next.delete("columns");
                                  } else {
                                    next.set(
                                      "columns",
                                      columnsToParam(draftColumns)
                                    );
                                  }
                                  navigate(
                                    next.toString()
                                      ? `${pathname}?${next.toString()}`
                                      : pathname
                                  );
                                  setColumnsOpen(false);
                                }}
                              >
                                Apply
                              </Button>
                            </Group>
                          </Group>
                        </Stack>
                      </Modal>
                    ) : null}
                  </>
                );
              }
            : undefined
        }
        onSaveAs={
          enableSaveAs
            ? (name) => {
                // Post to current route action with _intent=view.saveAs and name
                const form = document.createElement("form");
                form.method = "post";
                form.action = `${pathname}?${sp.toString()}`;
                const i1 = document.createElement("input");
                i1.type = "hidden";
                i1.name = "_intent";
                i1.value = "view.saveAs";
                form.appendChild(i1);
                const i2 = document.createElement("input");
                i2.type = "hidden";
                i2.name = "name";
                i2.value = name;
                form.appendChild(i2);
                document.body.appendChild(form);
                form.submit();
                setTimeout(() => form.remove(), 0);
              }
            : undefined
        }
      />
      {activeViewObj && !isBuiltin ? (
        <>
          <Modal
            opened={renameOpen}
            onClose={() => setRenameOpen(false)}
            title="Rename view"
            size="sm"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = renameValue.trim();
                if (!trimmed) return;
                submitViewAction("view.rename", { name: trimmed });
                setRenameOpen(false);
              }}
            >
              <Group align="end" gap="sm">
                <TextInput
                  label="View name"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.currentTarget.value)}
                />
                <Button type="submit">Rename</Button>
              </Group>
            </form>
          </Modal>
          <Modal
            opened={duplicateOpen}
            onClose={() => setDuplicateOpen(false)}
            title="Duplicate view"
            size="sm"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = duplicateValue.trim();
                submitViewAction(
                  "view.duplicate",
                  trimmed ? { name: trimmed } : {}
                );
                setDuplicateOpen(false);
              }}
            >
              <Group align="end" gap="sm">
                <TextInput
                  label="New view name"
                  value={duplicateValue}
                  onChange={(e) => setDuplicateValue(e.currentTarget.value)}
                />
                <Button type="submit">Create</Button>
              </Group>
            </form>
          </Modal>
          <Modal
            opened={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            title="Delete view"
            size="sm"
          >
            <Stack gap="sm">
              <Text>
                Delete “{activeViewObj.name}”? This cannot be undone.
              </Text>
              <Group justify="flex-end" gap="xs">
                <Button variant="default" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  color="red"
                  onClick={() => {
                    submitViewAction("view.delete");
                    setDeleteOpen(false);
                  }}
                >
                  Delete
                </Button>
              </Group>
            </Stack>
          </Modal>
        </>
      ) : null}
    </>
  );
}
