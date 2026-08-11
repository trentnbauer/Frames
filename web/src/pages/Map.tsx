import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api.js';
import type { MapPoint } from '../types.js';
import { PhotoDetail } from '../components/PhotoDetail.js';

// Leaflet + OpenStreetMap tiles — same no-API-key philosophy as the
// weather/geocoding features (lib/weather.ts) and the reverse-geocode used
// at ingest (lib/exif.ts). Custom div-icon markers instead of Leaflet's
// default pin images, which need bundler-specific path config to not 404
// under Vite — a plain CSS dot sidesteps that entirely and matches the
// app's own accent color.
export function Map() {
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openPhotoId, setOpenPhotoId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    api.discovery.mapPoints().then((res) => {
      setPoints(res.points);
      setLoaded(true);
    });
  }, []);

  // Mounts once — the container div is always in the DOM (see render
  // below) so this doesn't race the points fetch.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;

    const icon = L.divIcon({ className: 'map-pin', iconSize: [14, 14] });
    const markers = points.map((p) => {
      const marker = L.marker([p.latitude, p.longitude], { icon, title: p.filename }).addTo(map);
      marker.on('click', () => setOpenPhotoId(p.id));
      return marker;
    });

    const bounds = L.latLngBounds(points.map((p): [number, number] => [p.latitude, p.longitude]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });

    return () => {
      markers.forEach((m) => m.remove());
    };
  }, [points]);

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Map</h1>
          <div className="page-subtitle">
            {loaded ? `${points.length} photo${points.length === 1 ? '' : 's'} with location data` : 'Loading…'}
          </div>
        </div>
      </div>

      {loaded && points.length === 0 && (
        <p className="muted">
          No photos with location data yet — GPS coordinates come from a scan's EXIF data at import time, when present.
        </p>
      )}

      <div ref={containerRef} className="map-view" style={{ display: loaded && points.length === 0 ? 'none' : 'block' }} />

      {openPhotoId !== null && <PhotoDetail photoId={openPhotoId} onClose={() => setOpenPhotoId(null)} onChanged={() => {}} />}
    </div>
  );
}
