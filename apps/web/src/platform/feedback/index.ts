import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";

// Strangler-window adapter: same surface the call sites always had, Convex
// behind it. Writes are server-trusted (CRON_SECRET as service key) so the
// cron route — which has no user token — records metrics identically.
function serviceKey(): string {
  const key = process.env.CRON_SECRET;
  if (!key) throw new Error("CRON_SECRET environment variable is not set");
  return key;
}

export const feedback = {
  async recordMetric(system: string, name: string, value: number): Promise<void> {
    await fetchMutation(api.feedback.recordMetric, {
      system,
      name,
      value,
      serviceKey: serviceKey(),
    });
  },

  async getAllFeedback() {
    const token = await convexAuthNextjsToken();
    const { metrics, reflections, iterations } = await fetchQuery(
      api.feedback.getAllFeedback,
      {},
      { token },
    );
    return {
      metrics: metrics.map((d) => ({
        id: d.legacyId ?? d._id,
        system: d.system,
        name: d.name,
        value: d.value,
        recordedAt: new Date(d.recordedAt),
      })),
      reflections: reflections.map((d) => ({
        id: d.legacyId ?? d._id,
        system: d.system,
        content: d.content,
        strengths: d.strengths,
        weaknesses: d.weaknesses,
        ideas: d.ideas,
        createdAt: new Date(d.createdAt),
      })),
      iterations: iterations.map((d) => ({
        id: d.legacyId ?? d._id,
        system: d.system,
        description: d.description,
        reason: d.reason,
        outcome: d.outcome ?? null,
        createdAt: new Date(d.createdAt),
      })),
    };
  },
};
