import { feedback } from "@/platform/feedback";

export default async function DashboardPage() {
  const { metrics, reflections, iterations } = await feedback.getAllFeedback();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-lg border p-4">
          <h2 className="font-semibold mb-3">Recent Metrics</h2>
          {metrics.length === 0 ? (
            <p className="text-sm text-gray-500">No metrics recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {metrics.slice(0, 10).map((m) => (
                <li key={m.id} className="text-sm">
                  <span className="font-medium">{m.system}</span> — {m.name}:{" "}
                  {m.value}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="font-semibold mb-3">Recent Reflections</h2>
          {reflections.length === 0 ? (
            <p className="text-sm text-gray-500">No reflections yet.</p>
          ) : (
            <ul className="space-y-2">
              {reflections.slice(0, 5).map((r) => (
                <li key={r.id} className="text-sm">
                  <span className="font-medium">{r.system}</span> — {r.content}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="font-semibold mb-3">Iteration History</h2>
          {iterations.length === 0 ? (
            <p className="text-sm text-gray-500">No iterations logged yet.</p>
          ) : (
            <ul className="space-y-2">
              {iterations.slice(0, 5).map((i) => (
                <li key={i.id} className="text-sm">
                  <span className="font-medium">{i.system}</span> —{" "}
                  {i.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
