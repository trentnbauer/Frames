// Client-side only: Google/Dropbox app credentials used here are public
// identifiers (API key + OAuth client ID, app key) meant to ship in
// browser code — not secrets, so localStorage is fine, no backend storage
// needed for values a user types into Settings. Container-level defaults
// (set via FRAMES_GOOGLE_* / FRAMES_DROPBOX_APP_KEY / FRAMES_SOCIAL_HANDLES
// env vars) come from GET /api/config and are cached here — call
// loadEnvConfig() once at startup. A value the user explicitly typed in
// Settings always wins over the env default.

const GOOGLE_KEY = 'frames-google-drive-config';
const DROPBOX_KEY = 'frames-dropbox-config';
const SOCIAL_KEY = 'frames-social-handles';

export interface GoogleDriveConfig {
  apiKey: string;
  clientId: string;
}

export interface DropboxConfig {
  appKey: string;
}

let envGoogle: GoogleDriveConfig | null = null;
let envDropbox: DropboxConfig | null = null;
let envSocialHandles: string[] | null = null;

let resolveConfigReady: () => void;
// Resolves once loadEnvConfig() has finished (success or failure) — lets
// components that snapshotted a getter in a useState initializer re-read it,
// since /api/config can't possibly resolve before their first render.
export const configReady: Promise<void> = new Promise((resolve) => {
  resolveConfigReady = resolve;
});

export async function loadEnvConfig(): Promise<void> {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const data = await res.json();
    envGoogle = data.googleDrive ?? null;
    envDropbox = data.dropbox ?? null;
    envSocialHandles = data.socialHandles ?? null;
  } catch {
    // Env defaults are optional — localStorage-only config still works.
  } finally {
    resolveConfigReady();
  }
}

export function getGoogleDriveConfig(): GoogleDriveConfig {
  let stored: Partial<GoogleDriveConfig> = {};
  try {
    stored = JSON.parse(localStorage.getItem(GOOGLE_KEY) || '{}');
  } catch {
    // fall through to defaults below
  }
  return {
    apiKey: stored.apiKey || envGoogle?.apiKey || '',
    clientId: stored.clientId || envGoogle?.clientId || '',
  };
}

export function setGoogleDriveConfig(config: GoogleDriveConfig) {
  localStorage.setItem(GOOGLE_KEY, JSON.stringify(config));
}

export function getDropboxConfig(): DropboxConfig {
  let stored: Partial<DropboxConfig> = {};
  try {
    stored = JSON.parse(localStorage.getItem(DROPBOX_KEY) || '{}');
  } catch {
    // fall through to defaults below
  }
  return { appKey: stored.appKey || envDropbox?.appKey || '' };
}

export function setDropboxConfig(config: DropboxConfig) {
  localStorage.setItem(DROPBOX_KEY, JSON.stringify(config));
}

export function getSocialHandles(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(SOCIAL_KEY) || 'null');
    if (Array.isArray(stored)) return stored;
  } catch {
    // fall through to env default below
  }
  return envSocialHandles ?? [];
}

export function setSocialHandles(handles: string[]) {
  localStorage.setItem(SOCIAL_KEY, JSON.stringify(handles));
}
