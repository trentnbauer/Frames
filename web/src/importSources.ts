// Google Picker (via Google Identity Services) and Dropbox Chooser are both
// client-side widgets that only need a public API key / OAuth client ID /
// app key — no client secret, so no backend involvement. Picked files are
// fetched to a Blob in the browser and handed back as plain File objects,
// which the caller then runs through the normal upload path.

import { getDropboxConfig, getGoogleDriveConfig } from './importConfig.js';

declare global {
  interface Window {
    google?: any;
    gapi?: any;
    Dropbox?: any;
  }
}

function loadScript(src: string, attrs: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    for (const [key, value] of Object.entries(attrs)) script.setAttribute(key, value);
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

let pickerLoaded = false;

export async function pickFromGoogleDrive(): Promise<File[]> {
  const { apiKey, clientId } = getGoogleDriveConfig();
  if (!apiKey || !clientId) {
    throw new Error('Set your Google Drive API key and OAuth client ID in Settings first.');
  }

  await loadScript('https://accounts.google.com/gsi/client');
  await loadScript('https://apis.google.com/js/api.js');

  if (!pickerLoaded) {
    await new Promise<void>((resolve) => window.gapi.load('picker', () => resolve()));
    pickerLoaded = true;
  }

  const accessToken: string = await new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      callback: (resp: any) => {
        if (resp.error) reject(new Error(resp.error));
        else resolve(resp.access_token);
      },
    });
    tokenClient.requestAccessToken();
  });

  const docs: any[] = await new Promise((resolve) => {
    const picker = new window.gapi.picker.api.PickerBuilder()
      .addView(window.gapi.picker.api.ViewId.DOCS_IMAGES)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setCallback((data: any) => {
        if (data.action === window.gapi.picker.api.Action.PICKED) resolve(data.docs);
        else if (data.action === window.gapi.picker.api.Action.CANCEL) resolve([]);
      })
      .build();
    picker.setVisible(true);
  });

  const files: File[] = [];
  for (const doc of docs) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) continue;
    const blob = await res.blob();
    files.push(new File([blob], doc.name, { type: blob.type || doc.mimeType }));
  }
  return files;
}

export async function pickFromDropbox(): Promise<File[]> {
  const { appKey } = getDropboxConfig();
  if (!appKey) {
    throw new Error('Set your Dropbox app key in Settings first.');
  }

  await loadScript('https://www.dropbox.com/static/api/2/dropins.js', {
    id: 'dropboxjs',
    'data-app-key': appKey,
  });

  const chosen: any[] = await new Promise((resolve) => {
    window.Dropbox.choose({
      success: (files: any[]) => resolve(files),
      cancel: () => resolve([]),
      linkType: 'direct',
      multiselect: true,
      extensions: ['images'],
    });
  });

  const files: File[] = [];
  for (const item of chosen) {
    const res = await fetch(item.link);
    if (!res.ok) continue;
    const blob = await res.blob();
    files.push(new File([blob], item.name, { type: blob.type }));
  }
  return files;
}
