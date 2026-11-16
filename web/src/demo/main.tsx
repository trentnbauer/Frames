import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '../styles.css';
import './style.css';

type Sample = { id: number; title: string; shoot: string; location: string; date: string; camera: string; tags: string[]; image: string };
// Self-contained abstract placeholders: no remote photos or image API requests.
const palettes: [string, string, string][] = [["#203b56","#d8a56b","#7a99aa"],["#183c53","#78a6b1","#e6cda0"],["#b55745","#e7b46d","#4c5d79"],["#1c5575","#75b8b9","#e8c6a5"],["#181d39","#ad6682","#e7b18b"],["#303847","#a3a0a0","#e2d2b8"],["#183e36","#7ca68d","#d6c3a1"],["#8c513f","#d6a47b","#efd7ac"],["#344052","#9a9ca7","#d8c4b1"]];
const photo = (index: number) => {
  const [dark, mid, light] = palettes[index % palettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${dark}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${light}"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="${light}" stop-opacity=".65"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient></defs>
    <rect width="1200" height="900" fill="url(#g)"/>
    <circle cx="${270 + (index % 4) * 200}" cy="${180 + (index % 3) * 130}" r="420" fill="url(#glow)"/>
    <path d="M0 ${690 - index * 13} Q300 ${410 + index * 21} 600 ${630 - index * 9} T1200 ${520 + index * 17} V900 H0Z" fill="${dark}" opacity=".28"/>
    <circle cx="${850 - index * 45}" cy="${230 + index * 20}" r="${90 + index * 12}" fill="${light}" opacity=".17"/>
    <path d="M0 850 Q600 ${620 + index * 8} 1200 830" fill="none" stroke="${light}" stroke-opacity=".3" stroke-width="3"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};
const samples: Sample[] = [
  { id: 1, title: 'Mountain light', shoot: 'Alpine weekend', location: 'Mountains', date: '2025-04-12', camera: 'Digital camera', tags: ['Landscape', 'Mountains'], image: photo(0) },
  { id: 2, title: 'Still water', shoot: 'Alpine weekend', location: 'Lakeside', date: '2025-04-12', camera: 'Digital camera', tags: ['Landscape', 'Water'], image: photo(1) },
  { id: 3, title: 'Golden hour', shoot: 'Coastal walks', location: 'Coast', date: '2025-06-18', camera: '35mm film', tags: ['Landscape', 'Sunset'], image: photo(2) },
  { id: 4, title: 'Ocean air', shoot: 'Coastal walks', location: 'Beach', date: '2025-06-18', camera: '35mm film', tags: ['Water', 'Coast'], image: photo(3) },
  { id: 5, title: 'City after dark', shoot: 'City stories', location: 'City', date: '2025-08-02', camera: 'Digital camera', tags: ['Architecture', 'Night'], image: photo(4) },
  { id: 6, title: 'Quiet street', shoot: 'City stories', location: 'City', date: '2025-08-02', camera: 'Digital camera', tags: ['Architecture', 'Street'], image: photo(5) },
  { id: 7, title: 'Forest path', shoot: 'Alpine weekend', location: 'Forest', date: '2025-04-13', camera: 'Digital camera', tags: ['Nature', 'Forest'], image: photo(6) },
  { id: 8, title: 'Desert tones', shoot: 'Coastal walks', location: 'Outdoors', date: '2025-06-19', camera: '35mm film', tags: ['Landscape', 'Travel'], image: photo(7) },
  { id: 9, title: 'Concrete geometry', shoot: 'City stories', location: 'City', date: '2025-08-03', camera: 'Digital camera', tags: ['Architecture', 'Shapes'], image: photo(8) },
];
const shoots = [...new Set(samples.map(p => p.shoot))];
const compositions = [
  { name: 'Places & spaces', description: 'A curated collection of landscapes and architecture.', ids: [1, 2, 6, 9] },
  { name: 'Summer colours', description: 'Warm tones from the road.', ids: [3, 4, 8] },
];
type Page = 'home' | 'library' | 'shoots' | 'collections';
function Demo() {
  const [page, setPage] = useState<Page>('home');
  const [selected, setSelected] = useState<Sample | null>(null);
  const [shoot, setShoot] = useState('');
  const [collection, setCollection] = useState('');
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const filtered = useMemo(() => samples.filter(p =>
    (!shoot || p.shoot === shoot) && (!collection || compositions.find(c => c.name === collection)?.ids.includes(p.id)) &&
    (!tag || p.tags.includes(tag)) &&
    (!search || [p.title, p.shoot, p.location, p.camera, ...p.tags].join(' ').toLowerCase().includes(search.toLowerCase()))
  ), [shoot, collection, search, tag]);
  const openPage = (next: Page) => { setPage(next); setSelected(null); setShoot(''); setCollection(''); setTag(''); setSearch(''); };
  const openShoot = (name: string) => { openPage('library'); setShoot(name); };
  const openCollection = (name: string) => { openPage('library'); setCollection(name); };
  return <div className="demo-app">
    <div className="demo-banner"><strong>INTERACTIVE DEMO</strong><span>Sample photographs · Read-only · Nothing you do here is saved</span><a href="https://github.com/trentnbauer/Frames" target="_blank" rel="noreferrer">View project ↗</a></div>
    <header className="demo-header"><button className="demo-logo" onClick={() => openPage('home')}>Frames<span>.</span></button><nav aria-label="Demo navigation">
      {([['home','Today'],['library','Library'],['shoots','Photoshoots'],['collections','Compositions']] as [Page,string][]).map(([key,label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => openPage(key)}>{label}</button>)}
    </nav><span className="demo-user">Demo visitor</span></header>
    <main className="demo-main">
      {selected ? <><button className="demo-back" onClick={() => setSelected(null)}>← Back to photographs</button><div className="demo-detail"><div className="demo-full"><img src={selected.image} alt={selected.title}/></div><aside><div className="demo-kicker">PHOTOGRAPH {selected.id.toString().padStart(3,'0')}</div><h1>{selected.title}</h1><p>Part of <button className="demo-text-link" onClick={() => openShoot(selected.shoot)}>{selected.shoot}</button></p><dl><dt>Captured</dt><dd>{selected.date}</dd><dt>Location</dt><dd>{selected.location}</dd><dt>Camera</dt><dd>{selected.camera}</dd></dl><h3>Tags</h3><div className="demo-tags">{selected.tags.map(t => <button key={t} onClick={() => { setSelected(null); setPage('library'); setTag(t); setShoot(''); setCollection(''); }}>{t}</button>)}</div><div className="demo-readonly">This is a demonstration. Editing, rating, downloads and AI analysis are disabled.</div></aside></div></> :
      page === 'home' ? <><div className="demo-kicker">WELCOME TO FRAMES</div><h1>Your photographs, thoughtfully organised.</h1><p className="demo-lead">Explore a sample library, browse photoshoots, and see how photographs can become compositions.</p><div className="demo-stats"><div><strong>{samples.length}</strong><span>Photographs</span></div><div><strong>{shoots.length}</strong><span>Photoshoots</span></div><div><strong>{compositions.length}</strong><span>Compositions</span></div></div><div className="demo-section-heading"><h2>Recently added</h2><button onClick={() => openPage('library')}>Explore library →</button></div><Gallery photos={samples.slice(0,6)} onOpen={setSelected}/><div className="demo-section-heading"><h2>Photoshoots</h2><button onClick={() => openPage('shoots')}>View all →</button></div><div className="demo-cards">{shoots.map(name => <button key={name} onClick={() => openShoot(name)}><img src={samples.find(p => p.shoot === name)!.image} alt=""/><strong>{name}</strong><span>{samples.filter(p => p.shoot === name).length} photographs</span></button>)}</div></> :
      page === 'library' ? <><div className="demo-kicker">EXPLORE</div><h1>Library</h1><p className="demo-lead">Search and filter the example photographs. Select any image to explore its details.</p><div className="demo-filters"><input aria-label="Search photographs" placeholder="Search photographs…" value={search} onChange={e => setSearch(e.target.value)}/><select aria-label="Filter by photoshoot" value={shoot} onChange={e => setShoot(e.target.value)}><option value="">All photoshoots</option>{shoots.map(s => <option key={s}>{s}</option>)}</select>{(shoot || collection || tag || search) && <button onClick={() => { setShoot(''); setCollection(''); setTag(''); setSearch(''); }}>Clear filters ×</button>}</div>{collection && <p className="demo-filter-note">Composition: {collection}</p>}{tag && <p className="demo-filter-note">Tag: {tag}</p>}<p className="demo-count">{filtered.length} photographs</p><Gallery photos={filtered} onOpen={setSelected}/></> :
      page === 'shoots' ? <><div className="demo-kicker">YOUR STORIES</div><h1>Photoshoots</h1><p className="demo-lead">Photographs grouped into shoots, places and moments.</p><div className="demo-cards">{shoots.map(name => <button key={name} onClick={() => openShoot(name)}><img src={samples.find(p => p.shoot === name)!.image} alt=""/><strong>{name}</strong><span>{samples.filter(p => p.shoot === name).length} photographs · Open shoot →</span></button>)}</div></> :
      <><div className="demo-kicker">CURATED STORIES</div><h1>Compositions</h1><p className="demo-lead">Thoughtful selections of photographs, brought together around an idea.</p><div className="demo-cards">{compositions.map(c => <button key={c.name} onClick={() => openCollection(c.name)}><img src={samples.find(p => p.id === c.ids[0])!.image} alt=""/><strong>{c.name}</strong><span>{c.description}</span><small>{c.ids.length} photographs · Explore →</small></button>)}</div></>}
    </main><footer className="demo-footer">Frames interactive demo · Illustrative sample data · <a href="https://github.com/trentnbauer/Frames">GitHub</a></footer>
  </div>;
}
function Gallery({ photos, onOpen }: { photos: Sample[]; onOpen: (p: Sample) => void }) {
  return photos.length ? <div className="demo-gallery">{photos.map(p => <button key={p.id} onClick={() => onOpen(p)} aria-label={`View ${p.title}`}><img src={p.image} alt={p.title} loading="lazy"/><span><strong>{p.title}</strong><small>{p.shoot}</small></span></button>)}</div> : <p>No sample photographs match these filters.</p>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Demo/></StrictMode>);
