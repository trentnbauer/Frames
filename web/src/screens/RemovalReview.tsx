import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RemovalReview } from '../components/RemovalReview';
import { useStore } from '../store';
import { usePhoneWidth } from '../usePhoneWidth';
import { MobileRemoval } from '../mobile/Removal';

export function RemovalReviewScreen() {
  const nav = useNavigate(), location = useLocation();
  const { refreshSummary } = useStore();
  const phone = usePhoneWidth();
  const leave = () => { refreshSummary(); if (location.key !== 'default') nav(-1); else nav('/todo'); };
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') leave(); };
    document.title = 'Removal review · Frames';
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', key); };
  }, [location.key, nav, refreshSummary]);
  if (phone) return <MobileRemoval onChanged={refreshSummary} onLeave={leave} />;
  return <main className="removal-screen"><button className="btn outline removal-exit" onClick={leave}>Done <span className="mono faint" style={{ fontSize: 11 }}>· Esc</span></button><RemovalReview onChanged={refreshSummary} /></main>;
}
