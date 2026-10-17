export const SORT_ORDER_KEY = "polaris:journal:sortOrder";

export type SortOrder = "asc" | "desc";

export function parseSortOrder(value: unknown): SortOrder {
  return value === "asc" || value === "desc" ? value : "desc";
}
