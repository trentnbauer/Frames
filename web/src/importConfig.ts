// Client-side only: Google/Dropbox app credentials used here are public
// identifiers (API key + OAuth client ID, app key) meant to ship in
// browser code — not secrets, so localStorage is fine, no backend needed.

const GOOGLE_KEY = 'frames-google-drive-config';
const DROPBOX_KEY = 'frames-dropbox-config';

export interface GoogleDriveConfig {
  apiKey: string;
  clientId: string;
}

export interface DropboxConfig {
  appKey: string;
}

export function getGoogleDriveConfig(): GoogleDriveConfig {
  try {
    return { apiKey: '', clientId: '', ...JSON.parse(localStorage.getItem(GOOGLE_KEY) || '{}') };
  } catch {
    return { apiKey: '', clientId: '' };
  }
}

export function setGoogleDriveConfig(config: GoogleDriveConfig) {
  localStorage.setItem(GOOGLE_KEY, JSON.stringify(config));
}

export function getDropboxConfig(): DropboxConfig {
  try {
    return { appKey: '', ...JSON.parse(localStorage.getItem(DROPBOX_KEY) || '{}') };
  } catch {
    return { appKey: '' };
  }
}

export function setDropboxConfig(config: DropboxConfig) {
  localStorage.setItem(DROPBOX_KEY, JSON.stringify(config));
}
