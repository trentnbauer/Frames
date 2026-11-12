/** Ask the browser to discard its HTTP cache/cookies/storage, then clear accessible storage as a fallback. */
export async function clearSiteData(): Promise<void> {
  const response = await fetch('/auth/logout?clearSiteData=1', { method: 'POST', cache: 'no-store' });
  if (!response.ok) throw new Error('Could not clear site data. Please try again.');

  const cleanup: Promise<unknown>[] = [
    Promise.resolve().then(() => localStorage.clear()),
    Promise.resolve().then(() => sessionStorage.clear()),
  ];
  cleanup.push(Promise.resolve().then(() => 'caches' in window ? caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name)))) : undefined));
  cleanup.push(Promise.resolve().then(() => 'serviceWorker' in navigator ? navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))) : undefined));
  cleanup.push(Promise.resolve().then(() => 'indexedDB' in window && typeof indexedDB.databases === 'function' ? indexedDB.databases().then((databases) => Promise.all(databases.filter((db) => db.name).map((db) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(db.name!);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // Open connections can defer deletion until the following reload closes this page.
    request.onblocked = () => resolve();
  })))) : undefined));
  // Restricted or unsupported browser storage must not prevent the reload after the server's reset response.
  await Promise.allSettled(cleanup);
}
