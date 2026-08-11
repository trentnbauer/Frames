import exifr from 'exifr';

export interface ExifFields {
  camera: string | null;
  lens: string | null;
  latitude: number | null;
  longitude: number | null;
}

const EMPTY: ExifFields = { camera: null, lens: null, latitude: null, longitude: null };

// Local-buffer parsing only, no network — safe to await inline during
// ingest alongside derivative generation. Camera is a fallback, not an
// override: parseFilename's guess wins when present (see ingest.ts),
// since a scanned film negative/print's EXIF typically names the
// SCANNER (Epson V600, Noritsu, Frontier...), not the film camera that
// actually shot it. Lens and GPS have no filename equivalent at all, so
// those are pure additions.
export async function extractExifFields(buffer: Buffer): Promise<ExifFields> {
  let output: Record<string, unknown> | null;
  try {
    output = await exifr.parse(buffer, { gps: true });
  } catch {
    return EMPTY;
  }
  if (!output) return EMPTY;

  const make = typeof output.Make === 'string' ? output.Make.trim() : null;
  const model = typeof output.Model === 'string' ? output.Model.trim() : null;
  const lens = typeof output.LensModel === 'string' && output.LensModel.trim() ? output.LensModel.trim() : null;
  const latitude = typeof output.latitude === 'number' ? output.latitude : null;
  const longitude = typeof output.longitude === 'number' ? output.longitude : null;

  return { camera: combineCamera(make, model), lens, latitude, longitude };
}

function combineCamera(make: string | null, model: string | null): string | null {
  if (!make && !model) return null;
  if (!make) return model;
  if (!model) return make;
  // Many cameras already repeat the make in Model (e.g. Make "Canon",
  // Model "Canon EOS 5D") — avoid "Canon Canon EOS 5D".
  return model.toLowerCase().includes(make.toLowerCase()) ? model : `${make} ${model}`;
}

// Keyless reverse geocoding via Nominatim (OpenStreetMap), same
// no-API-key philosophy as lib/weather.ts's forward geocoding. Runs
// fire-and-forget after ingest (see ingest.ts) since it's a network call
// and shouldn't hold up the upload response or get rate-limited across a
// batch upload the way a synchronous per-photo call would.
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`, {
      headers: { 'User-Agent': 'Frames (self-hosted film-photo app) - github.com/frames' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const address = data.address ?? {};
    const place: string | undefined = address.city || address.town || address.village || address.suburb || address.county;
    if (!place) return null;
    return address.state && address.state !== place ? `${place}, ${address.state}` : place;
  } catch {
    return null;
  }
}
