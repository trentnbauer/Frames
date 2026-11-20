# Wiki draft: env file export with Cloudflare Access sign-in

For the *Environment variables* guide, under "Exporting secrets":

**Signed in through Cloudflare Access.** Turning on *Include secrets in the export* needs a sign-in from the last five minutes. If you signed in through Cloudflare Access, Frames reads that time from the Access login itself. A fresh Frames session isn't enough, because Access signs you back into Frames by itself. If Access signed you in longer ago than that, Frames says so. To fix it:

1. Open `/cdn-cgi/access/logout` on Frames' address to sign out of Access.
2. Open Frames again and sign in through Access.
3. Turn the setting on within five minutes.

If you opened Frames at an address Access doesn't protect, such as a LAN address, Frames asks you to use the Access address. Earlier versions sent you through Frames' sign-in again instead, which failed with "Cloudflare Access did not pass a login to Frames" and left the setting off.
