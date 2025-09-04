declare module "packages/timber" {
  export * from "../../packages/timber/src/index";
  export * from "../../packages/timber/src/admin/recordBrowserProvider";
  // Explicit named exports to satisfy TS when consuming the barrel re-exports
  export const GlobalFormProvider: any;
  export const SaveCancelHeader: any;
  export const BreadcrumbSet: any;
  export const RecordBrowserProvider: any;
  export const RecordNavButtons: any;
  export function useRecordBrowser(currentId: any, masterRecords?: any[] | null): any;
  export function useInitGlobalFormContext<T>(formHandlers: any, onSubmit: (data: T) => void, onCancel: () => void): any;
  // Keyboard
  export type HotkeyTuple = [string, (event: KeyboardEvent) => void, { preventDefault?: boolean }?];
  export function useKeyboardShortcuts(hotkeys: HotkeyTuple[], deps?: any[]): void;
  export function useGlobalSaveShortcut(): void;
  export function useRecordBrowserShortcuts(currentId: any, masterRecords?: any[] | null): any;
}
