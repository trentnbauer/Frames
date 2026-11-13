export function HomeReviewBanner({ cover, tag, title, description, buttonLabel, onBegin, thumbs = [] }: {
  cover?: string; tag: string; title: string; description: string; buttonLabel: string; onBegin: () => void; thumbs?: string[];
}) {
  return <section className="home-review-card" aria-label="Photo review">
    {cover && <div className="home-review-backdrop" aria-hidden="true" style={{ backgroundImage: `url(${cover})` }} />}
    <div className="home-review-content review-banner">
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="mono" style={{ fontSize: 12, letterSpacing: '.04em', color: 'var(--text2)' }}>REVIEW · {tag}</span>
        <h2 className="serif" style={{ fontSize: 36, lineHeight: 1.05, margin: 0 }}>{title}</h2>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text2)' }}>{description}</p>
      </div>
      {thumbs.length > 0 && <div style={{ display: 'flex', gap: 4, height: 72, flex: 'none' }}>
        {thumbs.map((src, index) => <img key={index} src={src} alt="" style={{ width: 48, height: 72, borderRadius: 4, objectFit: 'cover', opacity: [1, .75, .5, .3][index] ?? .3 }} />)}
      </div>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 'none' }}>
        <button type="button" className="btn primary lg" style={{ fontWeight: 500 }} onClick={onBegin}>{buttonLabel}</button>
        <span className="kbd" style={{ marginLeft: 0 }}>R</span>
      </div>
    </div>
  </section>;
}
