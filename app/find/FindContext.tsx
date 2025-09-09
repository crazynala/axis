// app/find/FindContext.tsx
import { createContext, useContext, useMemo, useState } from "react";

type Mode = "edit" | "find";
const Ctx = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({
  mode: "edit",
  setMode: () => {},
});

export function FindProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("edit");
  const v = useMemo(() => ({ mode, setMode }), [mode]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}
export const useFind = () => useContext(Ctx);
