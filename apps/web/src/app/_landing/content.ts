import type { IconName } from "@/app/_components/Icon";

// Copy shared by the landing page and its social card, so the link preview
// on a portfolio and the page it opens never drift apart.

export const HEADLINE = "Software for one life.";

export const PAGE_TITLE = "Polaris — a personal operating system";

export const DESCRIPTION =
  "A personal operating system: my own productivity systems — a journal, an " +
  "expense tracker, and a habit tracker — built in code I own and rewrite as " +
  "my needs change.";

export interface LandingSystem {
  key: "journal" | "expenses" | "habits";
  name: string;
  icon: IconName;
  /** Folder under src/systems — shown as a mono path. */
  path: string;
  /** Month the first version shipped. */
  since: string;
  summary: string;
  /** One line for the social card, where there's no room for the summary. */
  short: string;
}

export const SYSTEMS: LandingSystem[] = [
  {
    key: "journal",
    name: "Engineering journal",
    icon: "book-open",
    path: "systems/journal",
    since: "Apr 2026",
    summary: "A daily micro-log of what I'm building, learning, and working on.",
    short: "Daily micro-log, filed by topic",
  },
  {
    key: "expenses",
    name: "Activity expenses",
    icon: "receipt",
    path: "systems/expenses",
    since: "Jun 2026",
    summary:
      "What an outing costs, captured while it happens. It replaced a two-column Google Sheet.",
    short: "Costs captured mid-errand",
  },
  {
    key: "habits",
    name: "Habit tracker",
    icon: "repeat",
    path: "systems/habits",
    since: "Jul 2026",
    summary: "A weekly tracker where each day is off, partial, or complete.",
    short: "Weekly ticks, logged to the journal",
  },
];
