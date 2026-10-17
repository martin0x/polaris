import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { preloadQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import { TypesManager } from "@/systems/expenses/components/TypesManager";

export default async function TypesPage() {
  const token = await convexAuthNextjsToken();
  const preloaded = await preloadQuery(
    api.expenses.types.list,
    { includeArchived: true },
    { token }
  );
  return (
    <article className="doc">
      <h1>Types</h1>
      <p className="lead">
        The fixed list behind the start buttons. Archive a type to hide it without losing its history.
      </p>
      <TypesManager preloaded={preloaded} />
    </article>
  );
}
