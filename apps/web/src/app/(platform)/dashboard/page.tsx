import { feedback } from "@/platform/feedback";
import { dashboards } from "@/systems/dashboards";
import { Icon } from "@/app/_components/Icon";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

/** Metric names are code identifiers; the dashboard shows them as words and
 *  renders centavo-valued metrics as pesos. */
function metricLabel(name: string): string {
  return name.replace(/_centavos$/, "").replace(/_/g, " ");
}

function metricValue(name: string, value: number): string {
  if (name.endsWith("_centavos")) {
    return `₱${(value / 100).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return value.toLocaleString("en-US");
}

export default async function DashboardPage() {
  const [{ metrics, reflections, iterations }, ...fragments] =
    await Promise.all([
      feedback.getAllFeedback(),
      ...dashboards.map((d) =>
        d.summary().catch((err) => {
          console.error(`dashboard: ${d.name} summary failed`, err);
          return null;
        })
      ),
    ]);

  const line = fragments.filter(Boolean).join(", ");

  return (
    <article className="doc">
      <h1>Today</h1>
      <p className="lead daily-line">
        {DATE_FORMATTER.format(new Date())}
        {line ? <> — {line}.</> : "."}
      </p>

      <div className="dash-cards">
        {dashboards.map((d) => (
          <d.Widget key={d.name} />
        ))}
      </div>

      <h2>System health</h2>
      {metrics.length === 0 ? (
        <EmptyState
          title="No metrics recorded yet."
          hint="Systems emit metrics once they start collecting data."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {metrics.slice(0, 10).map((m, i) => (
            <div
              key={m.id}
              className="metric-row"
              style={{
                borderTop: i === 0 ? "0" : "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--ink-4)",
                }}
              >
                {TIME_FORMATTER.format(new Date(m.recordedAt))}
              </span>
              <span style={{ color: "var(--ink-1)" }}>
                {metricLabel(m.name)}
              </span>
              <span
                className="tag-inline metric-system"
                style={{ justifySelf: "start" }}
              >
                {m.system}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  textAlign: "right",
                  color: "var(--ink-2)",
                }}
              >
                {metricValue(m.name, m.value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {reflections.length > 0 ? (
        <>
          <h2>Recent reflections</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {reflections.slice(0, 5).map((r) => (
              <figure
                key={r.id}
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  borderLeft: "2px solid var(--accent)",
                }}
              >
                <blockquote
                  style={{
                    border: 0,
                    padding: 0,
                    margin: "0 0 6px",
                    fontFamily: "var(--font-serif)",
                    fontSize: 17,
                    fontStyle: "italic",
                    lineHeight: 1.5,
                    color: "var(--ink-1)",
                  }}
                >
                  {r.content}
                </blockquote>
                <figcaption
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--ink-3)",
                    display: "flex",
                    gap: 10,
                  }}
                >
                  <span style={{ color: "var(--ink-2)" }}>— {r.system}</span>
                  <span>·</span>
                  <span>{TIME_FORMATTER.format(new Date(r.createdAt))}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      ) : null}

      {iterations.length > 0 ? (
        <>
          <h2>Iteration history</h2>
          <div>
            {iterations.slice(0, 8).map((i) => (
              <div key={i.id} className="task-row">
                <span className="chk done">
                  <Icon name="check" size={10} />
                </span>
                <span className="lbl">
                  <span style={{ color: "var(--ink-1)", fontWeight: 500 }}>
                    {i.system}
                  </span>
                  <span style={{ color: "var(--ink-3)" }}>
                    {" "}
                    — {i.description}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </article>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div
      style={{
        padding: "var(--sp-6) 0",
        color: "var(--ink-3)",
        fontSize: 13.5,
      }}
    >
      <div style={{ color: "var(--ink-2)", marginBottom: 4 }}>{title}</div>
      <div>{hint}</div>
    </div>
  );
}
