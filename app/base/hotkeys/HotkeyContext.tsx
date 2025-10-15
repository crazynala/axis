import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

export type HotkeyHandler = (e: KeyboardEvent) => boolean | void;

interface HotkeyApi {
  push: (handler: HotkeyHandler) => () => void;
}

const HotkeyContext = createContext<HotkeyApi | null>(null);

export const HotkeyProvider: React.FC<
  React.PropsWithChildren<{ disabled?: boolean }>
> = ({ children, disabled }) => {
  const stackRef = useRef<HotkeyHandler[]>([]);
  const api: HotkeyApi = useMemo(
    () => ({
      push: (handler: HotkeyHandler) => {
        stackRef.current = [...stackRef.current, handler];
        return () => {
          const idx = stackRef.current.lastIndexOf(handler);
          if (idx >= 0) {
            const next = stackRef.current.slice();
            next.splice(idx, 1);
            stackRef.current = next;
          }
        };
      },
    }),
    []
  );
  const handleKeydown = useCallback((e: KeyboardEvent) => {
    const arr = stackRef.current;
    for (let i = arr.length - 1; i >= 0; i--) {
      try {
        const handled = arr[i](e);
        if (handled) {
          // If handler returned true, treat as handled and stop propagation chain
          break;
        }
      } catch {
        // ignore handler errors
      }
    }
  }, []);

  useEffect(() => {
    if (disabled) return;
    // Use bubble phase so focused widgets (like grids/editors) get first crack at key events
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown as any);
  }, [handleKeydown, disabled]);

  return (
    <HotkeyContext.Provider value={api}>{children}</HotkeyContext.Provider>
  );
};

export function useHotkeysApi() {
  const ctx = useContext(HotkeyContext);
  if (!ctx) throw new Error("useHotkeysApi must be used within HotkeyProvider");
  return ctx;
}

// Convenience hook to push a handler on mount and pop on unmount
export function useHotkeyScope(
  handler: HotkeyHandler | null | undefined,
  deps: React.DependencyList = []
) {
  const { push } = useHotkeysApi();
  const handlerRef = useRef<HotkeyHandler | null>(null);
  // Always reflect latest handler in a ref so the pushed wrapper can consult it
  useEffect(() => {
    handlerRef.current = handler || null;
  }, [handler, ...deps]);
  // Register when a non-null handler is provided; unregister when it changes or becomes null
  useEffect(() => {
    if (!handler) return;
    const dispose = push((e) =>
      handlerRef.current ? !!handlerRef.current(e) : false
    );
    return dispose;
  }, [push, handler]);
}

// Squelch all hotkeys in a scope (e.g., active modal)
export function useSquelchHotkeys(active: boolean) {
  useHotkeyScope(active ? () => true : null, [active]);
}
