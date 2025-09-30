// app/find/FindContext.tsx
import { createContext, useContext, useMemo, useState, useEffect } from "react";

type Mode = "edit" | "find";
type FindStyle = "tint" | "dotted" | "accent" | "criteria";
type FindCallbacks = {
  triggerFind: () => boolean; // returns true if a callback handled it
  registerFindCallback: (cb: () => void) => () => void;
};

const Ctx = createContext<
  {
    mode: Mode;
    setMode: (m: Mode) => void;
    style: FindStyle;
    setStyle: (s: FindStyle) => void;
  } & FindCallbacks
>({
  mode: "edit",
  setMode: () => {},
  style: "tint",
  setStyle: () => {},
  triggerFind: () => false,
  registerFindCallback: () => () => {},
});

export function FindProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("edit");
  const [style, setStyle] = useState<FindStyle>("tint");
  const callbacksRef = useState<Set<() => void>>(() => new Set())[0];
  const registerFindCallback = (cb: () => void) => {
    callbacksRef.add(cb);
    return () => callbacksRef.delete(cb);
  };
  const triggerFind = () => {
    if (callbacksRef.size === 0) return false;
    // Call the most recently registered (last) to allow nested components overriding
    let handled = false;
    const arr = Array.from(callbacksRef.values());
    for (let i = arr.length - 1; i >= 0; i--) {
      try {
        arr[i]();
        handled = true;
        break;
      } catch {
        // ignore and continue
      }
    }
    return handled;
  };
  const v = useMemo(
    () => ({
      mode,
      setMode,
      style,
      setStyle,
      triggerFind,
      registerFindCallback,
    }),
    [mode, style, callbacksRef]
  );
  // Side-effect: expose mode globally for root-level visual styling without lifting provider
  useEffect(() => {
    try {
      const el = document.documentElement;
      // Always reflect current mode for generic selectors
      el.dataset.mode = mode;
      if (mode === "find") {
        el.dataset.findMode = "true";
        el.dataset.findStyle = style;
      } else {
        if (el.dataset.findMode) delete el.dataset.findMode;
        if (el.dataset.findStyle) delete el.dataset.findStyle;
      }
      return () => {
        // cleanup only if leaving component entirely
        if (el.dataset.findMode === "true") delete el.dataset.findMode;
        if (el.dataset.findStyle) delete el.dataset.findStyle;
        if (el.dataset.mode) delete el.dataset.mode;
      };
    } catch {
      // SSR / safety no-op
    }
  }, [mode, style]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}
export const useFind = () => useContext(Ctx);
export function useIsFindMode() {
  const { mode } = useFind();
  return mode === "find";
}
