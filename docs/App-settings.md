# App settings and troubleshooting

Open **Settings** from the user dropdown, then choose **Your library → App settings**. The dropdown has one Settings entry; display controls live inside Settings.

![App settings in the light theme](https://raw.githubusercontent.com/wiki/trentnbauer/Frames/screenshots/app-settings-light.png)

The icon immediately left of the user dropdown switches themes using the same saved preference.

- **Theme:** choose Dark or Light. The choice is saved in this browser and applies to the app's backgrounds, text and controls, including the editor and Settings. Photographs and frame/mat material colours are not inverted.
- **Full width:** use the available width throughout Home, Shoots, Library, Compositions, the editor, Gear, Stats and Settings. Switch it off for the centred layout. Dialogs and individual fields retain their own sizing.
- **Open Frames on, Print sizes in, Dates:** these existing preferences save their values but are not yet applied throughout the app; their hints identify that limit.
- **Welcome tour:** reopen it under Help. It is no longer a separate user-dropdown entry.

## Clear site data

Use **App settings → Troubleshooting → Clear site data**, or the shortcut immediately above Sign out in the user dropdown. Confirm **Clear and reload** to clear this origin's cached files and browser preferences and end the current Frames session. Your server-side photographs, reviews and settings stay saved; you may need to sign in again.

Only the host-only Frames session cookie is expired. Cookies and sign-ins on other subdomains are preserved: clearing `frames.example.com` must not sign you out of another app at `mail.example.com`. Browser-managed caches, local/session storage, service workers and supported IndexedDB databases are cleared for the current origin. HTTP cache clearing uses the browser's Clear-Site-Data support, normally over HTTPS. A failed reset shows an error rather than reporting success.

## Updates

When you next open or reload the app after its deployed version changes, Frames refreshes cached app files and reloads once. It preserves sign-in, theme and other preferences. The first visit establishes the version baseline; development versions and unavailable health checks skip this refresh. It does not interrupt a page that is already being edited or an upload already in progress.

The shared Frames header keeps the Home layout's position across navigation. Browse headers, including the Compositions list, remain sticky below it; the composition editor's title/action bar scrolls with its page.

## Environment warning

The environment-drift warning stays above the sticky app header. Header and sticky browse controls are offset by the warning’s measured height, including wrapped mobile layouts; without the warning, the normal header position is preserved.

## In-app confirmations

Confirmations and typed confirmations use Frames’ themed modals throughout the app, including deletion, account security, restoring backups and changing storage policies. Cancel, Escape or clicking outside cancels the pending action. When a confirmation opens above another modal, Escape closes only the top modal.
