// Polaris — Command palette (⌘K) — workflow-centric
const PALETTE_ACTIONS = [
  { section: 'Workflows', items: [
    { id: 'today',   label: 'Today',                icon: 'compass',    k: '⌘T' },
    { id: 'budget',  label: 'Budget',               icon: 'calendar',   k: '⌘B' },
    { id: 'journal', label: 'Engineering Journal',  icon: 'terminal',   k: '⌘J' },
    { id: 'quotes',  label: 'Quotes',               icon: 'bookOpen',   k: '⌘Q' },
  ]},
  { section: 'Actions', items: [
    { id: 'a1', label: 'Add budget entry',       icon: 'plus' },
    { id: 'a2', label: 'New journal entry',      icon: 'plus',     k: '⌘⇧N' },
    { id: 'a3', label: 'Add quote',              icon: 'plus' },
    { id: 'a4', label: 'Toggle dark mode',       icon: 'moon',     k: '⌘⇧D' },
  ]},
  { section: 'System', items: [
    { id: 's1', label: 'Open source code',       icon: 'gitBranch' },
    { id: 's2', label: 'Settings',               icon: 'settings' },
  ]},
];

const CommandPalette = ({ onClose, onAction }) => {
  const [q, setQ] = React.useState('');
  const [cursor, setCursor] = React.useState(0);
  const inputRef = React.useRef(null);
  React.useEffect(() => { inputRef.current?.focus(); }, []);

  const flat = [];
  PALETTE_ACTIONS.forEach(s => {
    const filtered = s.items.filter(i => i.label.toLowerCase().includes(q.toLowerCase()));
    if (filtered.length) flat.push({ section: s.section, items: filtered });
  });
  const allItems = flat.flatMap(s => s.items);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(allItems.length - 1, c + 1)); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
      else if (e.key === 'Enter')     { e.preventDefault(); allItems[cursor] && onAction(allItems[cursor]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cursor, allItems, onClose, onAction]);

  let idx = -1;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="palette" onClick={e => e.stopPropagation()}>
        <div className="pal-search">
          <Icon name="search" size={16} style={{ color: 'var(--ink-3)' }} />
          <input ref={inputRef} placeholder="Jump to a workflow or run a command…" value={q} onChange={e => { setQ(e.target.value); setCursor(0); }} />
          <span className="esc">esc</span>
        </div>
        {flat.length === 0 && <div className="pal-empty">No matches for "{q}".</div>}
        {flat.map(s => (
          <React.Fragment key={s.section}>
            <div className="pal-sec">{s.section}</div>
            {s.items.map(i => {
              idx++;
              const active = idx === cursor;
              return (
                <div key={i.id} className={`pal-row${active ? ' active' : ''}`} onMouseEnter={() => setCursor(allItems.indexOf(i))} onClick={() => onAction(i)}>
                  <Icon name={i.icon} size={14} />
                  <span>{i.label}</span>
                  {i.k && <span className="k">{i.k}</span>}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

window.CommandPalette = CommandPalette;
