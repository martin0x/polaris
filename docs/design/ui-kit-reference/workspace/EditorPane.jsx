// Polaris — Editor / workflow pane
const EditorPane = ({ doc }) => {
  const [showRight, setShowRight] = React.useState(true);
  React.useEffect(() => {
    const b = document.querySelector('.body');
    if (b) b.classList.toggle('with-right', showRight);
  }, [showRight]);

  return (
    <main className="main">
      <div className="mainbar">
        <span className="path">
          {doc.path.split(' / ').slice(0, -1).join(' / ')}
          {doc.path.includes(' / ') && <span style={{ color: 'var(--ink-4)', margin: '0 6px' }}>/</span>}
          <span className="file">{doc.path.split(' / ').slice(-1)[0]}</span>
        </span>
        <div className="spacer" />
        <div className="tools">
          <button className="icon-btn" title="Star"><Icon name="star" size={16} /></button>
          <button className="icon-btn" title="History"><Icon name="clock" size={16} /></button>
          <button className={`icon-btn${showRight ? ' active' : ''}`} onClick={() => setShowRight(r => !r)} title="Toggle panel"><Icon name="panelRight" size={16} /></button>
          <button className="icon-btn" title="More"><Icon name="more" size={16} /></button>
        </div>
      </div>
      <div className="content">
        <article className="doc">
          <h1>{doc.title}</h1>
          <div className="doc-meta">{doc.meta}</div>
          {doc.render}
        </article>
      </div>
    </main>
  );
};

const RightPane = ({ meta }) => (
  <aside className="right">
    {meta.sections.map((s, i) => (
      <React.Fragment key={i}>
        <h5 style={{ marginTop: i === 0 ? 0 : 20 }}>{s.h}</h5>
        {s.items.map((t, j) => (
          <div key={j} className="bl-item"><div className="t" style={{ fontWeight: 400, color: 'var(--ink-2)' }}>{t}</div></div>
        ))}
      </React.Fragment>
    ))}
  </aside>
);

window.EditorPane = EditorPane;
window.RightPane = RightPane;
