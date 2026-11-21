# Signing in

Administrators choose primary sign-in methods under **Settings → Server → Sign-in & access**. A provider's Configure button opens only that provider's configuration. Each person manages their own linked methods, passkeys, session history and two-factor setup under **Your library → Password & security**.

## Primary methods

- **Email code:** a six-character, single-use code valid for ten minutes. Offered while SMTP is configured and its health check passes.
- **Passkeys:** the server stores a public key, not your fingerprint or device PIN. A passkey belongs to the site's relying-party address; changing hostnames can require a different passkey. WebAuthn requires HTTPS or localhost.
- **Providers:** Google, Microsoft, GitHub, supported OpenID Connect/OAuth providers, or Cloudflare Access, as configured by the administrator. Link additional methods to the same account under Password & security.
- **Personal password:** optional email/password sign-in, enabled by an administrator; see setup below.
- **Shared password:** for a simple owner-only setup. It does not create a named personal session and cannot satisfy enforced two-factor authentication.

Guest accounts keep a Shared with you list without receiving a library. A guest can still use a share link without creating an account, according to that link's permissions.

**Provider sign-ins finish in the same browser.** A sign-in through an OAuth or OpenID provider is only accepted in the browser that started it (a short-lived cookie, `frames_flow`, is set when you choose the provider). Opening the provider's return address in another browser or device shows "This sign-in was not started in this browser. Please start again." Start the sign-in again from the sign-in page in the browser you want to use.

**Adding another way to sign in.** Finish adding an account (Settings, Security, Add another way to sign in) in the same browser you started from, while still signed in. If the provider sends you back to a different browser, or after you have signed out, Frames refuses with "Sign in first" and nothing is added.

**Links in emailed codes.** The links in a sign-in code email ("Open Frames", Email settings, Terms) and the server name it shows come from the **public address** in Settings, Sign-in & access. If no public address is set, Frames uses the address the browser asked for only when it is listed in `ALLOWED_HOSTS`. Otherwise the email has the code but no working links. Set the public address so these links work.

## Personal passwords

Personal **email and password** sign-in is available when an administrator enables **Settings → Server → Sign-in & access → Allow password sign-in** (off by default). Members set or change their own password under **Your library → Password & security**. Passwords must be 12–256 characters; password managers and pasting work. The sign-in page offers **Sign in with a password** only while the method is enabled, and the server refuses direct password requests when it is disabled. Existing sessions remain signed in. The separate `AUTH_PASSWORD` shared server password and temporary emergency administrator are unchanged.

For an initial password-only setup, enable the method while signed in as the owner, open Password & security, enter the owner's email and set a password, then enable **Require sign-in**. This binds the existing owner library rather than creating another one. The email is the login name; setup does not send a verification email. A new member first joins through an invitation/verified email or an external provider, then sets a password; there is no public password-only signup form. Guests and emergency administrators cannot enrol a personal password. Keep another working sign-in method before disabling password sign-in: Frames refuses to disable the only configured way in while sign-in is required.

Password sign-in follows the existing authenticator/passkey two-factor requirements. Passwords are stored as slow salted scrypt hashes, encrypted with other server secrets, and omitted from backups and exports. Login attempts are rate limited by address and account and respect the configured human check. Changing a password requires a current password or a sign-in within the last 15 minutes, and signs out other sessions. To recover a forgotten password, sign in another way and set a new one; no separate password-reset email flow is provided. An administrator can enable an alternate method for the account. The owner can use the existing emergency recovery or `AUTH_DISABLE=true` if no other method is available.

## Two-factor authentication

Under **Password & security → Authenticator app and verification → Manage**, scan the locally generated **QR code** with an authenticator on your phone, then enter its six-digit code (refreshed every 30 seconds). A manual setup key is also available. The QR code is generated in your browser: the secret is never sent to an external QR service. Setup becomes active only after confirmation. Save the **eight recovery codes** shown once; each works once.

Passkeys count as two-factor authentication only when the server verifies a fingerprint, face or device PIN. Existing passkey sign-ins without device verification still work when enforcement is off, but cannot satisfy 2FA. An authenticator you enable voluntarily protects later personal sign-ins even when the server policy is Not enforced.

Server → Sign-in & access offers **Not enforced**, **Enforced for Admins**, and **Enforced for All Members** (including admins, excluding guests). Personal sign-in must be enabled and the administrator must enrol and verify a factor before enabling enforcement. Covered existing sessions must enrol or verify before using private APIs. An unverified primary session cannot replace an existing factor or remove the last required one.

If every factor/recovery code is lost, a verified administrator can use **Server → Members → Manage people → Manage the person → Reset two-factor authentication**, after confirming their identity. This signs out their sessions and removes their authenticator, recovery codes and passkeys, while retaining their library. The policy will require enrolment again after their next primary sign-in.

Authenticator secrets are encrypted, are not returned after setup, and are excluded from environment exports and portable backups.

## Sessions

Under **Settings → Your library → Password & security**, manage linked sign-in methods and passkeys, inspect active personal sessions and the latest 100 successful sign-ins, and sign out individual sessions. Signing out this browser returns it to sign-in; signing out another browser invalidates it on its next request. People see only their own sessions. New sign-ins record the IP address as seen by the server and the browser's user-agent; correct reverse-proxy configuration is needed for a client's original IP. Existing sessions remain usable and show “IP not recorded” / “Device not recorded”. Shared-password and automatic access do not create personal sessions. The log records successful sign-ins, not failed attempts; up to 1,000 past sign-ins are retained per account, alongside active sessions.

## Emergency administrator

Each server start can create a temporary administrator for recovery. Read its username and password from the **Docker/server console logs**, then open `/auth/emergency`:

```sh
docker logs frames | grep 'EMERGENCY LOGIN'
```

These credentials are **not retained in the app log**. The in-app viewer, plain-text downloads and ZIP downloads also redact older credential lines. They remain in Docker logs even with application logging set to Errors only.

- The temporary account is **always exempt from 2FA**, including enrolment, under every enforcement policy.
- Its password works once. Five wrong attempts void it.
- It is deleted if unused for five minutes, when signed out, or on the next restart.
- It can reset a locked-out account's security factors and does not count toward the minimum number of regular administrators.
- `EMERGENCY_LOGIN=false` prevents creation. No emergency login is created while `AUTH_DISABLE=true`, because that operator override bypasses Frames authentication and 2FA already. Restore normal protection after recovery.

Try your real provider, passkey device and authenticator on a test account before enforcing 2FA for everyone. Automated coverage uses stand-in identity providers and virtual WebAuthn devices.

## Sign-in page

`/auth/signin` redirects to `/signin`, preserving the return address, guest mode and error message. Provider buttons use the same light filled style on sign-in and sign-up. The sign-in footer has one working **Privacy** link beside **Terms**. OAuth, email codes, passkeys and the shared password keep their existing flows; live third-party sign-in must be checked with your configured providers.
