export function isSheetPath(pathname: string): boolean {
  return pathname.endsWith("/sheet") || pathname.includes("-sheet");
}
