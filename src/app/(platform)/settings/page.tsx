import { listIntegrations } from "@/platform/integrations/registry";
import { auth } from "@/platform/auth/config";

export default async function SettingsPage() {
  const [integrations, session] = await Promise.all([
    Promise.resolve(listIntegrations()),
    auth(),
  ]);

  return (
    <article className="doc">
      <h1>Settings</h1>
      <p
        className="caption"
        style={{ marginTop: -8, marginBottom: "var(--sp-8)" }}
      >
        The platform lives at the source-code level — this page is for anything
        that must be runtime state instead.
      </p>

      <h2>Account</h2>
      <div className="paper-card" style={{ marginBottom: "var(--sp-8)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--ink-4)",
              width: 72,
            }}
          >
            Signed in
          </span>
          <span style={{ color: "var(--ink-1)", fontSize: 14 }}>
            {session?.user?.email ?? "Not signed in"}
          </span>
        </div>
      </div>

      <h2>Integrations</h2>
      {integrations.length === 0 ? (
        <div
          style={{
            padding: "var(--sp-6) 0",
            color: "var(--ink-3)",
            fontSize: 13.5,
          }}
        >
          <div style={{ color: "var(--ink-2)", marginBottom: 4 }}>
            No integrations configured.
          </div>
          <div>
            Integrations are registered from inside a system — they appear here
            once a system needs one.
          </div>
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-2)",
          }}
        >
          {integrations.map((integration) => (
            <li key={integration.name} className="paper-card">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 500,
                      color: "var(--ink-1)",
                      fontSize: 14,
                    }}
                  >
                    {integration.displayName}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "var(--ink-3)",
                      marginTop: 2,
                    }}
                  >
                    {integration.name}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
