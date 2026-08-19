import type { SystemDashboard } from "./types";
import { dashboard as journalDashboard } from "./journal/dashboard";
import { dashboard as expensesDashboard } from "./expenses/dashboard";
import { dashboard as habitsDashboard } from "./habits/dashboard";

/** Dashboard registrations, one per system — the dashboard-page counterpart
 *  of the manifest list in index.ts. Kept separate so route handlers that
 *  import manifests never pull in React components. */
export const dashboards: SystemDashboard[] = [
  journalDashboard,
  expensesDashboard,
  habitsDashboard,
];
