const VERSION_KEY = 'frames-loaded-version';

/** Run before mounting forms so an update cannot interrupt an edit or upload. */
export async function refreshAfterUpdate(): Promise<boolean> {
  try {
    const response = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!response.ok) return false;
    const { version } = await response.json();
    if (typeof version !== 'string' || !version || version === 'dev') return false;
    const previous = localStorage.getItem(VERSION_KEY);
    localStorage.setItem(VERSION_KEY, version);
    if (!previous || previous === version) return false;
    const cleanup = Promise.allSettled([
      Promise.resolve().then(async () => { if ('caches' in window) for (const name of await caches.keys()) await caches.delete(name); }),
      Promise.resolve().then(async () => { if ('serviceWorker' in navigator) for (const worker of await navigator.serviceWorker.getRegistrations()) await worker.unregister(); }),
      // Revalidate the document in the HTTP cache too. Bundles have content-hashed URLs.
      fetch(window.location.href, { cache: 'reload', signal: AbortSignal.timeout(3000) }),
    ]);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([cleanup, new Promise<void>((resolve) => { timeout = setTimeout(resolve, 3000); })]);
    clearTimeout(timeout);
    window.location.reload();
    return true;
  } catch { return false; } // Offline or blocked storage must not prevent opening Frames.
}
