import { beforeEach, describe, expect, it, vi } from 'vitest';
import { navigate, parseRoute } from './router.js';

function setPath(path: string) {
  window.history.pushState(null, '', path);
}

describe('parseRoute', () => {
  it('defaults to dashboard at the root path', () => {
    setPath('/');
    expect(parseRoute()).toEqual({ screen: 'dashboard', projectId: null });
  });

  it('parses each top-level screen path', () => {
    setPath('/library');
    expect(parseRoute()).toEqual({ screen: 'library', projectId: null });
    setPath('/settings');
    expect(parseRoute()).toEqual({ screen: 'settings', projectId: null });
  });

  it('redirects the old /import path to library', () => {
    setPath('/import');
    expect(parseRoute()).toEqual({ screen: 'library', projectId: null });
  });

  it('parses a project detail path with its id', () => {
    setPath('/projects/42');
    expect(parseRoute()).toEqual({ screen: 'project', projectId: 42 });
  });

  it('falls back to dashboard for an unrecognized path', () => {
    setPath('/totally/unknown/route');
    expect(parseRoute()).toEqual({ screen: 'dashboard', projectId: null });
  });
});

describe('navigate', () => {
  beforeEach(() => setPath('/'));

  it('pushes the matching path for a screen', () => {
    navigate({ screen: 'library', projectId: null });
    expect(window.location.pathname).toBe('/library');
  });

  it('pushes a project path when projectId is set', () => {
    navigate({ screen: 'project', projectId: 7 });
    expect(window.location.pathname).toBe('/projects/7');
  });

  it('does not push a new history entry when already on the target path', () => {
    setPath('/library');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    navigate({ screen: 'library', projectId: null });
    expect(pushSpy).not.toHaveBeenCalled();
    pushSpy.mockRestore();
  });

  it('dispatches a popstate event so listeners re-sync without a real navigation', () => {
    const handler = vi.fn();
    window.addEventListener('popstate', handler);
    navigate({ screen: 'settings', projectId: null });
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('popstate', handler);
  });
});
