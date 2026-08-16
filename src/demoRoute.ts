export function demoRoute(location?: { search?: string }): string | null {
  const search = location?.search;
  return search ? new URLSearchParams(search).get("demo") : null;
}
