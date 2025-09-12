import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { useLocation, useNavigate } from "@remix-run/react";
import { ActionIcon, Group, Text, Tooltip } from "@mantine/core";
import {
  IconChevronsLeft,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsRight,
} from "@tabler/icons-react";

// ---------------------------
// Types
// ---------------------------
export interface RecordRegistration {
  module: string;
  records: any[];
  getId?: (r: any) => any;
  getPath?: (r: any) => string;
}

export interface RecordState {
  module: string;
  records: any[];
  getId: (r: any) => any;
  getPath: (r: any) => string;
  indexById: Map<string | number, number>;
  registeredAt: number;
  rowsMap: Map<any, any>;
  idList?: Array<string | number>;
  idIndexMap?: Map<string | number, number>;
  idListComplete?: boolean;
}

export interface RecordContextValue {
  state: RecordState | null;
  register: (reg: RecordRegistration) => void;
  clear: (module?: string) => void;
  appendRecords: (module: string, newRecords: any[]) => void;
  setIdList: (
    module: string,
    ids: Array<string | number>,
    complete: boolean
  ) => void;
  addRows: (
    module: string,
    rows: any[],
    opts?: { getId?: (r: any) => any; updateRecordsArray?: boolean }
  ) => void;
  currentId: string | number | null;
  setCurrentId: (id: string | number | null) => void;
  nextId: (currentId: string | number | null) => string | number | null;
  prevId: (currentId: string | number | null) => string | number | null;
  getPathForId: (id: string | number) => string | null;
}

const RecordContext = createContext<RecordContextValue | null>(null);

// ---------------------------
// Provider
// ---------------------------
export const RecordProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [state, setState] = useState<RecordState | null>(null);
  const [currentId, setCurrentId] = useState<string | number | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const register = useCallback((reg: RecordRegistration) => {
    const getId = reg.getId || ((r: any) => r.id);
    const getPath = reg.getPath || ((r: any) => `/${reg.module}/${getId(r)}`);
    const indexById = new Map<string | number, number>();
    reg.records.forEach((r, idx) => indexById.set(getId(r), idx));
    setState({
      module: reg.module,
      records: reg.records,
      getId,
      getPath,
      indexById,
      registeredAt: Date.now(),
      rowsMap: new Map(reg.records.map((r) => [getId(r), r])),
    });
  }, []);

  const setIdList = useCallback(
    (module: string, ids: Array<string | number>, complete: boolean) => {
      setState((prev) => {
        if (prev && prev.module !== module) prev = null as any;
        const base: RecordState =
          prev ||
          ({
            module,
            records: [],
            getId: (r: any) => r.id,
            getPath: (r: any) => `/${module}/${(r as any)?.id}`,
            indexById: new Map(),
            registeredAt: Date.now(),
            rowsMap: new Map(),
          } as RecordState);
        const idIndexMap = new Map<string | number, number>();
        ids.forEach((id, i) => idIndexMap.set(id, i));
        return { ...base, idList: ids, idListComplete: complete, idIndexMap };
      });
    },
    []
  );

  const addRows = useCallback(
    (
      module: string,
      rows: any[],
      opts?: { getId?: (r: any) => any; updateRecordsArray?: boolean }
    ) => {
      if (!rows.length) return;
      setState((prev) => {
        if (!prev || prev.module !== module) return prev;
        const getId = opts?.getId || prev.getId;
        const rowsMap = new Map(prev.rowsMap || []);
        rows.forEach((r) => rowsMap.set(getId(r), r));
        let records = prev.records;
        let indexById = prev.indexById;
        if (opts?.updateRecordsArray) {
          const existingIds = new Set(records.map((r) => getId(r)));
          const additions = rows.filter((r) => !existingIds.has(getId(r)));
          if (additions.length) {
            records = [...records, ...additions];
            indexById = new Map<string | number, number>();
            records.forEach((r, i) => indexById.set(getId(r), i));
          }
        }
        return { ...prev, rowsMap, records, indexById };
      });
    },
    []
  );

  const appendRecords = useCallback((module: string, newRecords: any[]) => {
    setState((prev) => {
      if (!prev || prev.module !== module) return prev;
      if (!newRecords.length) return prev;
      const existingIds = new Set(prev.records.map((r) => prev.getId(r)));
      const additions = newRecords.filter(
        (r) => !existingIds.has(prev.getId(r))
      );
      if (!additions.length) return prev;
      const merged = [...prev.records, ...additions];
      const indexById = new Map<string | number, number>();
      merged.forEach((r, idx) => indexById.set(prev.getId(r), idx));
      return { ...prev, records: merged, indexById };
    });
  }, []);

  const clear = useCallback((module?: string) => {
    setState((prev) => {
      if (!prev) return null;
      if (module && prev.module !== module) return prev;
      return null;
    });
  }, []);

  const nextId = useCallback(
    (cid: string | number | null) => {
      if (!state || cid == null) return null;
      if (state.idList && state.idIndexMap) {
        const idx = state.idIndexMap.get(cid);
        if (idx == null || idx + 1 >= state.idList.length) return null;
        return state.idList[idx + 1];
      }
      const idx = state.indexById.get(cid);
      if (idx == null || idx + 1 >= state.records.length) return null;
      return state.getId(state.records[idx + 1]);
    },
    [state]
  );

  const prevId = useCallback(
    (cid: string | number | null) => {
      if (!state || cid == null) return null;
      if (state.idList && state.idIndexMap) {
        const idx = state.idIndexMap.get(cid);
        if (idx == null || idx - 1 < 0) return null;
        return state.idList[idx - 1];
      }
      const idx = state.indexById.get(cid);
      if (idx == null || idx - 1 < 0) return null;
      return state.getId(state.records[idx - 1]);
    },
    [state]
  );

  const getPathForId = useCallback(
    (id: string | number) => {
      if (!state) return null;
      const row = state.rowsMap?.get(id);
      if (row) return state.getPath(row);
      const idx = state.indexById.get(id);
      if (idx != null) return state.getPath(state.records[idx]);
      return `/${state.module}/${id}`;
    },
    [state]
  );

  // Centralized keyboard navigation
  useEffect(() => {
    if (!state) return;
    const handler = (e: KeyboardEvent) => {
      if (!state) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
      ) {
        if (!(e.metaKey || e.ctrlKey)) return;
      }
      const parts = location.pathname.split("/").filter(Boolean);
      const isDetail = parts.length >= 2 && parts[0] === state.module;
      const isIndex = parts.length === 1 && parts[0] === state.module;
      let activeId: string | number | null = currentId;
      if (activeId == null && isDetail) {
        const idPart = parts[1];
        const num = Number(idPart);
        activeId = Number.isFinite(num) ? num : idPart;
      }
      const nav = (target: string | number | null) => {
        if (target == null) return;
        if (isIndex) {
          setCurrentId(target);
        } else {
          const p = getPathForId(target);
          if (p) navigate(p);
        }
      };
      if (e.key === "ArrowUp" && (isIndex || isDetail)) {
        const t = prevId(activeId);
        if (t != null) {
          e.preventDefault();
          nav(t);
        }
      } else if (e.key === "ArrowDown" && (isIndex || isDetail)) {
        const t = nextId(activeId);
        if (t != null) {
          e.preventDefault();
          nav(t);
        }
      } else if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "ArrowLeft" &&
        isDetail
      ) {
        const t = prevId(activeId);
        if (t != null) {
          e.preventDefault();
          nav(t);
        }
      } else if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "ArrowRight" &&
        isDetail
      ) {
        const t = nextId(activeId);
        if (t != null) {
          e.preventDefault();
          nav(t);
        }
      } else if (e.key === "Escape" && isDetail) {
        // Esc: return to index view for current module, preserving selection
        // If we have an activeId ensure it's registered so row highlights when returning
        if (activeId != null) {
          setCurrentId(activeId);
        }
        e.preventDefault();
        navigate(`/${state.module}`);
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true } as any);
  }, [
    state,
    location.pathname,
    currentId,
    nextId,
    prevId,
    getPathForId,
    navigate,
  ]);

  return (
    <RecordContext.Provider
      value={{
        state,
        register,
        clear,
        appendRecords,
        setIdList,
        addRows,
        currentId,
        setCurrentId,
        nextId,
        prevId,
        getPathForId,
      }}
    >
      {children}
    </RecordContext.Provider>
  );
};

// ---------------------------
// Hooks / Helpers
// ---------------------------
export function useRecordContext() {
  const ctx = useContext(RecordContext);
  if (!ctx)
    throw new Error("useRecordContext must be used within RecordProvider");
  return ctx;
}

export function useRegisterRecordBrowser(
  reg: RecordRegistration,
  auto: boolean = true
) {
  const { register, clear } = useRecordContext();
  const regRef = useRef(reg);
  useEffect(() => {
    regRef.current = reg;
    if (auto) register(reg);
    return () => {
      clear(reg.module);
    };
  }, [reg.module, reg.records, reg.getId, reg.getPath, auto, register, clear]);
}

export const RegisterRecordBrowser: React.FC<
  RecordRegistration & { auto?: boolean }
> = ({ auto = true, ...reg }) => {
  useRegisterRecordBrowser(reg, auto);
  return null;
};

export function useRecords() {
  const {
    register,
    appendRecords,
    setCurrentId,
    currentId,
    state,
    setIdList,
    addRows,
  } = useRecordContext();
  const setRecordSet = useCallback(
    (
      module: string,
      records: any[],
      opts?: { getId?: (r: any) => any; getPath?: (r: any) => string }
    ) => {
      register({ module, records, getId: opts?.getId, getPath: opts?.getPath });
    },
    [register]
  );
  const appendRecordBatch = useCallback(
    (module: string, more: any[]) => appendRecords(module, more),
    [appendRecords]
  );
  const setCurrentRecord = useCallback(
    (id: string | number | null) => setCurrentId(id),
    [setCurrentId]
  );
  return {
    state,
    setRecordSet,
    appendRecords: appendRecordBatch,
    setCurrentRecord,
    currentId,
    setCurrentId,
    setIdList,
    addRows,
  };
}

// ---------------------------
// UI Component (lightweight)
// ---------------------------
export const GlobalRecordBrowser: React.FC = () => {
  const { state, nextId, prevId, getPathForId, currentId, setCurrentId } =
    useRecordContext();
  const location = useLocation();
  const navigate = useNavigate();
  if (!state || (!state.idList && state.records.length === 0)) return null;
  let derivedId: string | number | null = currentId;
  if (derivedId == null) {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0] === state.module) {
      const idPart = parts[1];
      const num = Number(idPart);
      derivedId = Number.isFinite(num) ? num : idPart;
    }
  }
  let idx: number | undefined;
  let total = 0;
  if (state.idList && state.idIndexMap) {
    total = state.idList.length;
    if (derivedId != null) idx = state.idIndexMap.get(derivedId);
  } else {
    total = state.records.length;
    if (derivedId != null) idx = state.indexById.get(derivedId);
  }
  const isIndex = location.pathname === `/${state.module}`;
  const doNav = (targetId: string | number | null) => {
    if (targetId == null) return;
    if (isIndex) {
      setCurrentId(targetId);
      return;
    }
    const path = getPathForId(targetId);
    if (path) navigate(path);
  };
  const firstId = () => {
    if (!state) return null;
    if (state.idList && state.idList.length) return state.idList[0];
    if (state.records.length) return state.getId(state.records[0]);
    return null;
  };
  const lastId = () => {
    if (!state) return null;
    if (state.idList && state.idList.length)
      return state.idList[state.idList.length - 1];
    if (state.records.length)
      return state.getId(state.records[state.records.length - 1]);
    return null;
  };
  const canPrev = prevId(derivedId) != null;
  const canNext = nextId(derivedId) != null;
  const canFirst =
    derivedId != null && firstId() != null && derivedId !== firstId();
  const canLast =
    derivedId != null && lastId() != null && derivedId !== lastId();
  const posLabel = `${idx != null ? idx + 1 : "-"} / ${total}`;
  return (
    <Group gap={4} align="center" wrap="nowrap">
      <Tooltip label="First" withArrow disabled={!canFirst}>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="First record"
          disabled={!canFirst}
          onClick={() => doNav(firstId())}
        >
          <IconChevronsLeft size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Previous" withArrow disabled={!canPrev}>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="Previous record"
          disabled={!canPrev}
          onClick={() => doNav(prevId(derivedId))}
        >
          <IconChevronLeft size={16} />
        </ActionIcon>
      </Tooltip>
      <Text
        component="span"
        style={{
          fontSize: 12,
          opacity: 0.85,
          fontVariantNumeric: "tabular-nums",
          minWidth: 90,
          textAlign: "center",
          display: "inline-block",
        }}
      >
        {posLabel}
      </Text>
      <Tooltip label="Next" withArrow disabled={!canNext}>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="Next record"
          disabled={!canNext}
          onClick={() => doNav(nextId(derivedId))}
        >
          <IconChevronRight size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Last" withArrow disabled={!canLast}>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="Last record"
          disabled={!canLast}
          onClick={() => doNav(lastId())}
        >
          <IconChevronsRight size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
};
