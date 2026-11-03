import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PHOTOS, SHOOTS } from '../data';
import { Header, Img, Title } from '../components/bits';

export function Shoots() {
  const [banner, setBanner] = useState(true);
  const [synced, setSynced] = useState('2 h ago');
  return (
    <div className="page">
      <Header />
      <div className="spread" style={{ alignItems: 'flex-end', marginBottom: 28 }}>
        <Title count={`${SHOOTS.length + 25} shoots`}>Photoshoots</Title>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="faint" style={{ fontSize: 12 }}>Cloud storage synced {synced}</span>
          <button className="pill">New photoshoot</button>
          <button className="pill primary" onClick={() => { setSynced('just now'); setBanner(true); }}>Sync cloud storage</button>
        </div>
      </div>
      {banner && (
        <div className="banner" role="status">
          <span><b>46 new photos from cloud storage</b> <span className="muted">· /Film scans/Roll 15 · will be filed as</span> <b>3 Nov 2026</b> <span className="muted">(rename anytime)</span></span>
          <button className="pill">Review files</button>
          <button className="pill primary" onClick={() => setBanner(false)}>Import</button>
        </div>
      )}
      <div className="card-grid">
        {SHOOTS.map((s) => {
          const ph = PHOTOS.filter((p) => p.shootId === s.id);
          const cover = ph[0];
          return (
            <Link key={s.id} to="/library">
              <div className="cover"><Img p={{ ar: 2.2, hue: cover.hue }} style={{ aspectRatio: '2.2' }} /></div>
              <div className="spread"><h2 className="serif" style={{ fontSize: 22 }}>{s.name}</h2><span className="muted" style={{ fontSize: 12.5 }}>{ph.length}</span></div>
              <div className="muted" style={{ fontSize: 12, margin: '2px 0 10px' }}>{s.source} · {s.dates}</div>
              <div className="bar"><i style={{ width: `${s.reviewPct}%` }} /></div>
              <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>{s.reviewPct === 100 ? 'All 6 sessions done' : `Reviews ${s.reviewPct}% done`}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
