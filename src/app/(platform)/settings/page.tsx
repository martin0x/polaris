import { listIntegrations } from "@/platform/integrations/registry";

export default async function SettingsPage() {
  const integrations = listIntegrations();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Integrations</h2>
        {integrations.length === 0 ? (
          <p className="text-sm text-gray-500">
            No integrations configured. Integrations are added when a system
            needs one.
          </p>
        ) : (
          <ul className="space-y-3">
            {integrations.map((integration) => (
              <li
                key={integration.name}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <div className="font-medium">{integration.displayName}</div>
                  <div className="text-sm text-gray-500">
                    {integration.name}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
