// Polaris — Sidebar (workflow launcher)
// Left-nav organizes by WORKFLOW, not by file/folder. Each workflow is a self-contained
// source-code module; the sidebar is the index of them.
const Sidebar = ({ activeId, onSelect, onOpenPalette }) => {
  const Item = ({ id, icon, label, count, badge }) => (
    <div
      className={`sb-item${activeId === id ? ' active' : ''}`}
      onClick={() => id && onSelect(id)}
    >
      {icon && <Icon name={icon} size={14} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {badge && <span className="count" style={{ color: 'var(--accent-ink)' }}>{badge}</span>}
      {count != null && <span className="count">{count}</span>}
    </div>
  );

  return (
    <aside className="sidebar">
      <div className="sb-search" onClick={onOpenPalette}>
        <Icon name="search" size={14} />
        <span>Search or jump to…</span>
        <span className="k">⌘K</span>
      </div>

      <Item id="today" icon="compass" label="Today" />

      <div className="sb-sec">
        <span>Workflows</span>
        <span className="add"><Icon name="plus" size={12} /></span>
      </div>
      <Item id="budget" icon="calendar" label="Budget" badge="this month" />
      <Item id="journal" icon="terminal" label="Engineering Journal" count={42} />
      <Item id="quotes" icon="bookOpen" label="Quotes" count={137} />

      <div className="sb-sec">Drafts</div>
      <Item id="reading" icon="star" label="Reading list" />
      <Item id="workouts" icon="list" label="Workouts" />

      <div style={{ flex: 1 }} />
      <div className="sb-sec">System</div>
      <Item id="source" icon="gitBranch" label="Source code" />
      <Item id="settings" icon="settings" label="Settings" />
    </aside>
  );
};

window.Sidebar = Sidebar;
