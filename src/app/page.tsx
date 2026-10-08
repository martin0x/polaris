import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { getOptionalSession } from "@/platform/auth/session";
import { Icon, type IconName } from "@/app/_components/Icon";
import { PolarisGlyph } from "@/app/_components/PolarisGlyph";
import {
  DESCRIPTION,
  HEADLINE,
  PAGE_TITLE,
  SYSTEMS,
  type LandingSystem,
} from "@/app/_landing/content";
import { SOURCE_URL } from "@/lib/site";
import { MANILA_TZ } from "@/systems/expenses/lib/months";

// The public face of Polaris — the one page outside the sign-in wall, and
// the link a portfolio shares. The social card lives in opengraph-image.tsx
// and twitter-image.tsx beside this file; everything else in the app stays
// noindex (root layout).
export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Polaris",
    title: PAGE_TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: DESCRIPTION,
  },
};

const PRINCIPLES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "user",
    title: "Personal",
    body: "One user. No multi-tenancy, no plugin API, no settings pages. The platform supplies sign-in, data, and navigation; everything else is a system I edit directly.",
  },
  {
    icon: "activity",
    title: "Continuously improving",
    body: "Every system tracks whether it's working — metrics it records on its own, reflections I write, and a history of what changed and why.",
  },
  {
    icon: "compass",
    title: "Where I need it",
    body: "Web-first, built for the phone too. The expense tracker is designed to be used one-handed in a store aisle.",
  },
];

const FEATURES: Record<LandingSystem["key"], ReactNode[]> = {
  journal: [
    "Short, timestamped entries filed under topics",
    <>
      Inline <span className="tag-inline">#tags</span> and{" "}
      <span className="wikilink">[[topic]]</span> links
    </>,
    "Markdown editor with checklists",
    "Full-text search across every entry",
  ],
  expenses: [
    "One tap to start a grocery run or a night out",
    "Phone-first capture with a running total",
    "Items save instantly and sync through dead zones",
    "Monthly trends by activity type",
  ],
  habits: [
    "Partial days still keep a streak alive",
    "Consistency trend, streaks, and heatmaps",
    "Every habit keeps its own journal topic",
    "Logs show up as diamonds under the day",
  ],
};

const PLATFORM: { icon: IconName; label: string }[] = [
  { icon: "key-round", label: "Sign-in" },
  { icon: "database", label: "Data" },
  { icon: "command", label: "Command palette" },
  { icon: "layout-dashboard", label: "Today dashboard" },
  { icon: "activity", label: "Feedback" },
];

const CONTRACTS: { icon: IconName; title: string; body: ReactNode }[] = [
  {
    icon: "repeat",
    title: "Habits and journal",
    body: (
      <>
        The one direct tie between systems. Creating a habit creates a journal
        topic with the same name, and renames and archives stay in step. A log
        written from the tracker is a journal entry in that topic — and it comes
        back as a diamond under the day it was written.
      </>
    ),
  },
  {
    icon: "command",
    title: "Command palette",
    body: (
      <>
        Each manifest declares searchable layers. <kbd>⌘K</kbd> jumps to any
        system, drills from a topic down to a single note, or searches every
        system at once.
      </>
    ),
  },
  {
    icon: "layout-dashboard",
    title: "Today dashboard",
    body: (
      <>
        Each system registers a card and a one-line summary. The dashboard
        stitches them into a single sentence, so the day starts from one view
        instead of three.
      </>
    ),
  },
  {
    icon: "activity",
    title: "Feedback loop",
    body: (
      <>
        Systems record metrics as a side effect of use — entries written, items
        per activity, what each outing cost. Reflections and an iteration
        history sit beside them, so each rebuild starts from evidence.
      </>
    ),
  },
];

const STACK = ["TypeScript", "Next.js 16", "React 19", "Postgres", "Prisma", "Bun"];

function system(key: LandingSystem["key"]): LandingSystem {
  return SYSTEMS.find((s) => s.key === key)!;
}

export default async function LandingPage() {
  const isAuthenticated = Boolean((await getOptionalSession())?.user);
  const now = new Date();
  const day = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: MANILA_TZ,
  });
  const month = now.toLocaleDateString("en-US", {
    month: "long",
    timeZone: MANILA_TZ,
  });

  return (
    <div className="lp">
      <header className="lp-bar">
        <div className="lp-bar-inner">
          <Link href="/" className="lp-brand" aria-label="Polaris home">
            <PolarisGlyph size={16} />
            <span>Polaris</span>
          </Link>
          <nav className="lp-nav" aria-label="Page">
            <a className="btn btn-ghost lp-nav-section" href="#systems">
              Systems
            </a>
            <a className="btn btn-ghost lp-nav-section" href="#architecture">
              Architecture
            </a>
            <a className="btn btn-ghost lp-btn" href={SOURCE_URL}>
              Source
              <Icon name="arrow-up-right" size={14} />
            </a>
            {isAuthenticated && (
              <Link className="btn btn-secondary" href="/dashboard">
                Open dashboard
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="lp-main">
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <p className="overline">A personal operating system</p>
            <h1>{HEADLINE}</h1>
            <p className="lead">
              Polaris is where I build my own productivity systems — each one
              shaped to exactly how I work, in code I can rewrite the day that
              stops being true.
            </p>
            <div className="lp-actions">
              <a className="btn btn-primary lp-btn" href="#systems">
                See the systems
                <Icon name="arrow-right" size={14} />
              </a>
              <a className="btn btn-secondary lp-btn" href={SOURCE_URL}>
                Read the source
                <Icon name="arrow-up-right" size={14} />
              </a>
            </div>
          </div>

          <figure className="paper-card lp-preview">
            <div className="lp-preview-bar">
              <PolarisGlyph size={14} />
              <span>Polaris</span>
              <span className="lp-preview-sep">›</span>
              <span className="lp-preview-cur">Today</span>
            </div>
            <div className="lp-preview-body">
              <p className="lp-preview-title">Today</p>
              <p className="lp-preview-line">
                {day} — 2 entries today, ₱1,284.50 spent this month, 3 of 4
                habits ticked today.
              </p>
              <div className="lp-preview-cards">
                <PreviewCard label="Journal" stat="2 entries" caption="today" />
                <PreviewCard
                  label="Expenses"
                  stat="₱1,284.50"
                  caption={`${month} so far`}
                />
                <PreviewCard label="Habits" stat="3 of 4" caption="ticked today" />
              </div>
            </div>
            <figcaption className="lp-preview-note">
              The Today dashboard, with sample numbers
            </figcaption>
          </figure>
        </section>

        <section className="lp-section" id="idea" aria-labelledby="idea-title">
          <div className="lp-copy">
            <p className="overline">The exercise</p>
            <h2 id="idea-title">Build the tool instead of bending to one</h2>
            <p>
              Productivity apps are built for everyone, so they fit no one
              exactly. You adapt your routine to their data model, ignore most
              of their features, and keep a spreadsheet on the side for the one
              thing they can&apos;t do.
            </p>
            <p>
              AI-assisted development changes that trade-off. When software is
              cheap to write and cheap to rewrite, it&apos;s reasonable to build a
              system for each part of life that needs one — sized to the actual
              problem — and to rebuild it when the problem changes. Polaris is
              that exercise, run on one person: me.
            </p>
          </div>
          <div className="lp-grid">
            {PRINCIPLES.map((p) => (
              <article key={p.title} className="paper-card lp-card">
                <div className="lp-card-head">
                  <Icon name={p.icon} size={20} />
                  <h3>{p.title}</h3>
                </div>
                <p>{p.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="lp-section"
          id="systems"
          aria-labelledby="systems-title"
        >
          <div className="lp-copy">
            <p className="overline">Systems</p>
            <h2 id="systems-title">What&apos;s built so far</h2>
            <p>
              Each system is a self-contained module with its own data,
              interface, and logic. They share a platform, not code.
            </p>
          </div>
          <div className="lp-grid">
            {SYSTEMS.map((s) => (
              <article key={s.key} className="paper-card lp-card">
                <div className="lp-card-head">
                  <span className="lp-system-icon">
                    <Icon name={s.icon} size={20} />
                  </span>
                  <h3>{s.name}</h3>
                </div>
                <span className="lp-meta">
                  {s.path} · since {s.since}
                </span>
                <p>{s.summary}</p>
                <ul className="lp-features">
                  {FEATURES[s.key].map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section
          className="lp-section"
          id="architecture"
          aria-labelledby="architecture-title"
        >
          <div className="lp-copy">
            <p className="overline">Architecture</p>
            <h2 id="architecture-title">How the pieces connect</h2>
            <p>
              Systems don&apos;t import each other. Each one registers with the
              platform through a manifest, and the platform handles everything
              that cuts across them. There is one deliberate exception.
            </p>
          </div>

          <figure className="lp-diagram">
            <div className="lp-diagram-systems">
              <DiagramNode system={system("expenses")} />
              <DiagramNode system={system("journal")} />
              <div className="lp-link" aria-hidden="true">
                <span className="lp-link-row">
                  <Icon name="arrow-left" size={14} className="lp-link-arrow" />
                  topic + logs
                </span>
                <span className="lp-link-row">
                  entries
                  <Icon name="diamond" size={14} className="lp-link-diamond" />
                  <Icon name="arrow-right" size={14} className="lp-link-arrow" />
                </span>
              </div>
              <DiagramNode system={system("habits")} />
            </div>
            <div className="paper-card lp-platform">
              <div className="lp-platform-head">
                <span className="overline">Platform</span>
                <span className="lp-meta">manifest.ts · dashboard.tsx</span>
              </div>
              <ul className="lp-chips">
                {PLATFORM.map((p) => (
                  <li key={p.label} className="lp-chip">
                    <Icon name={p.icon} size={14} />
                    {p.label}
                  </li>
                ))}
              </ul>
            </div>
            <figcaption className="caption lp-diagram-caption">
              Three systems on one platform. Habits writes logs into the
              journal and reads them back; the others stand alone.
            </figcaption>
          </figure>

          <dl className="lp-contracts">
            {CONTRACTS.map((c) => (
              <div key={c.title} className="lp-contract">
                <dt>
                  <Icon name={c.icon} size={16} />
                  {c.title}
                </dt>
                <dd>{c.body}</dd>
              </div>
            ))}
          </dl>

          <div className="lp-code">
            <div className="lp-copy">
              <h3>Adding a system</h3>
              <p>
                A new system starts as a copy of{" "}
                <code className="mono-inline">systems/_template</code>. Its
                manifest is the whole contract — listing it in{" "}
                <code className="mono-inline">systems/index.ts</code> mounts its
                API routes and puts it in the sidebar and the command palette.
                No plugin API, no config file.
              </p>
            </div>
            <figure className="lp-code-file">
              <figcaption className="lp-meta">
                systems/expenses/manifest.ts
              </figcaption>
              <pre>
                <code>{MANIFEST_EXCERPT}</code>
              </pre>
            </figure>
          </div>
        </section>

        <section className="lp-section lp-stack" aria-labelledby="stack-title">
          <div className="lp-copy">
            <p className="overline">Under the hood</p>
            <h2 id="stack-title">Built to be rebuilt</h2>
            <p>
              The tech stack is chosen for low-friction rewrites. The backend
              is moving from Postgres to Convex one system at a time —
              expenses first, then journal and habits — with an Expo app to
              follow.
            </p>
            <ul className="lp-stack-list">
              {STACK.map((s) => (
                <li key={s} className="lp-chip lp-chip-mono">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <span className="lp-brand lp-brand-sm">
            <PolarisGlyph size={14} />
            <span>Polaris</span>
          </span>
          <span className="caption">Built by Raymart Villos · 2026</span>
          <nav className="lp-footer-nav" aria-label="Footer">
            <a className="link" href={SOURCE_URL}>
              Source
            </a>
            {isAuthenticated ? (
              <Link className="link" href="/dashboard">
                Dashboard
              </Link>
            ) : (
              <Link className="link" href="/auth/signin">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </footer>
    </div>
  );
}

const MANIFEST_EXCERPT = `export const manifest: SystemManifest = {
  name: "expenses",
  displayName: "Activity Expenses",
  description: "Track what an activity costs while it happens",

  routes: {
    "GET /activities":  activities.listActivities,
    "POST /activities": activities.createActivity,
    // …nine more
  },

  nav: {
    label: "Expenses",
    icon: "receipt",
    href: "/expenses",
  },

  palette: {
    layers: [palette.activitiesLayer],
  },
};`;

function PreviewCard({
  label,
  stat,
  caption,
}: {
  label: string;
  stat: string;
  caption: string;
}) {
  return (
    <div className="lp-preview-card">
      <span className="lp-preview-label">{label}</span>
      <span className="lp-preview-stat">{stat}</span>
      <span className="lp-preview-caption">{caption}</span>
    </div>
  );
}

function DiagramNode({ system }: { system: LandingSystem }) {
  return (
    <div className="lp-node">
      <Icon name={system.icon} size={16} />
      <div className="lp-node-text">
        <span className="lp-node-name">{system.name}</span>
        <span className="lp-meta">{system.path}</span>
      </div>
    </div>
  );
}
