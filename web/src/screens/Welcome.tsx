import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import { Header } from '../components/Shell';
import type { PhotoLite } from '../data';
import ProtoMore from '../proto/ProtoMore';

const STEPS: [string, string, string[]][] = [
  ['Bring your photos in', 'Frames starts with your photos. Bring in a shoot from this computer or a cloud folder, and it sorts them for you.', ['Upload from this computer, or connect Google Drive, iCloud or Dropbox', 'New photos are grouped into shoots by day, ready to name', 'Your originals are only ever read, never changed']],
  ['Shoots and compositions', 'A shoot is a day out or a roll of film. A composition is a wall of prints you’re planning to hang.', ['Each composition has prints, sizes, frames and mats', 'Frames ranks candidate photos to fill each print', 'Export sends the originals with print notes to your lab']],
  ['Rate a little, often', 'Each photo comes back a few times over weeks, so the score that settles is honest.', ['A review is about 12 photos and takes a few minutes', 'Your past ratings stay hidden while you rate', 'Settled scores rank compositions and fill your portfolio']],
  ['Ask other people', 'Share a composition with a link and let friends weigh in before you print.', ['Guests don’t need an account', 'They rate photos and suggest swaps; you approve or deny', 'Their scores stay separate from yours']],
];

/** The welcome tour (design: Proto More, page "welcome"): four short pages, shown once. Skip is on the first page only. */
export function Welcome() {
  const nav = useNavigate();
  const [i, setI] = useState(0);
  const photos = useApi<{ photos: PhotoLite[] }>('/photos?limit=8');
  // Shown once: it counts as seen as soon as it opens, so it never comes back half-done.
  useEffect(() => { void api('/welcome', { method: 'PUT', body: { done: true } }).catch(() => undefined); }, []);
  const finish = async () => { await api('/welcome', { method: 'PUT', body: { done: true } }).catch(() => undefined); nav('/', { replace: true }); };
  const [title, lead, facts] = STEPS[i];
  const last = i === STEPS.length - 1;
  const pic = photos.data?.photos[(i * 2) % Math.max(1, photos.data.photos.length)];
  const v = {
    isWelcome: true, isStats: false, isTodo: false, isCompare: false, isDupes: false, isNew: false,
    wStep: i + 1, wTitle: title, wBody: lead, wFacts: facts.map((t, k) => ({ n: `0${k + 1}`, t })),
    wImg: pic ? imgUrl(pic.id, 'preview') : '',
    wFirst: i === 0, wHasBack: i > 0, wBack: () => setI(i - 1), wSkip: finish, wNext: () => (last ? finish() : setI(i + 1)), wNextLabel: last ? 'Start using Frames' : 'Next',
    wDots: STEPS.map((_, k) => ({ bg: k === i ? 'var(--text)' : 'var(--outline)', go: () => setI(k) })),
  };
  return <div className="page-shell"><Header /><ProtoMore page="welcome" v={v} /></div>;
}
