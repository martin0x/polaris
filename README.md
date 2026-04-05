Project: Polaris
Author: Raymart Villos
Category: Productivity, Journaling, Personal Operating System

## Summary

Polaris is a personal operating system — a continuously evolving, developer-owned platform for building and refining productivity systems tailored to my life. In the era of LLMs and AI-assisted development, software is cheap to write and rewrite. Polaris leans into that by being customizable at the source code level: no plugins, no config files — just well-organized code I modify directly.

## Concepts

### Systems

A system is a self-contained module built on the Polaris platform to manage a specific domain of life or work. Each system has its own data, UI, and logic. Systems can contain subsystems for more focused concerns within the same domain.

**Examples:**
- A **project management** system with Kanban boards, task priorities, and deadline alerts.
- A **budget management** system that tracks expenses, income, and financial goals. Within it, a **grocery shopping** subsystem for recording item names and prices during a shopping session.
- A **job search** system that scrapes job postings from online boards and uses AI to rank them against defined criteria.

### Feedback Mechanisms

Every system should have built-in feedback mechanisms to evaluate whether the system is actually working. These fall into three types:

1. **Metrics** — Automated, quantitative tracking. Usage frequency, completion rates, streaks, cost trends. The system collects these passively.
2. **Reflections** — Qualitative notes on what's working and what isn't. Strengths, weaknesses, and ideas for improvement — written manually or prompted by AI.
3. **Iteration History** — A changelog of how the system has evolved over time. What was changed, why, and what happened after. This gives me a record to reflect on my patterns of improvement.

The goal is to feed this data into the next iteration of building or refactoring a system, creating a continuous improvement loop.

### Integrations

Integrations are platform-level connectors to external services that already work for me. They are shared infrastructure — any system can use them.

**Example:** If Google Calendar is my calendar of choice, I build a Google Calendar integration once at the platform level. Then my habit tracking system, daily journaling system, and any future system can all plug into it without duplicating the connection logic.

## North Star

Polaris has three guiding principles.

### Personal

- **Polaris is mine.** It is built for one user — me. There is no multi-tenancy, no plugin API, no generalized config. The platform provides minimal scaffolding (authentication, database, API layer, file storage, integrations) and everything else is a system I build and modify directly.
- **Polaris is agile.** The tech stack should emphasize low friction for migrations, refactoring, and pivoting. Building and tearing down systems should be easy.

### Continuously Improving

- **Polaris has feedback loops.** Every system tracks its own effectiveness through metrics, reflections, and iteration history so I can evaluate whether it's earning its place.
- **Polaris remembers.** The history of improvements, refactors, and pivots is preserved — not just in git, but as structured data I can query and reflect on.

### Accessible

- **Polaris integrates with what already works.** External services are connected at the platform level and made available to any system as plug-and-play connectors.
- **Polaris is available where I need it.** The platform is web-first but must be usable on other devices like phones and tablets. Where possible, it should leverage device capabilities — for example, using a phone's camera during a grocery shopping session to capture item photos.

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **Frontend** | Nuxt 4 (Vue) | Stable framework, strong ecosystem for journaling (Tiptap), dashboards, and Kanban. Reliable AI-assisted code generation. |
| **Backend / BaaS** | Supabase | Managed PostgreSQL with built-in auth, real-time subscriptions, edge functions, file storage, and pgvector for AI features. |
| **Database** | PostgreSQL (via Supabase) | Full SQL for analytics queries, JSONB for flexible metadata, pgvector for semantic search. |
| **ORM** | Drizzle | Type-safe, schema-as-code. Each system module gets its own schema file. Migrations are auto-generated. |
| **Deployment** | Cloudflare Pages | Free tier with unlimited bandwidth. SvelteKit/Nuxt adapter available. Supabase handles backend concerns. |
| **File Storage** | Supabase Storage + Cloudflare R2 | Supabase Storage for app-managed files (1 GB free). R2 as overflow or for direct uploads (10 GB free). |
| **Mobile** | PWA first, Capacitor as escape hatch | PWA covers most use cases at zero cost. Capacitor wraps the same codebase in a native shell if iOS limitations (background sync, reliable offline storage) become a real problem. |
| **AI** | API-based LLMs + pgvector | External LLM APIs (Anthropic, OpenAI) via Supabase Edge Functions. Embeddings stored in PostgreSQL via pgvector for semantic search across systems. |

## Roadmap

### Phase 0 — Platform Scaffold

The foundation. No user-facing features — just the skeleton, deployed and running.

- Nuxt 4 project with Drizzle ORM connected to Supabase
- Supabase Auth (single user, Google OAuth or email/password)
- Migration workflow established (drizzle-kit generate → migrate)
- PWA manifest + service worker (installable, basic offline shell)
- Cloudflare Pages deployment pipeline (git push → live)
- App shell with navigation layout
- Established convention for system modules (directory structure, schema file pattern)

**Done when:** Logged in, empty dashboard visible, app deployed on Cloudflare Pages and installable as a PWA on phone.

### Phase 1 — Journaling System

First system, end-to-end. Exercises rich text, time-series data, search, and feedback mechanisms.

- Daily journal entries with rich text editing (Tiptap)
- Entry listing with date navigation
- Search across entries (PostgreSQL full-text search)
- First feedback mechanism implementation:
  - **Metrics** — entry count, streak tracking, word count trends
  - **Reflections** — periodic prompt ("How is your journaling habit working?")
  - **Iteration History** — first changelog entry recorded as structured data
- Mobile-responsive layout (usable on phone via PWA)

**Done when:** Journaling daily in Polaris with visible metrics on the journaling habit.

### Phase 2 — Standup Notes + Platform Patterns

Second system forces extraction of reusable platform patterns. Standup notes are structured (yesterday/today/blockers), daily-use, and different enough from journaling to stress-test the architecture.

- Standup notes system with structured fields (what I did, what I'm doing, blockers)
- Extract feedback mechanisms into a reusable platform pattern (shared across systems, not copy-pasted)
- Iteration History as a structured, queryable table
- Home dashboard showing status across both systems
- Refine the system module convention based on lessons from building two systems

**Done when:** Two systems running with shared feedback infrastructure and a cross-system home dashboard.

### Phase 3 — Integrations + AI

The "smart" layer on top of a solid platform.

- First platform-level integration: Google Calendar (available to any system)
- Embeddings pipeline: Edge Function generates embeddings on save, stored via pgvector
- Semantic search across journal entries
- AI-prompted reflections: LLM reads recent entries/metrics and generates targeted reflection questions
- Connect Google Calendar to at least one system (e.g., journaling shows calendar context for each day)

**Done when:** Semantic search works, AI-generated reflection prompts appear, and calendar data is visible within a system.

### Phase 4 — Expansion (ongoing)

Build new systems based on real daily friction, not hypotheticals.

**Candidates:**
- Budget management (with grocery subsystem)
- Habit tracking
- Job search
- Reading/learning tracker

**Also in scope:**
- Additional platform-level integrations as needed
- Capacitor upgrade if PWA gaps cause real pain
- Cross-system AI insights and automated weekly summaries
