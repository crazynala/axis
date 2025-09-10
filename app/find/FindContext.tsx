// app/find/FindContext.tsx
import { createContext, useContext, useMemo, useState, useEffect } from "react";

type Mode = "edit" | "find";
type FindStyle = "tint" | "dotted" | "accent" | "criteria";
const Ctx = createContext<{
  mode: Mode;
  setMode: (m: Mode) => void;
  style: FindStyle;
  setStyle: (s: FindStyle) => void;
}>({
  mode: "edit",
  setMode: () => {},
  style: "tint",
  setStyle: () => {},
});

export function FindProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("edit");
  const [style, setStyle] = useState<FindStyle>("tint");
  const v = useMemo(() => ({ mode, setMode, style, setStyle }), [mode, style]);
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
