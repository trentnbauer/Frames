/** What to do when the server cannot go on: say so in the log and stop (the container restarts it). Nothing is ever sent anywhere. */
export function installCrashHandlers() {
  const die = (e: unknown, kind: string) => { console.error(kind, e); setTimeout(() => process.exit(1), 100); };
  process.on('uncaughtException', (e) => die(e, 'uncaughtException'));
  process.on('unhandledRejection', (e) => die(e, 'unhandledRejection'));
}
