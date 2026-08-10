const KEY = 'frames-weather-location';

export function getStoredLocation(): string {
  return localStorage.getItem(KEY) || '';
}

export function setStoredLocation(location: string) {
  localStorage.setItem(KEY, location);
}
