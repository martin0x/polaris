// Polaris — Workflow surfaces. Each is its own thing; the shell is shared.

// ---------- Budget ---------------------------------------------------------
const BudgetView = () => {
  const cats = [
    { name: 'Rent',       spent: 2100, cap: 2100, color: 'var(--ink-3)' },
    { name: 'Groceries',  spent: 418,  cap: 600,  color: 'var(--success)' },
    { name: 'Dining out', spent: 287,  cap: 250,  color: 'var(--danger)' },
    { name: 'Transit',    spent: 92,   cap: 150,  color: 'var(--success)' },
    { name: 'Software',   spent: 64,   cap: 100,  color: 'var(--success)' },
    { name: 'Books',      spent: 41,   cap: 80,   color: 'var(--success)' },
  ];
  const total = cats.reduce((s, c) => s + c.spent, 0);
  const cap   = cats.reduce((s, c) => s + c.cap, 0);
  const fmt = (n) => '$' + n.toLocaleString();
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 38, fontWeight: 500, color: 'var(--ink-1)', letterSpacing: '-0.015em' }}>{fmt(total)}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-3)' }}>of {fmt(cap)} · April 2026</div>
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--success)' }}>
          ● on track
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {cats.map(c => {
          const pct = Math.min(100, (c.spent / c.cap) * 100);
          const over = c.spent > c.cap;
          return (
            <div key={c.name}>
              <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 14, color: 'var(--ink-1)', fontWeight: 500 }}>{c.name}</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: over ? 'var(--danger)' : 'var(--ink-3)' }}>
                  {fmt(c.spent)} <span style={{ color: 'var(--ink-4)' }}>/ {fmt(c.cap)}</span>
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--paper-2)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: pct + '%', height: '100%', background: c.color, transition: 'width 300ms' }} />
              </div>
            </div>
          );
        })}
      </div>
      <h2 style={{ marginTop: 36 }}>Recent</h2>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {[
          ['Apr 22', 'Blue Bottle',       'Dining out',  -6.50],
          ['Apr 22', 'Whole Foods',       'Groceries',   -84.12],
          ['Apr 21', 'Muni',              'Transit',     -3.00],
          ['Apr 20', 'Figma (annual)',    'Software',    -144.00],
          ['Apr 19', 'City Lights Books', 'Books',       -22.40],
        ].map(([d, m, c, a], i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 130px 80px', padding: '8px 0', borderTop: i === 0 ? '0' : '1px solid var(--border)', fontSize: 13.5, alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-4)' }}>{d}</span>
            <span style={{ color: 'var(--ink-1)' }}>{m}</span>
            <span className="tag-inline" style={{ justifySelf: 'start' }}>{c}</span>
            <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--ink-2)' }}>${Math.abs(a).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </>
  );
};

// ---------- Engineering Journal -------------------------------------------
const JournalView = () => (
  <>
    <p className="lead" style={{ fontFamily: 'var(--font-serif)', fontSize: 18, lineHeight: 1.5, color: 'var(--ink-2)' }}>
      A running log of what I built, broke, and learned. Append-only. Auto-timestamped from <code>git commit</code>.
    </p>
    <h2>2026-04-23 · Thu</h2>
    <h3>Shipped</h3>
    <ul>
      <li>Polaris shell v0. Sidebar is workflow-scoped now — Budget, Journal, Quotes.</li>
      <li>Carved the <code>colors_and_type.css</code> tokens out of inline styles. ~60 vars.</li>
    </ul>
    <h3>Broke</h3>
    <ul>
      <li><mark>Babel</mark> panicked on a missing semicolon inside a template literal. Took 20 min.</li>
    </ul>
    <h3>Learned</h3>
    <blockquote>Each workflow should own its data model. The shell only knows "currently open workflow id" and a router.</blockquote>
    <hr />
    <h2>2026-04-22 · Wed</h2>
    <h3>Shipped</h3>
    <ul>
      <li>Budget CSV import. <code>import-mint.ts</code>, tested on 3 months.</li>
      <li>Fuzzy-matcher for merchant → category. 87% accuracy on first pass.</li>
    </ul>
    <pre><span style={{ color: 'var(--code-comment)' }}>// scratch: weighted n-gram similarity</span>{'\n'}<span style={{ color: 'var(--code-keyword)' }}>const</span> score = (a, b) =&gt; ngrams(a, 3).filter(g =&gt; b.includes(g)).length;</pre>
  </>
);

// ---------- Quotes ---------------------------------------------------------
const QuotesView = () => {
  const quotes = [
    { q: "Software is cheap to write and rewrite — so write the software you want to live in.", who: "me, probably", when: "Apr 2026" },
    { q: "The only zen you find on the tops of mountains is the zen you bring up there.", who: "Pirsig", when: "Mar 2026" },
    { q: "First, solve the problem. Then, write the code.", who: "Kernighan", when: "Mar 2026" },
    { q: "A system is never finished being designed.", who: "Alexander", when: "Feb 2026" },
    { q: "Premature abstraction is the root of all evil.", who: "variant on Knuth", when: "Feb 2026" },
  ];
  return (
    <>
      <p className="caption" style={{ color: 'var(--ink-3)', marginBottom: 28 }}>137 quotes · last added 3 days ago</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {quotes.map((Q, i) => (
          <figure key={i} style={{ margin: 0, paddingLeft: 18, borderLeft: '2px solid var(--accent)' }}>
            <blockquote style={{ border: 0, padding: 0, margin: '0 0 6px', fontFamily: 'var(--font-serif)', fontSize: 19, fontStyle: 'italic', lineHeight: 1.45, color: 'var(--ink-1)' }}>
              "{Q.q}"
            </blockquote>
            <figcaption style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)', display: 'flex', gap: 10 }}>
              <span style={{ color: 'var(--ink-2)' }}>— {Q.who}</span>
              <span>·</span>
              <span>{Q.when}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
};

// ---------- Today (dashboard) ---------------------------------------------
const TodayView = () => (
  <>
    <p className="caption" style={{ color: 'var(--ink-3)', marginTop: -12, marginBottom: 28 }}>Thursday, April 23 · warm, 62°F · 5 workflows active</p>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
      <div style={{ background: 'var(--paper-1)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', marginBottom: 6 }}>Budget</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 500, color: 'var(--ink-1)' }}>$3,002</div>
        <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>● on track — $298 left this week</div>
      </div>
      <div style={{ background: 'var(--paper-1)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', marginBottom: 6 }}>Engineering Journal</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 500, color: 'var(--ink-1)' }}>42 entries</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>Last: <span style={{ color: 'var(--ink-1)' }}>Polaris shell v0</span></div>
      </div>
    </div>

    <h2>Agenda</h2>
    <div className="task-row"><span className="chk"></span><span className="lbl">Review April budget variance</span></div>
    <div className="task-row"><span className="chk"></span><span className="lbl">Journal entry for Polaris shell</span></div>
    <div className="task-row done"><span className="chk done"><Icon name="check" size={10} /></span><span className="lbl">Morning pages</span></div>
  </>
);

const WORKFLOWS = {
  today:   { title: 'Today',                path: 'Polaris / Today',                        meta: '5 workflows · 3 tasks',    render: <TodayView /> },
  budget:  { title: 'Budget',               path: 'Polaris / Budget / April 2026',          meta: '$3,002 of $3,300 · 11 days left', render: <BudgetView /> },
  journal: { title: 'Engineering Journal',  path: 'Polaris / Engineering Journal',          meta: '42 entries · last 2h ago', render: <JournalView /> },
  quotes:  { title: 'Quotes',               path: 'Polaris / Quotes',                       meta: '137 quotes · 14 authors',  render: <QuotesView /> },
};

// Supplementary info for the right pane, per workflow
const WORKFLOW_META = {
  today:   { sections: [
    { h: 'Weather',    items: ['62°F, partly cloudy', 'Sunset 7:54p'] },
    { h: 'Focus',      items: ['Deep work block: 2–4p', 'No meetings'] },
  ]},
  budget:  { sections: [
    { h: 'Caps',       items: ['Monthly: $3,300', 'Discretionary: $500'] },
    { h: 'Data source',items: ['import-mint.ts', '3 accounts linked'] },
    { h: 'Tags',       items: ['#recurring', '#one-off', '#reimbursable'] },
  ]},
  journal: { sections: [
    { h: 'Links',      items: ['git: polaris/main', 'Last commit: 2h ago'] },
    { h: 'Tags',       items: ['#ship', '#break', '#learn'] },
    { h: 'Streak',     items: ['14 days', 'Best: 31 days'] },
  ]},
  quotes:  { sections: [
    { h: 'Top authors',items: ['Alexander (18)', 'Knuth (12)', 'Pirsig (9)'] },
    { h: 'Tags',       items: ['#craft', '#systems', '#life'] },
    { h: 'Source',     items: ['quotes.yaml', '137 rows'] },
  ]},
};

window.WORKFLOWS = WORKFLOWS;
window.WORKFLOW_META = WORKFLOW_META;
