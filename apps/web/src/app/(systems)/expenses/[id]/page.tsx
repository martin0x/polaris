import { notFound } from "next/navigation";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import { CapturePage } from "@/systems/expenses/components/CapturePage";

export default async function ExpenseActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const token = await convexAuthNextjsToken();
  const preloaded = await preloadQuery(api.expenses.activities.get, { id }, { token });
  if (preloadedQueryResult(preloaded) === null) notFound();
  return <CapturePage preloaded={preloaded} urlId={id} />;
}
