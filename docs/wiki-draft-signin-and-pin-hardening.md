# Wiki draft: sign-in emails, linked accounts and share PINs

For publication in the wiki. Merge each section into the guide named in its heading.

## Sign-in and access: emailed codes

The links in a sign-in code email ("Open Frames", Email settings, Terms) and the server name it shows come from the **public address** in Settings, Sign-in & access. If no public address is set, Frames uses the address the browser asked for only when it is listed in `ALLOWED_HOSTS`. Otherwise the email has the code but no working links. Set the public address so these links work.

## Sign-in and access: adding another way to sign in

Finish adding an account (Settings, Security, Add another way to sign in) in the same browser you started from, while still signed in. If the provider sends you back to a different browser, or after you have signed out, Frames refuses with "Sign in first" and nothing is added.

## Sharing: PIN-locked links

After five wrong PINs, a link is locked on that device for 15 minutes. Wrong PINs are also counted per network address: after 20 wrong PINs from one address, the link is locked for everyone at that address for 15 minutes, even on a new device. Other addresses are not affected. Behind a reverse proxy, set `TRUST_PROXY` so Frames sees each visitor's own address. Otherwise all visitors share the proxy's address and count against each other.
