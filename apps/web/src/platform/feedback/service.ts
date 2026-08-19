import { PrismaClient } from "@/generated/prisma/client";

interface ReflectionInput {
  content: string;
  strengths: string[];
  weaknesses: string[];
  ideas: string[];
}

interface IterationInput {
  description: string;
  reason: string;
}

export function createFeedbackService(prisma: PrismaClient) {
  return {
    async recordMetric(system: string, name: string, value: number) {
      return prisma.systemMetric.create({
        data: { system, name, value },
      });
    },

    async addReflection(system: string, input: ReflectionInput) {
      return prisma.systemReflection.create({
        data: { system, ...input },
      });
    },

    async logIteration(system: string, input: IterationInput) {
      return prisma.systemIteration.create({
        data: { system, ...input },
      });
    },

    async getMetrics(system: string) {
      return prisma.systemMetric.findMany({
        where: { system },
        orderBy: { recordedAt: "desc" },
      });
    },

    async getReflections(system: string) {
      return prisma.systemReflection.findMany({
        where: { system },
        orderBy: { createdAt: "desc" },
      });
    },

    async getIterations(system: string) {
      return prisma.systemIteration.findMany({
        where: { system },
        orderBy: { createdAt: "desc" },
      });
    },

    async getAllFeedback() {
      const [metrics, reflections, iterations] = await Promise.all([
        prisma.systemMetric.findMany({ orderBy: { recordedAt: "desc" }, take: 50 }),
        prisma.systemReflection.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
        prisma.systemIteration.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      ]);
      return { metrics, reflections, iterations };
    },
  };
}
