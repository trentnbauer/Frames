/** Static, synthetic fixtures for the actual Frames UI on GitHub Pages.
 * This module is only activated by the demo build flag. No user data or backend is used.
 */
import type { Collection, PhotoFull, PhotoLite, Shoot } from '../data';
import type { Settings, Me, Summary } from '../store';
import { arrange, bounds, nextUp, type Mode, type Orientation, type Print } from '../layout';

// Stable public sample photographs (not private Frames content). The same ID
// maps to the same picture everywhere: Library, Photoshoots, detail and walls.
// Picsum serves resized JPEGs, so grids download thumbnails instead of full
// resolution previews. External image hosting requires an internet connection.
const sampleIds = [
  10, 15, 29, 37, 54, 66,
  71, 75, 83, 89, 96, 101,
  103, 104, 106, 119, 122, 124,
];
/** A sample room picture (2000 × 1400 px) behind the first composition. Set by demo/main.tsx so only the demo build ships it. */
export const demoAssets = { room: '' };

// These sample photographs are portrait, so the demo has some for portrait prints.
const portraitIds = new Set([4, 11, 17]);
export function demoImage(id: number, kind: 'thumb' | 'preview' = 'thumb'): string {
  const photoId = sampleIds[(Math.max(1, id) - 1) % sampleIds.length];
  const long = kind === 'preview' ? 1600 : 480, short = Math.round(long / 1.5);
  return `https://picsum.photos/id/${photoId}/${portraitIds.has(id) ? `${short}/${long}` : `${long}/${short}`}`;
}

const shootsBase = [
  { id: 1, name: 'Alpine weekend', place: 'Mountains', date: '2025-04-12', camera: 'Digital camera', tags: ['Landscape','Mountains'] },
  { id: 2, name: 'Coastal walks', place: 'Coast', date: '2025-06-18', camera: '35mm film camera', tags: ['Landscape','Sea'] },
  { id: 3, name: 'City stories', place: 'City', date: '2025-08-02', camera: 'Digital camera', tags: ['Architecture','Street'] },
];
const titles = ['Mountain light','Still water','Forest path','Morning mist','Ridgeline','Sunrise','Golden hour','Ocean air','Summer colour','Evening tide','Quiet shore','Sand and sky','City after dark','Quiet street','Concrete geometry','After the rain','Night shapes','Laneway'];
const now = '2025-09-01T12:00:00';
const photos: PhotoFull[] = titles.map((title,i) => {
  const s = shootsBase[Math.floor(i / 6)];
  const id = i + 1;
  const shot = s.date + 'T' + String(9 + i % 7).padStart(2,'0') + ':25:00';
  const score = i % 5 === 0 ? 0 : 3 + (i % 3);
  return {
    id,title,file:`sample-${String(id).padStart(3,'0')}.jpg`,shootId:s.id,orphaned:false,
    ...(portraitIds.has(id) ? {w:4000,h:6000,ar:4000/6000} : {w:6000,h:4000,ar:1.5}),hasImage:true,capturedAt:shot,addedAt:now,dateEdit:null,
    camera:s.camera,lens:'35mm',exposure:'',iso:200,aperture:5.6,shutter:'1/250',focalMm:35,
    medium:s.id === 2 ? 'film' : 'digital',film:s.id === 2 ? 'Colour negative' : '',
    fileType:'JPEG',sizeMb:8.2,archived:false,missing:false,lastReviewedAt:score ? now : '',
    nextReviewAt:score ? '2027-01-01T12:00:00' : null,reviewCount:score ? 1 : 0,avgRating:score,
    lat:null,lon:null,place:s.place,placeAddress:'',placeKind:'',placePrecision:'city',parentId:null,
    palette:[{hex:'#34495e',pct:45,name:'Dark'},{hex:'#8495a5',pct:35,name:'Mid'},{hex:'#d4c3ae',pct:20,name:'Light'}],
    brightness:45,contrast:50,saturation:50,xmpRating:null,aiStatus:'done',
    description:'An illustrative photograph in the Frames demo.',descSource:'manual',
    tags:[...s.tags,'Travel'].map(name=>({name,kind:'tag' as const,source:'manual',accepted:true})),
    reviews:score ? [{session:1,date:now,rating:score}] : [],aiSuggestion:null,variants:[],conflicts:[]
  };
});
const shoots: Shoot[] = shootsBase.map(s => ({
  id:s.id,name:s.name,protected:false,source:'upload',place:s.place,description:'Sample photoshoot',
  dateFrom:s.date,dateTo:s.date,dates:new Date(s.date+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}),
  importedAt:now,count:6,coverId:1+(s.id-1)*6,reviewPct:83,dueCount:0,waitingCount:5,
  duePhotoIds:[],sessions:1,subjects:[],tags:s.tags,
  gear:{camera:s.camera,lens:'35mm',medium:s.id===2?'film':'digital',film:s.id===2?'Colour negative':''}
}));
// Each print hangs in the next frame size up, so a white mount shows around it.
const framed = (n:number,photoId:number,size:string,orientation:Orientation,color:string):Print =>
  ({id:n,size,orientation,frame:{size:nextUp(size),mat:'white',color},photoId,stack:false,photoId2:null,x:0,y:0});
const makeCollection = (id:number,name:string,ids:number[],stage:'progress'|'review'|'done',mode:Mode,prints:Print[]):Collection => ({
  id,name,stage,updatedAt:now,description:'An example composition',theme:'',target:null,photoIds:ids,
  chosenIds:prints.map(p=>p.photoId!),printedAt:null,layout:{mode,prints:mode==='free'?prints:arrange(prints,mode),ppi:300},layoutSaved:true
});
// The room picture is 4.2 m across at this scale; its sofa is centred 2.24 m from the left with its back 1.74 m down.
const ROOM_MM_PER_PX=2.1;
/** Lays the prints out as a feature wall, then hangs the group centred above the sofa, 20 cm clear of its back. */
function overSofa(prints:Print[]):Print[]{
  const laid=arrange(prints,'feature'),b=bounds(laid),dx=2240-(b.x0+b.w/2),dy=1540-(b.y0+b.h);
  return laid.map(p=>({...p,x:Math.round(p.x+dx),y:Math.round(p.y+dy)}));
}
const roomWall=makeCollection(1,'Places & spaces',[1,2,3,4,11,14,15],'progress','free',
  overSofa([framed(1,1,'A3','landscape','black'),framed(2,4,'A5','portrait','black'),framed(3,11,'A5','portrait','black')]));
let collections:Collection[] = [
  {...roomWall,background:{w:2000,h:1400,v:1},layout:{...roomWall.layout,bg:{mmPerPx:ROOM_MM_PER_PX}}},
  makeCollection(2,'Summer colours',[7,8,9,10],'review','row',[framed(1,7,'8×10″','landscape','oak')]),
  makeCollection(3,'City geometry',[13,14,16,17],'done','row',[framed(1,17,'A3','portrait','black')])
];
const settings:Settings = {
  sessions:3,intervals:['1d','7d','30d'],adaptive:false,archiveSuggest:false,autoRemove:false,
  autoRemoveBelow:1,autoRemoveAfter:90,binVotes:3,deleteBelow:1,todoReasons:[],
  ai:'off',aiActive:'',aiAutoAnalyse:false,xmpWriteBack:false,reviewSize:10,
  ratingStyle:'stars',newShootsFirst:true
};
const me:Me = {mode:'password',user:{name:'Demo visitor',email:'demo@example.invalid',provider:'demo',folder:''},
  id:1,owner:false,role:'member',canSignOut:false,displayName:'Demo visitor',hasAvatar:false,
  signups:false,envConfig:false};
const summary:Summary = {due:0,resumable:false,early:0,nextId:null,shootNames:[],total:photos.length,minutes:0,sessions:1};
const ideas = [{
  aiAssisted:false,name:'Light and shadow',reason:'Photographs with a similar mood',
  photoIds:[2,5,8,11],photos:[2,5,8,11].map(id=>photos[id-1]),tags:['Landscape','Travel'],
  colours:[{name:'Warm',hex:'#b8a38b'}]
}];

function queryPhotos(url:URL) {
  let result=photos.filter(p=>!p.archived);
  const q=(url.searchParams.get('q')||'').trim().toLowerCase();
  if(q) result=result.filter(p=>[p.title,p.file,p.camera,p.lens,p.place,...p.tags.map(t=>t.name)].join(' ').toLowerCase().includes(q));
  const shoot=url.searchParams.get('shoot');
  if(shoot) result=result.filter(p=>p.shootId===Number(shoot));
  for(const key of ['tag','subject'] as const) {
    const values=(url.searchParams.get(key)||'').split(',').filter(Boolean).map(x=>x.toLowerCase());
    if(values.length) result=result.filter(p=>values.every(v=>p.tags.some(t=>t.name.toLowerCase()===v)));
  }
  for(const key of ['camera','lens','place','file'] as const){
    const value=(url.searchParams.get(key)||'').toLowerCase();
    if(value) result=result.filter(p=>String(p[key]).toLowerCase().includes(value));
  }
  const from=url.searchParams.get('from'),to=url.searchParams.get('to');
  if(from) result=result.filter(p=>(p.capturedAt??'')>=from);
  if(to) result=result.filter(p=>(p.capturedAt??'').slice(0,10)<=to);
  if(url.searchParams.get('shape')==='portrait') result=result.filter(p=>p.h>p.w);
  if(url.searchParams.get('order')==='oldest') result=[...result].reverse();
  return {photos:result,total:photos.length,count:result.length,semantic:false};
}

const emptyStatus = {smtpHealthy:false,storage:{local:false,cloud:false},cloudProviders:[],admin:false};
function read(path:string):unknown {
  const url=new URL(path,'https://demo.invalid');
  const p=url.pathname;
  if(p==='/me')return me;
  if(p==='/settings')return {settings};
  if(p==='/review/summary')return summary;
  if(p==='/todo')return {total:0,items:[]};
  if(p==='/config/status')return emptyStatus;
  if(p==='/library/pending')return {count:0};
  if(p==='/shoots')return shoots;
  if(p==='/shoots/suggestions')return [];
  if(p==='/photos/scores')return Object.fromEntries(photos.filter(x=>x.reviewCount).map(x=>[x.id,x.avgRating]));
  if(p==='/photos/delete-suggestions')return {photos:[]};
  if(p==='/photos')return queryPhotos(url);
  if(/^\/photos\/\d+\/guests$/.test(p))return {avg:null,n:0};
  if(/^\/photos\/\d+$/.test(p))return photos.find(x=>x.id===Number(p.split('/')[2]))??null;
  if(p==='/collections')return collections;
  if(p==='/collections/suggestions')return ideas;
  if(/^\/collections\/\d+\/ranking$/.test(p))return {weight:1,guests:0,items:[]};
  if(/^\/collections\/\d+\/(suggestions|frame-suggestions|layout-suggestions)$/.test(p))return {suggestions:[]};
  if(/^\/collections\/\d+$/.test(p))return collections.find(x=>x.id===Number(p.split('/')[2]))??null;
  if(p==='/tags') {
    const names=photos.flatMap(x=>x.tags.filter(t=>t.kind===(url.searchParams.get('kind')||'tag')).map(t=>t.name));
    return [...new Set(names)].map(name=>({name,n:names.filter(x=>x===name).length}));
  }
  if(p==='/gear')return {cameras:[{name:'Digital camera',n:12},{name:'35mm film camera',n:6}],lenses:[{name:'35mm',n:18}]};
  if(p==='/gear/items')return {want:[],own:[],prefs:{currency:'$'}};
  if(p==='/community/summary')return {enabled:false,waiting:0,showOnHome:false};
  if(p==='/community/stats')return {reviewed:0,shared:0,received:0,average:null,notes:0,you:null,guests:null,community:null,favourites:[]};
  if(p==='/home/notes')return {text:''};
  if(p==='/home/batches')return {batches:[],left:0};
  if(p==='/cloud')return {connections:[]};
  if(p==='/notifications')return {items:[]};
  if(p==='/ai/status')return {enabled:false,running:false,done:0,total:0};
  if(p==='/ai/sources')return {sources:[]};
  if(p==='/profile')return {hemisphere:'south'};
  if(/^\/portfolio\/photos\/\d+$/.test(p))return {state:'none',inPortfolio:false,favourite:false,score:null};
  if(p==='/portfolio')return {config:{host:''},handle:''};
  if(p==='/health')return {version:DEMO_VERSION||'demo'};
  if(p==='/admin/env/drift')return {drift:0};
  if(p==='/getting-started')return {steps:[]};
  if(p==='/shares')return [];
  if(p==='/stats')return {year:'',years:['2025'],photos:photos.length,bytes:photos.length*8200000,
    completePct:80,avgRating:4,inCollections:13,dist:[1,2,3,4,5].map(value=>({value,n:photos.filter(x=>Math.round(x.avgRating)===value).length})),
    perShoot:shoots.map(s=>({id:s.id,name:s.name,n:s.count})),top:photos.slice(0,6),
    subjects:[],tags:[],trend:[],bySession:[]};
  // Unknown GETs are unavailable, not invented.
  throw new Error('This section is not available with sample data.');
}

// The release this demo was built from: the latest v* tag, set by the Pages workflow (empty in a local build).
const DEMO_VERSION=String(import.meta.env.VITE_DEMO_VERSION??'').replace(/^v/,'');
type Release={name:string;date:string;url:string;items:string[]};
/** Same bullets as releaseItems in server/src/routes/notifications.ts. */
const releaseItems=(body:string)=>{
  const lines=body.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const bullets=lines.filter(l=>/^[-*]\s+/.test(l)).map(l=>l.replace(/^[-*]\s+/,''));
  return (bullets.length?bullets:lines.filter(l=>!l.startsWith('#'))).slice(0,8).map(l=>l.slice(0,200));
};
/** What's new: the demo's own release first, then older ones, read from GitHub. Offline, just the demo's version. */
export async function demoReleases(get:typeof fetch=fetch){
  if(!DEMO_VERSION)return {current:'demo',releases:[],all:[],source:'none'};
  const tag=`v${DEMO_VERSION}`;
  const own:Release={name:tag,date:'',url:`https://github.com/trentnbauer/Frames/releases/tag/${tag}`,items:[]};
  try{
    const r=await get('https://api.github.com/repos/trentnbauer/Frames/releases?per_page=10',{headers:{Accept:'application/vnd.github+json'}});
    if(!r.ok)throw new Error();
    const data=await r.json() as {tag_name:string;name?:string;published_at?:string;html_url:string;body?:string;draft?:boolean;prerelease?:boolean}[];
    const list=data.filter(d=>!d.draft&&!d.prerelease&&/^https:\/\//.test(String(d.html_url)));
    const at=list.findIndex(d=>d.tag_name===tag);
    const all:Release[]=at<0?[own]:list.slice(at).map(d=>({name:String(d.name||d.tag_name).slice(0,100),date:String(d.published_at??'').slice(0,10),url:d.html_url,items:releaseItems(String(d.body??''))}));
    return {current:DEMO_VERSION,releases:[],all,source:'github'};
  }catch{return {current:DEMO_VERSION,releases:[],all:[own],source:'none'};}
}

/** Composition edits live only in this browser tab's demo memory.
 * No request reaches a backend and refreshing restores the sample compositions.
 */
function updateDemoCollection(path: string, body: unknown): Collection {
  const match = /^\/collections\/(\d+)$/.exec(new URL(path, 'https://demo.invalid').pathname);
  if (!match || !body || typeof body !== 'object') throw new Error('Read-only demo: changes are disabled.');
  const index = collections.findIndex(c => c.id === Number(match[1]));
  if (index < 0) throw new Error('Sample composition not found.');
  const patch = body as Partial<Collection>;
  const allowed = Object.keys(patch).every(k => ['layout', 'name', 'stage'].includes(k));
  if (!allowed) throw new Error('Read-only demo: changes are disabled.');
  const current = collections[index];
  const next: Collection = { ...current, ...patch, updatedAt: new Date().toISOString() };
  collections = collections.map((c, i) => i === index ? next : c);
  return next;
}

/** Only isolated in-memory composition changes are allowed; all other writes fail. */
export async function demoApi<T>(path:string,init?:{method?:string;body?:unknown}):Promise<T>{
  const method=(init?.method??(init?.body!==undefined?'POST':'GET')).toUpperCase();
  if(method==='PATCH' && path.startsWith('/collections/') && /^\d+$/.test(path.split('?')[0].slice('/collections/'.length))) return updateDemoCollection(path, init?.body) as T;
  if(method!=='GET'||init?.body!==undefined)throw new Error('Read-only demo: changes are disabled.');
  if(path.split('?')[0]==='/releases')return demoReleases() as Promise<T>;
  return read(path) as T;
}
