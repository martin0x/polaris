// Polaris — Title bar (app chrome, 36px)
const TitleBar = ({ docPath, syncState = 'ok' }) => {
  const parts = docPath.split(' / ');
  return (
    <header className="titlebar">
      <div className="dots">
        <span className="dot" style={{ background: '#e87463' }}></span>
        <span className="dot" style={{ background: '#e6b44f' }}></span>
        <span className="dot" style={{ background: '#78b36a' }}></span>
      </div>
      <svg width="14" height="14" viewBox="0 0 64 64" style={{ marginLeft: 4 }}>
        <path d="M32 4 L34.6 29.4 L60 32 L34.6 34.6 L32 60 L29.4 34.6 L4 32 L29.4 29.4 Z" fill="#7c6cf0"/>
        <circle cx="32" cy="32" r="2.6" fill="#fbf9f4"/>
      </svg>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13, color: 'var(--ink-1)', fontWeight: 500 }}>Polaris</span>
      <span style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 6px' }} />
      <div className="crumbs">
        {parts.map((p, i) => (
          <React.Fragment key={i}>
            <span className={i === parts.length - 1 ? 'cur' : ''}>{p}</span>
            {i < parts.length - 1 && <span className="sep">›</span>}
          </React.Fragment>
        ))}
      </div>
      <div className="right">
        <span className="sync-dot" style={{ background: syncState === 'ok' ? 'var(--success)' : 'var(--warning)' }} />
        <span>{syncState === 'ok' ? 'synced' : 'offline'}</span>
      </div>
    </header>
  );
};

window.TitleBar = TitleBar;
