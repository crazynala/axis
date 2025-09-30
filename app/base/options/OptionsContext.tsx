import React, { createContext, useContext, useMemo } from "react";
import type { OptionsData } from "./OptionsClient";
import { getGlobalOptions } from "./OptionsClient";

type OptionsContextValue = OptionsData | null;

const OptionsContext = createContext<OptionsContextValue>(null);

export function OptionsProvider({
  value,
  children,
}: {
  value: OptionsData | null | undefined;
  children: React.ReactNode;
}) {
  // Prefer explicit value from root loader; fall back to singleton if missing
  const provided = useMemo<OptionsContextValue>(() => {
    return value ?? getGlobalOptions() ?? null;
  }, [value]);
  return (
    <OptionsContext.Provider value={provided}>
      {children}
    </OptionsContext.Provider>
  );
}

export function useOptions(): OptionsData | null {
  // Hook for components to consume options anywhere in the tree
  const ctx = useContext(OptionsContext);
  return ctx ?? getGlobalOptions();
}
