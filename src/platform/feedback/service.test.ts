import { describe, it, expect, vi } from "vitest";
import { createFeedbackService } from "./service";

function mockPrisma() {
  return {
    systemMetric: {
      create: vi.fn().mockResolvedValue({ id: "m1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    systemReflection: {
      create: vi.fn().mockResolvedValue({ id: "r1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    systemIteration: {
      create: vi.fn().mockResolvedValue({ id: "i1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe("FeedbackService", () => {
  it("records a metric", async () => {
    const prisma = mockPrisma();
    const service = createFeedbackService(prisma as any);

    await service.recordMetric("journal", "entries_created", 5);

    expect(prisma.systemMetric.create).toHaveBeenCalledWith({
      data: { system: "journal", name: "entries_created", value: 5 },
    });
  });

  it("adds a reflection", async () => {
    const prisma = mockPrisma();
    const service = createFeedbackService(prisma as any);

    await service.addReflection("journal", {
      content: "Going well",
      strengths: ["consistency"],
      weaknesses: ["depth"],
      ideas: ["add prompts"],
    });

    expect(prisma.systemReflection.create).toHaveBeenCalledWith({
      data: {
        system: "journal",
        content: "Going well",
        strengths: ["consistency"],
        weaknesses: ["depth"],
        ideas: ["add prompts"],
      },
    });
  });

  it("logs an iteration", async () => {
    const prisma = mockPrisma();
    const service = createFeedbackService(prisma as any);

    await service.logIteration("journal", {
      description: "Added AI prompts",
      reason: "Entries were too shallow",
    });

    expect(prisma.systemIteration.create).toHaveBeenCalledWith({
      data: {
        system: "journal",
        description: "Added AI prompts",
        reason: "Entries were too shallow",
      },
    });
  });

  it("lists metrics for a system", async () => {
    const prisma = mockPrisma();
    const service = createFeedbackService(prisma as any);

    await service.getMetrics("journal");

    expect(prisma.systemMetric.findMany).toHaveBeenCalledWith({
      where: { system: "journal" },
      orderBy: { recordedAt: "desc" },
    });
  });
});
