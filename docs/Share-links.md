# Share links

A **Share** button on every composition and photoshoot makes an address like `/s/Xk3…` that works **without the login**, so you can send photos to a client or friend. Public sharing is narrow on purpose:

- A link opens exactly one composition or photoshoot. Nothing else is reachable with it.
- Guests see only each photo's picture and title. No location, camera data, notes, descriptions or file paths.
- You choose per link whether guests can **download the originals** and/or **review and rate** them. Ratings from guests are kept apart from your own reviews and never change your ratings or schedule. You can see them under the link.
- Links can expire, and can be turned off at any time. They cannot be guessed (128 random bits), and wrong guesses are rate-limited.
- Share pages are marked not for search engines.

Anyone who has the address can use it, so treat it like a key and send it privately.

## Manage independent links

The Share modal lists all links for the selected photoshoot or composition. Choose a link in the sidebar to name it and change its own permissions, expiry, PIN and invitations. **+ New link** opens a fresh draft and **Create link** adds it without replacing existing addresses. **Replace address** invalidates only the selected address after confirmation; **Stop this link** stops only that link. Stopped and expired links remain visible and can be explicitly reactivated (an expired link gets a new three-week expiry). On phones the link list sits above the settings. Names save on blur; other settings save immediately.

## Permissions and scope

Photoshoot and composition sharing use the same dialog. Choose permissions, expiry, name and optional PIN before **Create link**; existing links can be copied, previewed, updated, regenerated or stopped. Photoshoots offer ratings and downloads; compositions also offer suggestions and wall-only viewing. Composition guest suggestions do not change the owner’s wall until approved. Only the wall excludes unselected candidates even when the wall is empty.

See [Composition arrangements](Composition-arrangements) for sharing a pinned version.

## PIN-locked links

After five wrong PINs, a link is locked on that device for 15 minutes. Wrong PINs are also counted per network address: after 20 wrong PINs from one address, the link is locked for everyone at that address for 15 minutes, even on a new device. Other addresses are not affected. Behind a reverse proxy, set `TRUST_PROXY` so Frames sees each visitor's own address. Otherwise all visitors share the proxy's address and count against each other.
