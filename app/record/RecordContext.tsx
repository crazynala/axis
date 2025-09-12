import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "@remix-run/react";

export interface RecordRegistration<T = any> {
  module: string; // e.g. "invoices"
  records: T[];
  getId?: (r: T) => number | string;
  getPath?: (r: T) => string; // defaults to `/${module}/${id}`
}

interface RecordState extends Required<RecordRegistration<any>> {
  indexById: Map<string | number, number>;
  registeredAt: number;
}

interface RecordContextValue {
  state: RecordState | null;
  register: (reg: RecordRegistration) => void;
  clear: (module?: string) => void;
  nextId: (currentId: string | number | null) => string | number | null;
  prevId: (currentId: string | number | null) => string | number | null;
  getPathForId: (id: string | number) => string | null;
}

const RecordContext = createContext<RecordContextValue | null>(null);

export const RecordProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [state, setState] = useState<RecordState | null>(null);
  const register = useCallback((reg: RecordRegistration) => {
    const getId = reg.getId || ((r: any) => r.id);
    const getPath = reg.getPath || ((r: any) => `/${reg.module}/${getId(r)}`);
    const indexById = new Map<string | number, number>();
    reg.records.forEach((r, idx) => indexById.set(getId(r), idx));
    setState({ module: reg.module, records: reg.records, getId, getPath, indexById, registeredAt: Date.now() });
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
      const idx = state.indexById.get(id);
      if (idx == null) return null;
      const rec = state.records[idx];
      return state.getPath(rec);
    },
    [state]
  );
  return <RecordContext.Provider value={{ state, register, clear, nextId, prevId, getPathForId }}>{children}</RecordContext.Provider>;
};

export function useRecordContext() {
  const ctx = useContext(RecordContext);
  if (!ctx) throw new Error("useRecordContext must be used within RecordProvider");
  return ctx;
}

/** Component used by index routes to register their current page of records */
export const RegisterRecordBrowser: React.FC<RecordRegistration & { auto?: boolean }> = ({ auto = true, ...reg }) => {
  const { register, clear } = useRecordContext();
  const regRef = useRef(reg);
  useEffect(() => {
    regRef.current = reg;
    if (auto) register(reg);
    return () => {
      clear(reg.module);
    };
  }, [reg.module, reg.records, reg.getId, reg.getPath, auto, register, clear]);
  return null;
};

/** Header widget: shows prev/next navigation for the active module */
export const GlobalRecordBrowser: React.FC = () => {
  const { state, nextId, prevId, getPathForId } = useRecordContext();
  const location = useLocation();
  const navigate = useNavigate();
  if (!state || state.records.length === 0) return null;
  // Detect current id from path pattern /module/:id
  let currentId: string | number | null = null;
  const parts = location.pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] === state.module) {
    const idPart = parts[1];
    const num = Number(idPart);
    currentId = Number.isFinite(num) ? num : idPart; // allow string ids
  }
  const idx = currentId != null ? state.indexById.get(currentId) : undefined;
  const total = state.records.length;
  const doNav = (targetId: string | number | null) => {
    if (targetId == null) return;
    const path = getPathForId(targetId);
    if (path) navigate(path);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button type="button" disabled={prevId(currentId) == null} onClick={() => doNav(prevId(currentId))} style={{ padding: "2px 6px" }} title="Previous record (Page subset)">
        ◀
      </button>
      <span style={{ fontSize: 12, opacity: 0.8 }}>
        {state.module}: {idx != null ? idx + 1 : "-"}/{total}
      </span>
      <button type="button" disabled={nextId(currentId) == null} onClick={() => doNav(nextId(currentId))} style={{ padding: "2px 6px" }} title="Next record (Page subset)">
        ▶
      </button>
    </div>
  );
};

// Global hotkeys: ArrowUp = previous record, ArrowDown = next record (detail pages only)
export const GlobalRecordBrowserHotkeys: React.FC = () => {
  const { state, nextId, prevId, getPathForId } = useRecordContext();
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
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      // Only active on detail route (has id segment)
      const parts = location.pathname.split("/").filter(Boolean);
      if (!(parts.length >= 2 && parts[0] === state.module)) return;
      const idPart = parts[1];
      const num = Number(idPart);
      const currentId: number | string | null = Number.isFinite(num) ? num : idPart;
      if (e.key === "ArrowUp") {
        const target = prevId(currentId);
        if (target != null) {
          const path = getPathForId(target);
          if (path) {
            e.preventDefault();
            navigate(path);
          }
        }
      } else if (e.key === "ArrowDown") {
        const target = nextId(currentId);
        if (target != null) {
          const path = getPathForId(target);
          if (path) {
            e.preventDefault();
            navigate(path);
          }
        }
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true } as any);
  }, [state, location.pathname, nextId, prevId, getPathForId, navigate]);
  return null;
};
