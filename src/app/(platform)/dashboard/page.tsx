import { feedback } from "@/platform/feedback";
import { manifests } from "@/systems";
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

export default async function DashboardPage() {
  const { metrics, reflections, iterations } = await feedback.getAllFeedback();
  const today = DATE_FORMATTER.format(new Date());
  const systemCount = manifests.length;

  return (
    <article className="doc">
      <h1>Today</h1>
      <p
        className="caption"
        style={{ marginTop: -8, marginBottom: "var(--sp-8)" }}
      >
        {today} · {systemCount} {systemCount === 1 ? "system" : "systems"}{" "}
        active
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          marginBottom: "var(--sp-8)",
        }}
      >
        <StatCard
          label="Metrics"
          value={metrics.length.toString()}
          hint={
            metrics.length === 0
              ? "No metrics recorded yet."
              : `Most recent: ${metrics[0].system} · ${metrics[0].name}`
          }
          tone={metrics.length > 0 ? "success" : "muted"}
        />
        <StatCard
          label="Reflections"
          value={reflections.length.toString()}
          hint={
            reflections.length === 0
              ? "No reflections yet."
              : `Latest on ${reflections[0].system}`
          }
          tone="muted"
        />
      </div>

      <h2>Recent metrics</h2>
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
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 140px 100px",
                padding: "8px 0",
                borderTop: i === 0 ? "0" : "1px solid var(--border)",
                fontSize: 13.5,
                alignItems: "center",
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
              <span style={{ color: "var(--ink-1)" }}>{m.name}</span>
              <span className="tag-inline" style={{ justifySelf: "start" }}>
                {m.system}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  textAlign: "right",
                  color: "var(--ink-2)",
                }}
              >
                {m.value}
              </span>
            </div>
          ))}
        </div>
      )}

      <h2>Recent reflections</h2>
      {reflections.length === 0 ? (
        <EmptyState
          title="No reflections yet."
          hint="Write one when a system starts earning, or failing to earn, its place."
        />
      ) : (
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
      )}

      <h2>Iteration history</h2>
      {iterations.length === 0 ? (
        <EmptyState
          title="No iterations logged yet."
          hint="Every change to a system is worth recording."
        />
      ) : (
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
                <span style={{ color: "var(--ink-3)" }}> — {i.description}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "success" | "muted";
}) {
  return (
    <div
      style={{
        background: "var(--paper-1)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--ink-4)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 28,
          fontWeight: 500,
          color: "var(--ink-1)",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 12,
          color: tone === "success" ? "var(--success)" : "var(--ink-3)",
          marginTop: 4,
        }}
      >
        {tone === "success" && "● "}
        {hint}
      </div>
    </div>
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
