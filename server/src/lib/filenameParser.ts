// Best-effort camera / film-stock / season parse from filename.
// Filenames are free-form scanner/photographer output, so this is a heuristic
// keyword match, not a real EXIF read (deliberately out of scope, see plan.md).

const CAMERAS = [
  'Leica M6', 'Leica M3', 'Leica MP', 'Nikon FM2', 'Nikon F3', 'Nikon FE2',
  'Canon AE-1', 'Canon A-1', 'Pentax K1000', 'Pentax MX', 'Olympus OM-1',
  'Olympus OM-2', 'Contax T2', 'Contax G2', 'Mamiya RB67', 'Mamiya 7',
  'Hasselblad 500CM', 'Rolleiflex', 'Yashica Mat', 'Minolta X-700',
  'Fujifilm GW690', 'Bronica ETRS',
];

const FILM_STOCKS = [
  'Portra 400', 'Portra 160', 'Portra 800', 'Ektar 100', 'Gold 200',
  'ColorPlus 200', 'UltraMax 400', 'HP5', 'HP5 Plus', 'Tri-X', 'Tri-X 400',
  'Delta 3200', 'Delta 400', 'Delta 100', 'Acros 100', 'Ektachrome',
  'Provia 100F', 'Velvia 50', 'CineStill 800T', 'CineStill 400D',
  'Lomo 400', 'Fomapan 400', 'Fomapan 100', 'Pan F',
];

const SEASONS = ['spring', 'summer', 'autumn', 'fall', 'winter'];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[_\-.]+/g, ' ');
}

function findMatch(normalizedName: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const normalizedCandidate = normalize(candidate);
    if (normalizedName.includes(normalizedCandidate)) return candidate;
  }
  return null;
}

function seasonFromDate(name: string): string | null {
  const match = name.match(/(19|20)\d{2}[-_]?(\d{2})/);
  if (!match) return null;
  const month = parseInt(match[2], 10);
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

export interface ParsedFilename {
  camera: string | null;
  filmStock: string | null;
  season: string | null;
}

export function parseFilename(filename: string): ParsedFilename {
  const normalized = normalize(filename);

  const camera = findMatch(normalized, CAMERAS);
  const filmStock = findMatch(normalized, FILM_STOCKS);
  const seasonKeyword = findMatch(normalized, SEASONS);
  const season = seasonKeyword ? (seasonKeyword === 'fall' ? 'autumn' : seasonKeyword) : seasonFromDate(filename);

  return { camera, filmStock, season };
}
