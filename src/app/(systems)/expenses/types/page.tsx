import { listTypes } from "@/systems/expenses/services/types";
import { TypesManager } from "@/systems/expenses/components/TypesManager";

export default async function TypesPage() {
  const types = await listTypes({ includeArchived: true });
  return (
    <article className="doc">
      <h1>Types</h1>
      <p className="lead">
        The fixed list behind the start buttons. Archive a type to hide it without losing its history.
      </p>
      <TypesManager
        types={types.map((t) => ({
          id: t.id,
          name: t.name,
          position: t.position,
          archived: t.archived,
        }))}
      />
    </article>
  );
}
