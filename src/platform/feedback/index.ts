import { prisma } from "@/platform/db/client";
import { createFeedbackService } from "./service";

export const feedback = createFeedbackService(prisma);
