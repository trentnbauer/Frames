import { beforeEach, describe, expect, it } from 'vitest';
import { getDropboxConfig, getGoogleDriveConfig, setDropboxConfig, setGoogleDriveConfig } from './importConfig.js';

describe('importConfig', () => {
  beforeEach(() => localStorage.clear());

  it('returns empty defaults when nothing is stored', () => {
    expect(getGoogleDriveConfig()).toEqual({ apiKey: '', clientId: '' });
    expect(getDropboxConfig()).toEqual({ appKey: '' });
  });

  it('round-trips a Google Drive config through localStorage', () => {
    setGoogleDriveConfig({ apiKey: 'AIzaTest', clientId: 'abc.apps.googleusercontent.com' });
    expect(getGoogleDriveConfig()).toEqual({ apiKey: 'AIzaTest', clientId: 'abc.apps.googleusercontent.com' });
  });

  it('round-trips a Dropbox config through localStorage', () => {
    setDropboxConfig({ appKey: 'dbx123' });
    expect(getDropboxConfig()).toEqual({ appKey: 'dbx123' });
  });

  it('falls back to defaults when stored value is corrupt JSON', () => {
    localStorage.setItem('frames-google-drive-config', 'not json');
    expect(getGoogleDriveConfig()).toEqual({ apiKey: '', clientId: '' });
  });

  it('keeps Google and Dropbox config independent', () => {
    setGoogleDriveConfig({ apiKey: 'g-key', clientId: 'g-client' });
    setDropboxConfig({ appKey: 'd-key' });
    expect(getGoogleDriveConfig().apiKey).toBe('g-key');
    expect(getDropboxConfig().appKey).toBe('d-key');
  });
});
