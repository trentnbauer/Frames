# People and libraries

With personal sign-in enabled, each person has their own photographs, shoots, reviews, compositions, shares, tags, AI/cloud settings, backups and portfolio. The owner's existing library stays in place; other libraries live under `data/users/<id>`.

- **Admins** manage server configuration, access, members and recovery. **Members** work in their own library. **Guests** only open shared content and keep a Shared with you list; they have no library.
- Administrators can invite people, change their role/folder, switch them off or delete their data under **Settings → Server → Members**. There must remain a regular administrator; the temporary emergency account does not count.
- Library folder mounts are read-only. Uploads and cloud-copied files live in the person's data directory. An account's folder under the library mount can be set by an administrator.
- Signup/access rules determine who may create an account. Existing accounts and invited addresses remain subject to their role and disabled state.

## Your settings

The **Your library** scope contains Profile, App settings, Password & security, Notifications, Reviews, Tags & subjects, Camera & XMP, AI, Cloud folders, Portfolio and Your data. **Server** appears only to administrators. Search settings with **Find a setting**; results respect the caller's scope.

Profile holds identity details. Display preferences and Welcome tour are under [App settings](App-settings). Linked methods, passkeys, sessions and [two-factor authentication](Sign-in) are under Password & security. Tags and subjects share a management interface with their own kinds retained.

## Recovery and privacy

A verified administrator can reset another account's factors from **Members → Manage people → Manage the person**. This removes authenticator/recovery/passkey credentials and signs out the account; it does not delete their library. Confirm their identity before resetting. Guests are exempt from 2FA, and the temporary emergency administrator is always exempt and can perform recovery.

People can request deletion under Your data; administrators can do it for them. Library-folder originals are not touched. Share links and portfolio pages expose only their intended public content. The editable terms/privacy policies are under Server → Policies. See [Security](Security), [Backup and restore](Backup-and-restore) and [Share links](Share-links).
