# Server settings

Administrators have ten sections under *Settings, Server*. Settings are saved in the app; [the env file](Env-file) can export them and take over.

| Section | What it holds |
|---|---|
| **Sign-in & access** | Methods, two-factor enforcement (off/admins/all members), how long a sign-in lasts, whether anyone may sign up, the defaults for new guest links, the bot check. See [Signing in](Sign-in) and [Security](Security). |
| **Members** | Who can sign in, roles, switching someone off and verified administrator factor resets. Members can optionally see each other's shoot names and dates. |
| **Storage** | Library folders, XMP sidecars, the originals rules and cloud app registrations. Who may connect cloud storage, the fastest sync, a storage cap per person from the cloud, and a **storage limit per person** across local and cloud storage in the Limits tab (an upload over it is refused; nothing already stored is removed; administrators are not limited). |
| **Backup** | On or off, daily or weekly, how many to keep, Back up now, history and restore, off-server copies. See [Backup and restore](Backup-and-restore). |
| **AI** | The AIs everyone can use, who may use them, a monthly limit per person, and whether members may add their own. See [AI](AI). |
| **Cloudflare tunnel** | See [Cloudflare tunnel](Cloudflare-tunnel). |
| **Email** | SMTP for sign-in codes and notices, with a health check and the email log. |
| **Policies** | The terms and the privacy page. See below. |
| **Cache & processing** | Cache size (the previews opened longest ago are deleted and made again when opened), the preview size, how many photographs are processed at once, rescan, rebuild thumbnails. |
| **Updates & system** | Version, update channel, health checks, the log level, a window onto the newest log lines (last seven days, downloadable; emergency credentials excluded), the env file, restart. |

Verify integration settings against your own SMTP, Cloudflare, S3 and cloud accounts. See [App settings](App-settings) for per-user display preferences and browser-cache troubleshooting.

## Policies

Everyone can read the **terms** and the **privacy page** (`/privacy`) without signing in. Frames writes both, kept true to how your server is set up: which sign-in methods exist, whether a tunnel is on, how long sessions and backups last.

An administrator can edit them under *Settings, Server, Policies*:

- Each policy is a list of sections, a heading and some text. Change any text, add, remove or reorder sections, and they become your own: Frames stops updating them.
- In the text, a blank line starts a paragraph, a line starting `- ` is a bullet and `**words**` are bold. Nothing else is interpreted, so text can never become markup.
- **Use Frames' text** puts the written-by-Frames version back.
- The privacy page also takes the operator's name, a contact and a free note, shown at the top and bottom.

The privacy page describes what the software does. It is not legal advice; check it against the rules that apply to you.

## Updates and deployment

**Server → Updates & system** shows the current version, the release check and the “Show admins what’s new” preference. The update-channel selector has been removed; deploy the desired Docker image tag through your server configuration.

**Storage per person** is under **Server settings → Storage → Limits → Member storage**. This limit covers each member’s combined local and cloud usage; administrators are exempt. The setting also appears at this location in Settings search.
