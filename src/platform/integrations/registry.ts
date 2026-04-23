import { Integration } from "./types";

const integrations = new Map<string, Integration>();

export function registerIntegration(integration: Integration) {
  integrations.set(integration.name, integration);
}

export function getIntegration(name: string): Integration | undefined {
  return integrations.get(name);
}

export function hasIntegration(name: string): boolean {
  return integrations.has(name);
}

export function listIntegrations(): Integration[] {
  return Array.from(integrations.values());
}
