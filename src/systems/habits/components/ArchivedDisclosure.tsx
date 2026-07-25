"use client";

interface ArchivedDisclosureProps {
  archived: Array<{ id: string; name: string }>;
  onUnarchive: (id: string) => void;
}

export function ArchivedDisclosure({ archived, onUnarchive }: ArchivedDisclosureProps) {
  if (archived.length === 0) return null;
  return (
    <details className="habit-archived">
      <summary>{archived.length} archived</summary>
      <ul>
        {archived.map((h) => (
          <li key={h.id}>
            <span>{h.name}</span>
            <button type="button" className="btn btn-ghost" onClick={() => onUnarchive(h.id)}>
              Unarchive
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
