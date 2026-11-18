import { Navigate, useSearchParams } from 'react-router-dom';
import { usePhoneWidth } from '../usePhoneWidth';
import { MobileLibrary } from '../mobile/Library';
import { LibraryPage } from '../desktop/LibraryPage';

/** Library: on a phone its own page; on a wide screen Shoots and Photos views, with every filter in the Photos view (all in the address). */
export function Library() {
  const phone = usePhoneWidth();
  const [sp] = useSearchParams();
  if (phone) return <MobileLibrary />;
  // The old "More filters" page (?adv=1) is now the Photos view with its Filters menu.
  if (sp.get('adv')) { const n = new URLSearchParams(sp); n.delete('adv'); n.set('view', 'photos'); return <Navigate to={`/library?${n}`} replace />; }
  return <LibraryPage />;
}
