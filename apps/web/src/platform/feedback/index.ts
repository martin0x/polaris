import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";

// Feedback reads for the dashboard. Metrics are written inside Convex
// (internal.feedback.record), never from the web app.

export const feedback = {
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
