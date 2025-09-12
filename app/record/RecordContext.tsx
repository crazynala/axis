import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { useLocation, useNavigate } from "@remix-run/react";

export interface RecordRegistration<T = any> {
  module: string; // e.g. "invoices"
  records: T[];
  getId?: (r: T) => number | string;
  getPath?: (r: T) => string; // defaults to `/${module}/${id}`
}

interface RecordState extends Required<RecordRegistration<any>> {
  indexById: Map<string | number, number>; // order for loaded records array
  registeredAt: number;
  /** Full ordered identity list for current filter/sort scope (hybrid mode) */
  idList?: Array<string | number>;
  /** Whether idList represents the entire result set (true) or only a prefix (false) */
  idListComplete?: boolean;
  /** Index map for idList if present */
  idIndexMap?: Map<string | number, number>;
  /** Sparse cache of row objects keyed by id (may include more than appears in records) */
  rowsMap?: Map<string | number, any>;
}

interface RecordContextValue {
  state: RecordState | null;
  register: (reg: RecordRegistration) => void;
  clear: (module?: string) => void;
  /** Explicit currently focused record id (detail route), optional */
  currentId: string | number | null;
  setCurrentId: (id: string | number | null) => void;
  /** Append additional records for the same module (legacy/infinite scroll loaded rows) */
  appendRecords: (module: string, newRecords: any[]) => void;
  /** Define/replace the ordered identity list (hybrid A' light). */
  setIdList: (
    module: string,
    ids: Array<string | number>,
    complete: boolean
  ) => void;
  /** Add/merge row objects into sparse cache. */
  addRows: (
    module: string,
    rows: any[],
    opts?: { getId?: (r: any) => any; updateRecordsArray?: boolean }
  ) => void;
  nextId: (currentId: string | number | null) => string | number | null;
  prevId: (currentId: string | number | null) => string | number | null;
  getPathForId: (id: string | number) => string | null;
}

const RecordContext = createContext<RecordContextValue | null>(null);

export const RecordProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [state, setState] = useState<RecordState | null>(null);
  const [currentId, setCurrentId] = useState<string | number | null>(null);
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
        if (prev && prev.module !== module) return prev; // different module active
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
        return {
          ...base,
          idList: ids,
          idListComplete: complete,
          idIndexMap,
        };
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
      if (module && prev.module !== module) return prev; // ignore clear for other module
      return null;
    });
  }, []);
  const nextId = useCallback(
    (currentId: string | number | null) => {
      if (!state || currentId == null) return null;
      // Prefer idList ordering if present
      if (state.idList && state.idIndexMap) {
        const idx = state.idIndexMap.get(currentId);
        if (idx == null) return null;
        if (idx + 1 >= state.idList.length) return null;
        return state.idList[idx + 1];
      }
      const idx = state.indexById.get(currentId);
      if (idx == null) return null;
      if (idx + 1 >= state.records.length) return null;
      return state.getId(state.records[idx + 1]);
    },
    [state]
  );
  const prevId = useCallback(
    (currentId: string | number | null) => {
      if (!state || currentId == null) return null;
      if (state.idList && state.idIndexMap) {
        const idx = state.idIndexMap.get(currentId);
        if (idx == null) return null;
        if (idx - 1 < 0) return null;
        return state.idList[idx - 1];
      }
      const idx = state.indexById.get(currentId);
      if (idx == null) return null;
      if (idx - 1 < 0) return null;
      return state.getId(state.records[idx - 1]);
    },
    [state]
  );
  const getPathForId = useCallback(
    (id: string | number) => {
      if (!state) return null;
      // Try to get a row from rowsMap first (sparse cache)
      const row = state.rowsMap?.get(id);
      if (row) return state.getPath(row);
      // Fallback: if record present in loaded records
      const idx = state.indexById.get(id);
      if (idx != null) return state.getPath(state.records[idx]);
      // Last resort: canonical pattern
      return `/${state.module}/${id}`;
    },
    [state]
  );
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

export function useRecordContext() {
  const ctx = useContext(RecordContext);
  if (!ctx)
    throw new Error("useRecordContext must be used within RecordProvider");
  return ctx;
}

/** Component used by index routes to register their current page of records */
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

/**
 * New low-level API: manual control over dataset and current record.
 * Does NOT auto-clear on unmount; caller decides lifecycle.
 * Intended to replace useRegisterRecordBrowser in routes that should not
 * wipe the record set when they unmount (e.g. index -> detail transitions).
 */
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

/** Header widget: shows prev/next navigation for the active module */
export const GlobalRecordBrowser: React.FC = () => {
  const { state, nextId, prevId, getPathForId, currentId, setCurrentId } =
    useRecordContext();
  const location = useLocation();
  const navigate = useNavigate();
  // Allow rendering even before any hydrated rows if we have an idList (hybrid mode)
  if (!state || (!state.idList && state.records.length === 0)) return null;
  // derive from path only if not explicitly set
  let derivedId: string | number | null = currentId;
  if (derivedId == null) {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0] === state.module) {
      const idPart = parts[1];
      const num = Number(idPart);
      derivedId = Number.isFinite(num) ? num : idPart;
    }
  }
  // Prefer identity roster ordering if present
  let idx: number | undefined;
  let total: number = 0;
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
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button
        type="button"
        disabled={prevId(derivedId) == null}
        onClick={() => doNav(prevId(derivedId))}
        style={{ padding: "2px 6px" }}
        title="Previous record"
      >
        ◀
      </button>
      <span style={{ fontSize: 12, opacity: 0.8 }}>
        {state.module}: {idx != null ? idx + 1 : "-"}/{total}
      </span>
      <button
        type="button"
        disabled={nextId(derivedId) == null}
        onClick={() => doNav(nextId(derivedId))}
        style={{ padding: "2px 6px" }}
        title="Next record"
      >
        ▶
      </button>
    </div>
  );
};

// Global hotkeys: ArrowUp = previous record, ArrowDown = next record (detail pages only)
export const GlobalRecordBrowserHotkeys: React.FC = () => {
  const { state, nextId, prevId, getPathForId, currentId, setCurrentId } =
    useRecordContext();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!state) return;
    const handler = (e: KeyboardEvent) => {
      if (!state) return;
      // Ignore if modifier keys
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Ignore if focusing an editable element
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      // Only active on detail route (has id segment)
      let activeId: number | string | null = currentId;
      if (activeId == null) {
        const parts = location.pathname.split("/").filter(Boolean);
        if (!(parts.length >= 2 && parts[0] === state.module)) return;
        const idPart = parts[1];
        const num = Number(idPart);
        activeId = Number.isFinite(num) ? num : idPart;
      }
      const isIndex = location.pathname === `/${state.module}`;
      if (e.key === "ArrowUp") {
        const target = prevId(activeId);
        if (target != null) {
          e.preventDefault();
          if (isIndex) setCurrentId(target);
          else {
            const path = getPathForId(target);
            if (path) navigate(path);
          }
        }
      } else if (e.key === "ArrowDown") {
        const target = nextId(activeId);
        if (target != null) {
          e.preventDefault();
          if (isIndex) setCurrentId(target);
          else {
            const path = getPathForId(target);
            if (path) navigate(path);
          }
        }
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true } as any);
  }, [state, location.pathname, nextId, prevId, getPathForId, navigate]);
  return null;
};
